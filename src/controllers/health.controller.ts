import { Request, Response } from 'express';
import { tryonQueue } from '../queues/tryonQueue';
import { prisma } from '../lib/prisma';

export class HealthController {
  /**
   * Endpoint de Verificação de Integração
   * GET /v1/health/check
   */
  public static async check(req: Request, res: Response) {
    const results: any = {
      api_status: 'online',
      auth_status: 'valid',
      database_status: 'checking',
      job_test_status: 'checking',
      timestamp: new Date().toISOString()
    };

    try {
      // 1. Verificar DB (Prisma)
      await prisma.$queryRaw`SELECT 1`;
      results.database_status = 'connected';

      // 2. Verificar Redis / Fila de Jobs
      const isPaused = await tryonQueue.isPaused();
      results.redis_status = isPaused ? 'paused' : 'connected';
      
      // 3. Teste Automático: Criar job fake
      const testJob = await tryonQueue.add('health-test', {
        type: 'test',
        message: 'System connectivity check'
      }, {
        removeOnComplete: true,
        removeOnFail: true
      });

      let attempts = 0;
      let jobFinished = false;
      while (attempts < 4) {
        const state = await testJob.getState();
        if (state === 'completed' || state === 'active') {
          jobFinished = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      results.job_test_status = jobFinished ? 'success' : 'failed (worker not responding)';

      res.json({
        success: true,
        api_status: (results.database_status === 'connected' && jobFinished) ? 'online' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        details: results
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        api_status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    }
  }
  /**
   * Diagnostic Endpoint
   * GET /v1/health/diag
   */
  public static async diagnose(req: Request, res: Response) {
    const checkEnv = (key: string) => {
      const val = process.env[key];
      let status = 'MISSING';
      let display = '';
      
      if (val) {
        status = 'SET';
        // Mostrar os primeiros e últimos caracteres para conferir se é a chave certa
        display = val.length > 8 
          ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}`
          : '***';
      }

      return {
        key,
        status,
        display,
        length: val?.length || 0
      };
    };

    const envChecks = [
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'JWT_SECRET',
      'FAL_KEY',
      'REDIS_URL',
      'NODE_ENV'
    ].map(checkEnv);

    const results: any = {
      environment: envChecks,
      database: 'checking',
      supabase: 'checking',
      timestamp: new Date().toISOString()
    };

    try {
      // Test DB
      const dbUrl = process.env.DATABASE_URL || '';
      const hostname = dbUrl.split('@')[1]?.split(':')[0] || 'unknown';
      
      await prisma.$queryRaw`SELECT 1`;
      results.database = 'connected';
      results.db_host = hostname;
    } catch (e: any) {
      results.database = `error: ${e.message}`;
      results.prisma_code = e.code;
    }

    try {
      // Test Supabase/Prisma Profiles (simple fetch)
      const profile = await prisma.profile.findFirst({ select: { id: true } });
      results.supabase = profile ? 'connected' : 'no profiles found';
    } catch (e: any) {
      results.supabase = `error: ${e.message}`;
    }

    res.json(results);
  }
}
