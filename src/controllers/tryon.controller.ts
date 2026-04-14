import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { tryonQueue } from '../queues/tryonQueue';
import { FalProvider } from '../services/falProvider';
import { StorageService } from '../services/storageService';

export class TryOnController {
  /**
   * POST /v1/tryon/jobs
   * Cria um novo job de geração
   */
  public static async createJob(req: Request, res: Response) {
    const { 
      productId, 
      productType, 
      productImageUrl, 
      optimizedImageUrl,
      hasOptimizedImage,
      measurements,
      garmentMeta
    } = req.body;
    
    const tenantId = req.tenant?.id; // Set by HMAC middleware

    let userImageUrl = req.body.userImageUrl;

    // Se houver arquivo via multer, faz upload
    if (req.file) {
      try {
        userImageUrl = await StorageService.uploadBuffer(req.file.buffer);
      } catch (uploadError) {
        return res.status(500).json({ success: false, message: 'Erro ao fazer upload da imagem do usuário' });
      }
    }

    if (!tenantId || !productId || !productType || !productImageUrl || !userImageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dados obrigatórios ausentes: tenantId, productId, productType, productImageUrl, userImageUrl' 
      });
    }

    try {
      // 1. Validar Tenant e Créditos
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      
      if (!tenant) {
        return res.status(401).json({ success: false, message: 'Tenant não encontrado ou inválido' });
      }

      // Verificação de provas
      if (tenant.proofsBalance <= 0) {
        return res.status(402).json({ 
            success: false, 
            message: 'Saldo de provas insuficiente. Faça um upgrade ou compre um pacote de provas extras no seu painel.' 
        });
      }

      // 2. Criar Job Local e Decrementar Provas em uma Transação
      const [localJob] = await prisma.$transaction([
          prisma.tryOnJob.create({
            data: {
              tenantId,
              productId: String(productId),
              productType,
              productImageUrl,
              optimizedImageUrl: optimizedImageUrl || null,
              hasOptimizedImage: !!hasOptimizedImage,
              userImageUrl,
              measurements: measurements ? JSON.stringify(measurements) : null,
              garmentMeta: garmentMeta || null,
              status: 'pending'
            }
          }),
          prisma.tenant.update({
            where: { id: tenantId },
            data: {
              proofsBalance: { decrement: 1 },
              proofsUsedThisMonth: { increment: 1 }
            }
          })
      ]);

      // 3. Registrar Log Inicial
      await prisma.tryOnLog.create({
        data: {
          jobId: localJob.id,
          tenantId: tenant.id,
          action: 'submit_started',
          message: `Iniciando job para produto ${productId}`,
          payload: JSON.stringify({ productType, garmentMeta, measurements })
        }
      });

      // 4. Adicionar à Fila (BullMQ ou Memory)
      await tryonQueue.add('process-tryon', {
        jobId: localJob.id,
        tenantId,
        productId,
        productType,
        productImageUrl,
        optimizedImageUrl,
        hasOptimizedImage: !!hasOptimizedImage,
        userImageUrl,
        measurements,
        garmentMeta
      });

      return res.status(201).json({
        success: true,
        jobId: localJob.id,
        status: localJob.status
      });

    } catch (error: any) {
      console.error('[TryOn] Erro ao criar job:', error);
      return res.status(500).json({ success: false, message: `Erro interno ao processar solicitação: ${error.message}` });
    }
  }

  /**
   * GET /v1/tryon/jobs/:jobId
   * Retorna status e logs do job
   */
  public static async getJobStatus(req: Request, res: Response) {
    const { jobId } = req.params;
    const tenantId = req.tenant?.id;

    if (!tenantId) return res.status(401).json({ error: 'Não autenticado via HMAC' });

    try {
      const job = await prisma.tryOnJob.findUnique({
        where: { id: jobId },
        include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } }
      });

      if (!job) {
        return res.status(404).json({ success: false, message: 'Job não encontrado' });
      }

      // Security Check: Isolamento Multitenant
      if (job.tenantId !== tenantId) {
        return res.status(403).json({ success: false, message: 'Acesso negado a este Job' });
      }

      return res.json({
        success: true,
        jobId: job.id,
        status: job.status,
        falRequestId: job.falRequestId,
        progressMessage: job.logs[0]?.message || 'Aguardando processamento',
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Erro ao consultar status' });
    }
  }

  /**
   * GET /v1/tryon/jobs/:jobId/result
   * Retorna o resultado final da imagem
   */
  public static async getJobResult(req: Request, res: Response) {
    const { jobId } = req.params;
    const tenantId = req.tenant?.id;

    if (!tenantId) return res.status(401).json({ error: 'Não autenticado via HMAC' });

    try {
      const job = await prisma.tryOnJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        return res.status(404).json({ success: false, message: 'Job não encontrado' });
      }

      // Security Check: Isolamento Multitenant
      if (job.tenantId !== tenantId) {
        return res.status(403).json({ success: false, message: 'Acesso negado a este Job' });
      }

      if (job.status !== 'done') {
        return res.status(200).json({
          success: false,
          status: job.status,
          message: 'O job ainda não foi concluído ou falhou'
        });
      }

      return res.json({
        success: true,
        jobId: job.id,
        status: job.status,
        result_image_url: job.resultImageUrl,
        productId: job.productId
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Erro ao buscar resultado' });
    }
  }

  /**
   * GET /v1/tryon/health
   * Verifica saúde do provider
   */
  public static async healthCheck(req: Request, res: Response) {
    const isConfigured = !!process.env.FAL_KEY;
    
    return res.json({
      provider: 'fal_ai',
      status: isConfigured ? 'online' : 'unconfigured',
      configured: isConfigured
    });
  }

  /**
   * POST /v1/tryon/events
   * Registra eventos de analytics (ex: conversão)
   */
  public static async logEvent(req: Request, res: Response) {
    const { metric, value } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId) return res.status(401).json({ error: 'Não autenticado via HMAC/PublicKey' });
    if (!metric) return res.status(400).json({ error: 'Métrica não informada' });

    try {
      await prisma.analytics.create({
        data: {
          tenantId,
          metric,
          value: value || 1,
          date: new Date()
        }
      });

      return res.status(201).json({ success: true });
    } catch (error) {
      console.error('[Analytics] Erro ao registrar evento:', error);
      return res.status(500).json({ success: false });
    }
  }
}
