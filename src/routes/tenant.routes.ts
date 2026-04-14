import { Router } from 'express';
import { TenantController } from '../controllers/tenant.controller';
import { PluginController } from '../controllers/plugin.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Proteção Básica de autenticação para as rotas da Loja
router.use(authenticateUser);

router.post('/install-token/regenerate', TenantController.regenerateInstallToken);
router.patch('/', TenantController.updateProfile);
router.get('/plugin/download', PluginController.downloadPlugin);
router.get('/plugin/test', PluginController.testConnection);

export default router;
