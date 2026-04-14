import { Router } from 'express';
import { TryOnController } from '../controllers/tryon.controller';
import { validatePublicKey } from '../middleware/auth';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Endpoints de Job (API Pública do Plugin - Chamada pelo Frontend no JS com PublicKey)
router.post('/jobs', validatePublicKey, upload.single('user_image'), TryOnController.createJob);
router.get('/jobs/:jobId', validatePublicKey, TryOnController.getJobStatus);
router.get('/jobs/:jobId/result', validatePublicKey, TryOnController.getJobResult);

// Health do provider (Público)
router.get('/health', TryOnController.healthCheck);

// Registro de Eventos (Público via PublicKey)
router.post('/events', validatePublicKey, TryOnController.logEvent);

export default router;
