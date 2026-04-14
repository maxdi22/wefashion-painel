import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';

const router = Router();

/**
 * @route POST /v1/leads/capture
 * @desc Capture a new lead from the frontend
 * @access Public (Requires API Key in some implementations, handled by Controller)
 */
router.post('/capture', LeadController.capture);

/**
 * @route GET /v1/leads
 * @desc Get leads for a tenant
 * @access Private (Authentication should be handled at the server level via middleware)
 */
router.get('/', LeadController.list);

export default router;
