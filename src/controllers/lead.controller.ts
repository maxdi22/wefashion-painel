import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../services/emailService';

const prisma = new PrismaClient();

export class LeadController {
  /**
   * Captures a new lead from the Virtual Try-On flow
   */
  static async capture(req: Request, res: Response) {
    try {
      const {
        tenant_id,
        job_id,
        product_id,
        email,
        whatsapp,
        name,
        result_image_url,
        session_id,
        source = 'tryon'
      } = req.body;

      // Validation
      if (!tenant_id || !job_id || !product_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required fields: tenant_id, job_id, product_id' 
        });
      }

      if (!email && !whatsapp) {
        return res.status(400).json({ 
          success: false, 
          error: 'At least one contact method (email or whatsapp) is required' 
        });
      }

      // Check if job exists
      const job = await prisma.tryOnJob.findUnique({
        where: { id: job_id }
      });

      if (!job) {
        console.warn(`[LeadController] Job ${job_id} not found, but proceeding with lead creation.`);
      }

      // Save Lead
      const lead = await prisma.lead.create({
        data: {
          tenantId: tenant_id,
          jobId: job_id,
          productId: product_id,
          name: name || null,
          email: email || null,
          whatsapp: whatsapp || null,
          resultImageUrl: result_image_url || job?.resultImageUrl || null,
          sessionId: session_id || null,
          source: source
        }
      });

      // Log activity
      await prisma.tryOnLog.create({
        data: {
          jobId: job_id,
          tenantId: tenant_id,
          action: 'lead_captured',
          level: 'info',
          message: `Lead capturado (${name || ''} - ${email || ''} ${whatsapp || ''})`,
          payload: JSON.stringify({ lead_id: lead.id })
        }
      });

      // Trigger Email if provided
      if (email) {
        // Construct product URL - assuming standard WP structure if not provided
        // In a real scenario, this would come from the request metadata
        const productUrl = `${req.get('origin')}/?p=${product_id}`;
        
        // Wait asynchronously to not block the response
        EmailService.sendLeadEmail(
          email, 
          lead.resultImageUrl || '', 
          productUrl
        ).catch(err => console.error('[LeadController] Background email failed:', err));
      }

      return res.status(201).json({
        success: true,
        message: 'Lead captured successfully',
        lead_id: lead.id
      });

    } catch (error: any) {
      console.error('[LeadController] Error capturing lead:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  /**
   * Lists leads for a specific tenant
   */
  static async list(req: Request, res: Response) {
    try {
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id is required' });
      }

      const leads = await prisma.lead.findMany({
        where: { tenantId: String(tenant_id) },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      return res.json({
        success: true,
        leads: leads
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
