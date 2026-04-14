import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authenticateUser } from '../middleware/auth.middleware';
import express from 'express';

const router = Router();

// Webhook (Público, mas validado por Stripe Signature)
// Nota: Precisa do body raw no server.ts
router.post('/webhook', express.raw({ type: 'application/json' }), BillingController.handleWebhook);

// Rotas Protegidas
router.post('/checkout', authenticateUser, BillingController.createCheckoutSession);
router.post('/buy-proofs', authenticateUser, BillingController.buyProofsSession);
router.post('/portal', authenticateUser, BillingController.createPortalSession);

export default router;
