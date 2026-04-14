import { Resend } from 'resend';

export type EmailTemplateId = 'WELCOME' | 'PAYMENT_APPROVED' | 'REWARDS' | 'SUPPORT_CHECK';

export class EmailService {
  private static resend = new Resend(process.env.RESEND_API_KEY);

  private static getTemplate(templateId: EmailTemplateId, data: any) {
    const commonStyles = `
      font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #ffffff;
    `;

    const footer = `
      <hr style="border: 0; border-top: 1px solid #eee; margin: 40px 0;" />
      <p style="font-size: 11px; color: #999; text-align: center; text-transform: uppercase; letter-spacing: 2px;">
        Enviado por <strong>WeFashion AI</strong> | Digital Atelier
      </p>
    `;

    switch (templateId) {
      case 'WELCOME':
        return {
          subject: 'Bem-vindo ao atelier digital WeFashion AI ✨',
          html: `
            <div style="${commonStyles}">
              <h1 style="color: #111; font-size: 42px; tracking: -2px; margin-bottom: 24px;">Olá, ${data.name || 'Fashionista'}!</h1>
              <p style="font-size: 16px; color: #444; line-height: 1.6;">Estamos muito felizes em ter você conosco. Sua conta foi criada com sucesso e você já pode começar a revolucionar a experiência de compra da sua loja.</p>
              <div style="margin-top: 40px; text-align: center;">
                <a href="${data.loginUrl || '#'}" style="background: #111; color: #fff; padding: 18px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Acessar Meu Painel</a>
              </div>
              ${footer}
            </div>
          `
        };
      case 'PAYMENT_APPROVED':
        return {
          subject: 'Sua assinatura premium está ativa! 💎',
          html: `
            <div style="${commonStyles}">
              <div style="background: #f8f8f8; padding: 12px 20px; border-radius: 100px; display: inline-block; margin-bottom: 20px;">
                <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #555;">Status: Aprovado</span>
              </div>
              <h1 style="color: #111; font-size: 32px; margin-bottom: 16px;">Pagamento Confirmado.</h1>
              <p style="font-size: 16px; color: #444; line-height: 1.6;">Obrigado por confiar na WeFashion. Seu plano <strong>${data.planName || 'Digital Atelier'}</strong> já está ativo e seus créditos foram renovados.</p>
              <div style="background: #111; color: #fff; padding: 30px; border-radius: 20px; margin: 30px 0; text-align: center;">
                <p style="font-size: 12px; opacity: 0.6; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Créditos Disponíveis</p>
                <p style="font-size: 42px; font-weight: 800; margin: 0;">${data.credits || '0'}</p>
              </div>
              ${footer}
            </div>
          `
        };
      case 'REWARDS':
        return {
          subject: 'Parabéns! Você ganhou um bônus de créditos 🎁',
          html: `
            <div style="${commonStyles}">
              <h1 style="color: #111; font-size: 32px;">Surpresa para você!</h1>
              <p style="font-size: 16px; color: #444;">Como agradecimento pela sua parceria, adicionamos <strong>${data.bonusAmount || '50'} créditos</strong> extras na sua conta.</p>
              <p style="font-size: 14px; color: #666; font-style: italic;">Continue criando looks incríveis com nosso motor de IA.</p>
              ${footer}
            </div>
          `
        };
      case 'SUPPORT_CHECK':
        return {
          subject: 'Está curtindo a experiência WeFashion? 👋',
          html: `
            <div style="${commonStyles}">
              <h1 style="color: #111; font-size: 28px;">Olá, como vai?</h1>
              <p style="font-size: 16px; color: #444;">Vimos que você usou o provador recentemente. Alguma dúvida sobre a integração ou resultados?</p>
              <p style="font-size: 16px; color: #444;">Nossa equipe de especialistas está à disposição para ajudar você a bater metas de conversão.</p>
              <div style="margin-top: 30px;">
                <a href="mailto:suporte@wefashion.marketing" style="color: #111; font-weight: 800; text-decoration: underline;">Falar com o Suporte</a>
              </div>
              ${footer}
            </div>
          `
        };
      default:
        throw new Error('Template não encontrado');
    }
  }

  /**
   * Sends a templated email using Resend SDK
   */
  static async sendTemplatedEmail(to: string, templateId: EmailTemplateId, data: any = {}) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[EmailService] RESEND_API_KEY not found. Skipping email.');
      return;
    }

    try {
      const template = this.getTemplate(templateId, data);
      
      const { data: resData, error } = await this.resend.emails.send({
        from: 'WeFashion AI <comunicacao@wefashion.marketing>',
        to: [to],
        subject: template.subject,
        html: template.html,
      });

      if (error) throw error;

      console.log(`[EmailService] Templated email (${templateId}) sent to ${to}:`, resData?.id);
      return resData;
    } catch (error: any) {
      console.error(`[EmailService] Error sending templated email (${templateId}):`, error.message);
      throw error;
    }
  }

  /**
   * Original method for lead looks (kept for backward compatibility)
   */
  static async sendLeadEmail(to: string, imageUrl: string, productUrl: string) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[EmailService] RESEND_API_KEY not found. Skipping email.');
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: 'WeFashion AI <looks@wefashion.marketing>',
        to: [to],
        subject: 'Seu look está pronto ✨',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #111;">Seu look está pronto!</h2>
            <p>Olha como você ficou incrível com a peça da nossa loja.</p>
            
            <div style="margin: 30px 0; text-align: center;">
              <img src="${imageUrl}" alt="Seu Look" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${productUrl}" style="background: #111; color: #fff; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver Produto na Loja</a>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #eee; margin: 40px 0;" />
            <p style="font-size: 12px; color: #666; text-align: center;">Enviado por WeFashion AI</p>
          </div>
        `,
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('[EmailService] Error sending lead email:', error.message);
      throw error;
    }
  }
}
