import { fal } from "@fal-ai/client";
import { PromptEngine } from "./promptEngine";

/**
 * Interface para o resultado de um job na Fal.ai
 */
interface FalResult {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  seed: number;
  has_nsfw_concepts: boolean[];
  prompt: string;
}

export class FalProvider {
  private static readonly MODEL_ID = "fal-ai/nano-banana-2/edit";

  /**
   * Submete um job de Try-On para a Fal.ai e aguarda o resultado final (.subscribe)
   * Ideal para ser usado dentro de Workers que podem esperar o tempo de geração.
   */
  public static async runTryOn(
    userImageUrl: string,
    productImageUrl: string,
    productType: string,
    measurements?: any,
    garmentMeta?: any,
    hasOptimizedImage?: boolean
  ) {
    const finalPrompt = PromptEngine.buildPrompt({
      productType,
      measurements,
      garmentMeta,
      hasOptimizedImage
    });

    console.log(`[Fal.ai] Iniciando submissão robusta (.subscribe) para ${this.MODEL_ID}...`);
    
    try {
      const { StorageService } = require('./storageService');
      const safeUserImage = await StorageService.transformToPublicUrl(userImageUrl);
      const safeProductImage = await StorageService.transformToPublicUrl(productImageUrl);

      const payload = {
        prompt: finalPrompt,
        image_urls: [safeUserImage, safeProductImage],
        num_images: 1,
        aspect_ratio: "9:16",
        output_format: "png",
        safety_tolerance: "4",
        resolution: "1K",
        limit_generations: true
      };

      console.log(`[FalAI] Submetendo prompt (${hasOptimizedImage ? 'Optimized' : 'Standard'}): ${finalPrompt.substring(0, 100)}...`);

      // .subscribe faz o submit, espera o status de conclusão e retorna o resultado final
      const result = await fal.subscribe(this.MODEL_ID, {
        input: payload,
        logs: true,
        onQueueUpdate: (update: any) => {
          console.log(`[Fal.ai] Status da Fila: ${update.status} (pos: ${update.queue_position})`);
        }
      }) as any;

      const output = result.data || result; // Fallback se structure mudar

      return {
        images: output.images || [],
        prompt: payload.prompt,
        requestId: result.requestId || 'generated_by_subscribe'
      };
    } catch (error: any) {
      console.error("[Fal.ai] Erro fatal no .subscribe():", error.message);
      if (error.body) {
        console.error("[Fal.ai] Resposta detalhada do erro:", JSON.stringify(error.body));
      }
      throw new Error(`Falha no processamento da IA (Subscribe): ${error.message}`);
    }
  }

  /**
   * Submete um job de Try-On para a Fal.ai
   */
  public static async submitTryOnJob(
    userImageUrl: string,
    productImageUrl: string,
    productType: string,
    measurements?: any,
    garmentMeta?: any
  ) {
    const finalPrompt = PromptEngine.buildPrompt({
      productType,
      measurements,
      garmentMeta
    });

    console.log(`[Fal.ai] Preparando imagens para o modelo ${this.MODEL_ID}...`);
    
    try {
      const { StorageService } = require('./storageService');
      const safeUserImage = await StorageService.transformToPublicUrl(userImageUrl);
      const safeProductImage = await StorageService.transformToPublicUrl(productImageUrl);

      const payload = {
        prompt: finalPrompt,
        image_urls: [safeUserImage, safeProductImage],
        num_images: 1,
        aspect_ratio: "9:16",
        output_format: "png",
        safety_tolerance: "4",
        resolution: "1K",
        limit_generations: true
      };

      console.log(`[Fal.ai] Payload de envio montado:`, JSON.stringify({
        ...payload,
        prompt: "..." // omitido para não poluir log
      }));

      // Usar queue.submit para processamento assíncrono
      const result = await fal.queue.submit(this.MODEL_ID, {
        input: payload
      });

      return {
        requestId: result.request_id,
        status: "submitted"
      };
    } catch (error: any) {
      console.error("[Fal.ai] Erro ao submeter job:", error.message);
      if (error.body) {
        console.error("[Fal.ai] Resposta bruta do erro:", JSON.stringify(error.body));
      }
      throw new Error(`Falha na comunicação com Fal.ai: ${error.message}`);
    }
  }

  /**
   * Consulta o status de um job na Fal.ai
   */
  public static async getJobStatus(requestId: string) {
    try {
      const status = await fal.queue.status(this.MODEL_ID, {
        requestId,
        logs: true
      });
      return status;
    } catch (error: any) {
      console.error("[Fal.ai] Erro ao consultar status:", error.message);
      return { status: "ERROR", error: error.message };
    }
  }

  /**
   * Obtém o resultado final de um job na Fal.ai
   */
  public static async getJobResult(requestId: string) {
    try {
      const result = await fal.queue.result(this.MODEL_ID, {
        requestId
      }) as any;
      return result as FalResult;
    } catch (error: any) {
      console.error("[Fal.ai] Erro ao obter resultado:", error.message);
      throw error;
    }
  }

  /**
   * Implementação legada/simplificada para compatibilidade imediata se necessário
   */
  public static async generateTryOn(
    userImage: string,
    productImage: string,
    productType: string,
    measurements?: any
  ) {
    const job = await this.submitTryOnJob(userImage, productImage, productType, measurements);
    return {
      requestId: job.requestId,
      imageUrl: null // No modo assíncrono, a imagem vem depois
    };
  }
}
