import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export class TenantController {
  public static async regenerateInstallToken(req: Request, res: Response) {
    if (!req.user || !req.user.tenantId) {
      return res.status(403).json({ error: 'Acesso negado. Usuário não possui uma Loja associada.' });
    }

    try {
      const tenantId = req.user.tenantId;
      const newToken = crypto.randomBytes(32).toString('hex');
      
      const t = await prisma.tenant.update({
        where: { id: tenantId },
        data: { installToken: newToken }
      });

      return res.json({ success: true, installToken: t.installToken });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao gerar novo Install Token.' });
    }
  }

  public static async updateProfile(req: Request, res: Response) {
    if (!req.user || !req.user.tenantId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    try {
      const { name, domain } = req.body;
      const tenantId = req.user.tenantId;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { 
          name,
          domain
        }
      });

      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar perfil.' });
    }
  }
}
