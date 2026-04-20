import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { validateHMAC } from '../middleware/auth';

const router = Router();

// Rota de Health Check protegida por HMAC para garantir que o Auth do plugin funciona
router.get('/check', validateHMAC, HealthController.check);

// Rota de Diagnóstico pública para debug de ambiente
router.get('/diag', HealthController.diagnose);

export default router;
