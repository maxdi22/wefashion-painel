import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { EmailService, EmailTemplateId } from '../services/emailService';

export class AdminController {
  /**
   * API: Criar nova Loja e Usuário default
   * POST /v1/admin/tenants
   */
  public static async createTenant(req: Request, res: Response) {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, E-mail e Senha são obrigatórios.' });
    }

    try {
      // 1. Verificação prévia: evitar duplicidade no banco local antes de tocar no Supabase
      const existingProfile = await prisma.profile.findUnique({
        where: { email }
      });

      if (existingProfile) {
        return res.status(400).json({ error: 'Este e-mail já está registrado em nossa base de dados.' });
      }

      // Variável para controle de rollback
      let authUserId: string | null = null;

      try {
        // 2. Criar Usuário no Supabase
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });

        if (authError || !authData.user) {
          // Se o erro for "User already registered", tratamos especificamente
          if (authError?.message?.includes('already registered')) {
            return res.status(400).json({ 
              error: 'Usuário já existe no provedor de autenticação (Supabase). Se ele não aparece na lista de Lojas, pode ser uma conta órfã que precisa de limpeza manual.' 
            });
          }
          throw new Error(authError?.message || 'Erro ao criar usuário no Supabase');
        }

        authUserId = authData.user.id;

        // 3. Executar Transação no Prisma (Tenant + Profile)
        const result = await prisma.$transaction(async (tx) => {
          const installToken = crypto.randomBytes(32).toString('hex');
          const publicKey = `pk_test_${crypto.randomBytes(16).toString('hex')}`;
          const secretKey = `sk_test_${crypto.randomBytes(32).toString('hex')}`;

          const newTenant = await tx.tenant.create({
            data: {
              name,
              domain: 'Localhost/Teste',
              installToken,
              publicKey,
              secretKey,
              status: 'active',
              plan: 'trial'
            }
          });

          const newProfile = await tx.profile.upsert({
            where: { id: authUserId! },
            update: {
              tenantId: newTenant.id,
              role: 'tenant_admin'
            },
            create: {
              id: authUserId!,
              email,
              role: 'tenant_admin',
              tenantId: newTenant.id
            }
          });

          return { tenant: newTenant, profile: newProfile };
        });

