import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import { PluginController } from '../controllers/plugin.controller';
import { HealthController } from '../controllers/health.controller';

const router = Router();

router.post('/register', PluginController.register);
router.get('/check', HealthController.check);

// Activation Hub Routes
router.get('/download', authenticateUser, PluginController.downloadPlugin);
router.get('/test-connection', authenticateUser, PluginController.testConnection);

export default router;
