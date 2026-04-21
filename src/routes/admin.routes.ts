import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Proteção dupla de Middlewares (mesmo o principal já validando)
router.use(authenticateUser);

router.use((req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acesso restrito a Super Administradores' });
  }
  next();
});

router.post('/tenants', AdminController.createTenant);
router.patch('/tenants/:id', AdminController.updateTenant);
router.patch('/tenants/:id/credentials', AdminController.updateTenantCredentials);
router.post('/tenants/:id/reset-password', AdminController.sendResetPasswordEmail);
router.post('/marketing/test-email', AdminController.sendMarketingTest);

export default router;