        return res.status(201).json({
          success: true,
          message: 'Loja e usuário administrador criados com sucesso.',
          tenant: result.tenant
        });

      } catch (innerError: any) {
        // ROLLBACK: Se o Prisma falhou, deletamos o usuário que acabamos de criar no Supabase
        if (authUserId) {
          console.warn(`[Admin] Falha no Prisma. Iniciando rollback do usuário Supabase: ${authUserId}`);
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
        }
        throw innerError;
      }

    } catch (err: any) {
      console.error('[Admin] Erro crítico ao criar loja:', err);
      
      // Tratamento de erros de conexão com DB (P1001)
      if (err.message?.includes('P1001') || err.message?.includes('database server')) {
        return res.status(503).json({ 
          error: 'Banco de dados temporariamente indisponível. O usuário no Supabase foi removido para garantir a consistência.',
          debug: err.message
        });
      }

      return res.status(500).json({ error: err.message || 'Erro interno ao criar loja.' });
    }
  }

  /**
   * API: Atualizar dados de uma Loja (Plano, Saldo, Status)
   * PATCH /v1/admin/tenants/:id
   */
  public static async updateTenant(req: Request, res: Response) {
    const { id } = req.params;
    const { plan, proofsBalance, proofsMonthlyLimit, status } = req.body;

    try {
      const updatedTenant = await prisma.tenant.update({
        where: { id },
        data: {
          ...(plan && { 
            plan,
            subscriptionStatus: plan !== 'free' ? 'active' : 'none'
          }),
          ...(proofsBalance !== undefined && { proofsBalance: Number(proofsBalance) }),
          ...(proofsMonthlyLimit !== undefined && { proofsMonthlyLimit: Number(proofsMonthlyLimit) }),
          ...(status && { status })
        }
      });

      return res.json({
        success: true,
        message: 'Loja atualizada com sucesso.',
        tenant: updatedTenant
      });
    } catch (err: any) {
      console.error('[Admin] Erro ao atualizar loja:', err);
      return res.status(500).json({ error: err.message || 'Erro ao atualizar dados da loja.' });
    }
  }

  /**
   * API: Enviar E-mail de Teste de Marketing
   * POST /v1/admin/marketing/test-email
   */
  public static async sendMarketingTest(req: Request, res: Response) {
    const { to, templateId } = req.body;

    if (!to || !templateId) {
      return res.status(400).json({ error: 'E-mail de destino (to) e ID do template são obrigatórios.' });
    }

    try {
      // Dados dummy para o teste
      const mockData = {
        name: 'Membro WeFashion',
        planName: 'Digital Atelier Growth',
        credits: 500,
        bonusAmount: 50,
        loginUrl: 'https://painel.wefashion.marketing'
      };

      await EmailService.sendTemplatedEmail(to, templateId as EmailTemplateId, mockData);

      return res.json({
        success: true,
        message: `E-mail de teste (${templateId}) enviado com sucesso para ${to}.`
      });
    } catch (err: any) {
      console.error('[Admin] Erro ao enviar e-mail de teste:', err);
      return res.status(500).json({ error: err.message || 'Erro ao disparar e-mail de teste.' });
    }
  }

  /**
   * API: Atualizar Credenciais do Tenant (E-mail/Senha)
   * PATCH /v1/admin/tenants/:id/credentials
   */
  public static async updateTenantCredentials(req: Request, res: Response) {
    const { id } = req.params;
    const { email: newEmail, password: newPassword } = req.body;

    try {
      // 1. Encontrar o perfil associado ao tenant
      const profile = await prisma.profile.findFirst({
        where: { tenantId: id }
      });

      if (!profile) {
        return res.status(404).json({ error: 'Nenhum usuário encontrado para esta loja.' });
      }

      const updatePayload: any = {};
      if (newEmail) updatePayload.email = newEmail;
      if (newPassword) updatePayload.password = newPassword;

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: 'Nenhum dado informado para atualização.' });
      }

      // 2. Atualizar no Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.id,
        updatePayload
      );

      if (authError) {
        throw new Error(`Erro no Supabase Auth: ${authError.message}`);
      }

      // 3. Atualizar no Prisma se o e-mail mudou e o auth foi sucesso
      if (newEmail) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { email: newEmail }
        });
      }

      return res.json({
        success: true,
        message: 'Credenciais atualizadas com sucesso.',
        user: authData.user
      });

    } catch (err: any) {
      console.error('[Admin] Erro ao atualizar credenciais:', err);
      return res.status(500).json({ error: err.message || 'Erro interno ao atualizar credenciais.' });
    }
  }

  /**
   * API: Enviar E-mail de Recuperação de Senha via Resend
   * POST /v1/admin/tenants/:id/reset-password
   */
  public static async sendResetPasswordEmail(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const profile = await prisma.profile.findFirst({
        where: { tenantId: id }
      });

      if (!profile) {
        return res.status(404).json({ error: 'Nenhum usuário encontrado para esta loja.' });
      }

      // 1. Gerar link de recuperação via Supabase
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: profile.email,
        options: {
          redirectTo: `${process.env.APP_URL}/login`
        }
      });

      if (linkError) {
        throw new Error(`Erro ao gerar link no Supabase: ${linkError.message}`);
      }

      // 2. Enviar via Resend
      await EmailService.sendTemplatedEmail(profile.email, 'PASSWORD_RESET', {
        resetLink: linkData.properties.action_link
      });

      return res.json({
        success: true,
        message: `E-mail de recuperação enviado para ${profile.email}.`
      });

    } catch (err: any) {
      console.error('[Admin] Erro ao enviar recuperação:', err);
      return res.status(500).json({ error: err.message || 'Erro ao enviar e-mail de recuperação.' });
    }
  }
}
