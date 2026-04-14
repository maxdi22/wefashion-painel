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
      // 1. Criar Usuário no Supabase
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Erro ao criar usuário no Supabase');
      }

      const userId = authData.user.id;

      // 2. Criar Tenant
      const installToken = crypto.randomBytes(32).toString('hex');
      const publicKey = `pk_test_${crypto.randomBytes(16).toString('hex')}`;
      const secretKey = `sk_test_${crypto.randomBytes(32).toString('hex')}`;

      const tenant = await prisma.tenant.create({
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

      // 3. Criar Profile vinculado ao Tenant
      await prisma.profile.create({
        data: {
          id: userId,
          email,
          role: 'tenant_admin',
          tenantId: tenant.id
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Loja e usuário administrador criados com sucesso.',
        tenant
      });

    } catch (err: any) {
      console.error('[Admin] Erro ao criar loja:', err);
      return res.status(500).json({ error: err.message || 'Erro interno ao criar loja.' });
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
}
