import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extendendo o tipo Request do Express para incluir o usuário
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        tenantId: string | null;
      };
      tenant?: any; // Para uso em rotas API auth HMAC
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_mode';

/**
 * Middleware para autenticar o usuário via JWT customizado da aplicação.
 * Suporta headers Authorization e cookies (token).
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  let token = '';

  // 1. Tentar obter do Header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } 
  // 2. Tentar obter do Cookie (para uso no navegador)
  else if (req.cookies && req.cookies['token']) {
    token = req.cookies['token'];
  }

  // Se não houver token
  if (!token) {
    if (req.accepts('html') && !req.path.startsWith('/v1/')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Autenticação necessária' });
  }

  try {
    // Validar JWT
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.user = {
      id: decoded.id,
      email: decoded.email || '',
      role: decoded.role,
      tenantId: decoded.tenantId || null
    };

    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Erro JWT:', err.message);
    if (req.accepts('html') && !req.path.startsWith('/v1/')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

/**
 * Middleware para restringir acesso baseado em papéis (RBAC).
 * Ex: requireRole(['super_admin', 'tenant_admin'])
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado: permissões insuficientes' });
    }

    next();
  };
};
