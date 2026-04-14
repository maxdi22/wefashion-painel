/**
 * Prompt Engine para o Virtual Try-On
 * Monta o prompt modularmente seguindo as diretrizes de blocos solicitadas.
 */

interface PromptInput {
  productType: string;
  measurements?: any;
  userDescription?: string;
  stylePreferences?: string;
  garmentMeta?: {
    category?: string;
    scope?: string;
    length?: string;
    fit?: string;
    notes?: string;
  };
  hasOptimizedImage?: boolean;
}

export class PromptEngine {
  private static readonly BLOCKS = {
    USER_ANALYSIS: "IMAGE 1 is the lead person (identity). Analyze facial features, skin tone, hair texture, and body type precisely. MANDATORY: The generated body must match the facial structure and perceived body type from the input image (IMAGE 1). Preserve their unique identity.",
    SCENE_REFERENCE: (input: PromptInput) => {
      if (input.hasOptimizedImage) {
        return "IMAGE 2 is a clean garment-only image (studio/optimized). Focus strictly on extracting all physical details, textures, and patterns from this item.";
      }
      return "IMAGE 2 is the product image and original scene. Use this background as the environment. Preserve all scenery, props, and overall composition.";
    },
    MODEL_REPLACEMENT: (input: PromptInput) => {
      if (input.hasOptimizedImage) {
        return "The garment from IMAGE 2 must be seamlessly placed onto the lead person from IMAGE 1. Position it naturally as if they were wearing it.";
      }
      return "Completely remove the original model from IMAGE 2. Replace her with the lead person from IMAGE 1, placing the new person in the exact same position and perspective.";
    },
    BODY_RECONSTRUCTION: (input: PromptInput) => {
      const scope = input.garmentMeta?.scope || 'full_body';
      
      if (scope === 'upper_body') {
        return "Reconstruct the person's body from the waist up. Ensure natural proportions. The focus is on the upper torso and arms.";
      } else if (scope === 'lower_body') {
        return "Reconstruct the person's full body with a focus on hips and legs. Apply a high-end neutral minimal white top/shirt to complete the look if necessary.";
      } else {
        return "Reconstruct the person's entire full body. Ensure full body consistency with the face. Avoid unrealistic slim body if the face indicates a fuller body type. Maintain natural proportions and realistic curves consistent with the user's perceived biotipo from IMAGE 1.";
      }
    },
    GARMENT_APPLICATION: (input: PromptInput) => {
      const { category, length, fit, notes } = input.garmentMeta || {};
      const type = category || input.productType || 'clothing item';
      
      let base = `Identify the ${type} from IMAGE 2. Seamlessly apply this exact piece onto the new person.`;
      
      if (length) base += ` Maintain the ${length} length.`;
      if (fit) base += ` Ensure a ${fit} fit.`;
      if (notes) base += ` Details to preserve: ${notes}.`;

      base += " Fabric texture, realistic folds, and physical draping must match the pose and lighting of the environment.";
      
      if (input.hasOptimizedImage) {
        base += " Since IMAGE 2 is an optimized garment shot, prioritize exact color and fabric detail over the original silhouette in the photo.";
      }
      
      return base;
    },
    ENVIRONMENT_SYNC: "Apply the same lighting, shadows, and color grading from IMAGE 2 onto the new person. The result must look like an original high-end editorial brand campaign photograph, not a composite.",
    OUTPUT_FORMAT: "Hyper-realistic, photorealistic, 8k resolution, editorial style. NO signs of mounting. Generate ONLY ONE final image."
  };

  /**
   * Constrói o prompt final combinando os blocos conforme as novas regras de realismo
   */
  public static buildPrompt(input: PromptInput): string {
    const parts = [
      `[CONCEPT] System: Use IMAGE 2 as environment. Replace model with IMAGE 1.`,
      `[USER_ANALYSIS] ${this.BLOCKS.USER_ANALYSIS}`,
      `[SCENE_REFERENCE] ${this.BLOCKS.SCENE_REFERENCE(input)}`,
      `[MODEL_REPLACEMENT] ${this.BLOCKS.MODEL_REPLACEMENT(input)}`,
      `[BODY_RECONSTRUCTION] ${this.BLOCKS.BODY_RECONSTRUCTION(input)}`,
      `[GARMENT_APPLICATION] ${this.BLOCKS.GARMENT_APPLICATION(input)}`,
      `[ENVIRONMENT_SYNC] ${this.BLOCKS.ENVIRONMENT_SYNC}`,
      `[OUTPUT_FORMAT] ${this.BLOCKS.OUTPUT_FORMAT}`
    ];

    if (input.measurements) {
      parts.push(`[PROPORTIONS] Align new person based on original model position. Respect scale and perspective.`);
    }

    return parts.join("\n\n");
  }

  /**
   * Prompt negativo para evitar defeitos comuns
   */
  public static buildNegativePrompt(): string {
    return "distorted face, extra fingers, low resolution, artifacts, cartoonish, inaccurate skin tone, floating clothes, bad anatomy, altered background, visible seams, studio background (unless requested).";
  }
}
