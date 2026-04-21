import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-01-27' as any,
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export class BillingController {
  /**
   * POST /v1/billing/checkout
   * Cria uma sessão de checkout para assinatura de plano
   */
  public static async createCheckoutSession(req: Request, res: Response) {
    const { priceId } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId || !priceId) {
      return res.status(400).json({ error: 'Tenant ou Plano não identificado.' });
    }

    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId ?? undefined } });
      if (!tenant) throw new Error('Tenant não encontrado');

      const session = await stripe.checkout.sessions.create({
        customer: tenant.stripeCustomerId || undefined,
        customer_email: tenant.stripeCustomerId ? undefined : req.user?.email,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${APP_URL}/?section=billing&success=true`,
        cancel_url: `${APP_URL}/?section=billing&canceled=true`,
        metadata: { tenantId },
        subscription_data: {
          metadata: { tenantId }
        }
      });

      return res.json({ url: session.url });
    } catch (err: any) {
      console.error('[Stripe] Erro ao criar checkout:', err);
      return res.status(500).json({ error: 'Erro ao processar checkout.' });
    }
  }

  /**
   * POST /v1/billing/buy-proofs
   * Compra de pacotes de provas avulsas (Top-up)
   */
  public static async buyProofsSession(req: Request, res: Response) {
    const { priceId, proofsAmount } = req.body;
    const tenantId = req.user?.tenantId;

    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId ?? undefined } });
      
      const session = await stripe.checkout.sessions.create({
        customer: tenant?.stripeCustomerId || undefined,
        customer_email: tenant?.stripeCustomerId ? undefined : req.user?.email,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: `${APP_URL}/?section=billing&success=proofs`,
        cancel_url: `${APP_URL}/?section=billing&canceled=true`,
        metadata: { 
            tenantId: tenantId ?? '',
            type: 'topup',
            proofs: proofsAmount
        }
      });

      return res.json({ url: session.url });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar sessão de provas.' });
    }
  }

  /**
   * POST /v1/billing/portal
   * Redireciona para o Stripe Customer Portal
   */
  public static async createPortalSession(req: Request, res: Response) {
    const tenantId = req.user?.tenantId;

    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId ?? undefined } });
      if (!tenant?.stripeCustomerId) {
        return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada.' });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: `${APP_URL}/?section=billing`,
      });

      return res.json({ url: session.url });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao abrir portal de pagamentos.' });
    }
  }

  /**
   * POST /v1/billing/webhook
   * Handler principal de eventos do Stripe
   */
  public static async handleWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret || '');
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          const tenantId = session.metadata?.tenantId;
          const customerId = session.customer as string;

          if (tenantId) {
            // Se for topup de provas
            if (session.metadata?.type === 'topup') {
                const proofs = parseInt(session.metadata.proofs);
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: { 
                        proofsBalance: { increment: proofs },
                        stripeCustomerId: customerId
                    }
                });
            } else {
                // Se for assinatura inicial
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: { stripeCustomerId: customerId }
                });
            }
          }
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription as string;
          
          if (subscriptionId) {
            const tenant = await prisma.tenant.findUnique({
              where: { stripeSubscriptionId: subscriptionId }
            });

            if (tenant) {
              const monthlyLimit = BillingController.getLimitFromPlan(tenant.plan);
              
              await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                  proofsUsedThisMonth: 0,
                  proofsBalance: { increment: monthlyLimit } // Adiciona as provas do novo mês
                }
              });
            }
          }
          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.created': {
          const sub = event.data.object as any;
          const tenantId = sub.metadata.tenantId;
          
          if (tenantId) {
            // Mapeia price_id -> plan name
            const planName = BillingController.getPlanFromPrice(sub.items.data[0].price.id);
            const monthlyLimit = BillingController.getLimitFromPlan(planName);

            await prisma.tenant.update({
              where: { id: tenantId },
              data: {
                stripeSubscriptionId: sub.id,
                plan: planName,
                subscriptionStatus: sub.status,
                proofsMonthlyLimit: monthlyLimit,
                currentPeriodEnd: new Date(sub.current_period_end * 1000)
              }
            });
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as any;
          await prisma.tenant.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: { 
                subscriptionStatus: 'canceled',
                plan: 'free',
                proofsMonthlyLimit: 0
            }
          });
          break;
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error('[Stripe Webhook] Erro processando evento:', err);
      return res.status(500).json({ error: 'Falha no processamento do Webhook' });
    }
  }

  private static getPlanFromPrice(priceId: string): string {
      if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
      if (priceId === process.env.STRIPE_PRICE_GROWTH) return 'growth';
      if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
      return 'free';
  }

  private static getLimitFromPlan(plan: string): number {
      switch(plan) {
          case 'starter': return 50;
          case 'growth': return 150;
          case 'pro': return 400;
          default: return 0;
      }
  }
}
