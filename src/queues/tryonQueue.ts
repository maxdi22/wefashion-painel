import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/prisma';
import { FalProvider } from '../services/falProvider';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Flag para saber se estamos usando Redis real
export let isUsingRedis = false;
let connection: any = null;
let queueInstance: any = null;

try {
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 2000, // Tentar por 2 segundos
    retryStrategy: (times) => {
      if (times > 1) {
        // Se falhar mais de uma vez, desistimos do Redis no modo dev
        console.warn('⚠️ [Queue] Falha ao conectar ao Redis. Ativando modo de Fila em Memória...');
        return null; 
      }
      return 1000;
    }
  });

  connection.on('error', (err: any) => {
    if (!isUsingRedis) {
      // Silenciar erros de conexão se já sabemos que não estamos usando Redis
      return;
    }
    console.error('[Redis Error]', err.message);
  });

  connection.on('connect', () => {
    isUsingRedis = true;
    console.log('✅ [Queue] Conectado ao Redis com sucesso.');
  });

} catch (e) {
  console.warn('⚠️ [Queue] Erro ao instanciar Redis. Usando modo Mock.');
}

// Interface simplificada para a Fila
interface IQueue {
  add(name: string, data: any, opts?: any): Promise<any>;
  getJob(id: string): Promise<any>;
  isPaused(): Promise<boolean>;
}

// Mock da Fila que processa instantaneamente (ou simula)
class MemoryQueue implements IQueue {
  async add(name: string, data: any, opts?: any): Promise<any> {
    // Prioriza o jobId vindo no data (que é o ID real do Banco de Dados)
    const jobId = opts?.jobId || data.jobId || `mock_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Queue Mock] Job ${jobId} adicionado para processamento imediato.`);
    
    // Inicializar status
    (global as any).vtoResults = (global as any).vtoResults || new Map();
    (global as any).vtoResults.set(jobId, { status: 'active', result: null });
  
    // Simular processamento assíncrono para não travar o request
    this.processJob(jobId, data);
    
    return { id: jobId, data };
  }
  
    async getJob(id: string): Promise<any> {
      const results = (global as any).vtoResults || new Map();
      const jobData = results.get(id);
  
      if (!jobData) return null;
  
      return {
        id,
        getState: async () => jobData.status,
        returnvalue: jobData.result,
        progress: jobData.status === 'completed' ? 100 : 50
      };
    }
  
    async isPaused(): Promise<boolean> {
      return false;
    }
  
    private async processJob(jobId: string, data: any) {
      try {
        console.log(`[Worker Mock] Iniciando Job ${jobId} para ${data.productType}...`);
        
        // 1. Submeter à Fal.ai
        await prisma.tryOnLog.create({
          data: {
             jobId,
             tenantId: data.tenantId,
             action: 'submitting_to_fal',
             message: `Iniciando submissão para Fal.ai (Nano Banana).`,
             payload: JSON.stringify({ 
               userImageUrl: data.userImageUrl, 
               productImageUrl: data.productImageUrl,
               optimizedImageUrl: data.optimizedImageUrl,
               hasOptimizedImage: data.hasOptimizedImage,
               productType: data.productType,
               garmentMeta: data.garmentMeta
             })
          }
        });

        // 1. Processar via IA (Submissão + Espera incorporada no runTryOn)
        const result = await FalProvider.runTryOn(
          data.userImageUrl,
          data.optimizedImageUrl || data.productImageUrl,
          data.productType,
          data.measurements,
          data.garmentMeta,
          data.hasOptimizedImage
        );

        // 2. Persistir resultado final
        const resultImageUrl = result.images?.[0]?.url;

        await prisma.tryOnJob.update({
          where: { id: jobId },
          data: { 
            resultImageUrl,
            status: 'done',
            promptUsed: result.prompt,
            falRequestId: result.requestId
          }
        });

        await prisma.tryOnLog.create({
          data: {
             jobId,
             tenantId: data.tenantId,
             action: 'result_ready',
             message: 'Geração concluída com sucesso.',
             payload: JSON.stringify({ resultImageUrl })
          }
        });

        (global as any).vtoResults.set(jobId, {
          status: 'completed',
          result: { resultUrl: resultImageUrl }
        });

        console.log(`[Worker Mock] Job ${jobId} CONCLUÍDO.`);
      } catch (err: any) {
        console.error(`[Worker Mock] Job ${jobId} FALHOU:`, err.message);
        
        await prisma.tryOnJob.update({
          where: { id: jobId },
          data: { 
            status: 'error',
            errorDetail: err.message
          }
        });

        await prisma.tryOnLog.create({
          data: {
             jobId,
             tenantId: data.tenantId,
             level: 'error',
             action: 'job_failed',
             message: err.message
          }
        });
      }
    }
  }
  
  // Exportar a instância correta
  export const tryonQueue = isUsingRedis 
    ? new Queue('tryon-jobs', { connection }) 
    : new MemoryQueue();
  
  export const setupWorker = () => {
    if (!isUsingRedis) {
      console.log('🚀 [Worker] Rodando em modo de processamento interno (Sem Redis).');
      return;
    }
  
    const worker = new Worker(
      'tryon-jobs',
      async (job: Job) => {
        const { userImageUrl, productImageUrl, optimizedImageUrl, hasOptimizedImage, productType, measurements, garmentMeta, tenantId, jobId } = job.data;
        const localJobId = jobId || job.id;
        
        console.log(`[Worker] Processando Job ${localJobId} para Tenant ${tenantId}`);
        
        // Simplesmente redirecionar para a lógica unificada
        try {
          // 1. Processar via IA (Submissão + Espera)
          const result = await FalProvider.runTryOn(
            userImageUrl,
            optimizedImageUrl || productImageUrl,
            productType,
            measurements,
            garmentMeta,
            hasOptimizedImage
          );

          const resultImageUrl = result.images?.[0]?.url;

          // 2. Finalizar
          await prisma.tryOnJob.update({
            where: { id: localJobId },
            data: { 
              resultImageUrl, 
              status: 'done',
              promptUsed: result.prompt,
              falRequestId: result.requestId
            }
          });

          return { status: 'completed', resultUrl: resultImageUrl };

        } catch (error: any) {
          await prisma.tryOnJob.update({
            where: { id: localJobId },
            data: { status: 'error', errorDetail: error.message }
          });
          throw error;
        }
      },
      { connection }
    );
  
    worker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completo.`));
    worker.on('failed', (job, err) => console.error(`[Worker] Job ${job?.id} falhou:`, err.message));
  };
