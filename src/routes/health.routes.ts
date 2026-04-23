import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { validateHMAC } from '../middleware/auth';

const router = Router();

// Rota de Health Check protegida por HMAC para garantir que o Auth do plugin funciona
router.get('/check', validateHMAC, HealthController.check);

// Rota de Ping pública para teste de conectividade inicial
router.get('/ping', (req, res) => res.json({ status: 'OK', success: true }));

export default router;
