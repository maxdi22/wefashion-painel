import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

/**
 * Middleware para validar assinaturas HMAC.
 * O plugin WordPress deve enviar:
 * - X-Tenant-ID
 * - X-Public-Key
 * - X-Signature (Hash HMAC-SHA256 do corpo da requisição usando a Secret Key)
 * - X-Timestamp (Para evitar replay attacks)
 */
export const validateHMAC = async (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.header('X-Tenant-ID');
  const publicKey = req.header('X-Public-Key');
  const signature = req.header('X-Signature');
  const timestamp = req.header('X-Timestamp');

  if (!tenantId || !publicKey || !signature || !timestamp) {
    return res.status(401).json({ error: 'Faltando headers de autenticação' });
  }

  // Verificar se a requisição é muito antiga (ex: > 5 minutos)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return res.status(401).json({ error: 'Assinatura expirada (Timestamp mismatch)' });
  }

  try {
    // Buscar Secret Key do Tenant no Banco de Dados
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: tenantId,
        publicKey: publicKey,
        status: 'active'
      }
    });

    if (!tenant) {
      return res.status(401).json({ error: 'Autenticação de API falhou: Tenant ou Public Key inválida' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', tenant.secretKey)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn(`[Auth HMAC] Assinatura inválida para Tenant ${tenantId}`);
      if (process.env.NODE_ENV === 'production' || process.env.STRICT_HMAC === 'true') {
        return res.status(401).json({ error: 'Assinatura inválida' });
      } else {
        console.warn(`[Auth HMAC] Bypassing HMAC validation as STRICT_HMAC is not true for Dev.`);
      }
    }

    // Pendura o tenant na request para ser usado pelos controllers
    req.tenant = tenant;

    next();
  } catch (error) {
    console.error('[Auth HMAC] Erro interno:', error);
    return res.status(500).json({ error: 'Erro interno ao validar API HMAC' });
  }
};

/**
 * Middleware para validar chamadas públicas do front-end.
 * O front-end envia apenas Public Key e Tenant ID, o que os torna seguros para enviar diretamente pelo JS.
 */
export const validatePublicKey = async (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.header('X-Tenant-ID');
  const publicKey = req.header('X-Public-Key');

  if (!tenantId || !publicKey) {
    return res.status(401).json({ error: 'Faltando headers de autenticação pública (Tenant-ID ou Public-Key)' });
  }

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: tenantId,
        publicKey: publicKey,
        status: 'active'
      }
    });

    if (!tenant) {
      return res.status(401).json({ error: 'Tenant ou Public Key inválida' });
    }

    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('[Auth PublicKey] Erro interno:', error);
    return res.status(500).json({ error: 'Erro interno ao validar Public Key' });
  }
};
