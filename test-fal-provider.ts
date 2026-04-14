import { FalProvider } from "./src/services/falProvider";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    // A fake picture locally to test transformToPublicUrl:
    const localUrl = "http://localhost:3000"; // Note: downloading this via axios arraybuffer might fail as it's not an image, let's just make it throw safely or try a real local image. Actually, I'll pass a real public image to make sure the provider works end-to-end.
    
    // Instead of using a local invalid URL that fails, let's pass a real external URL to test FalProvider's assembly
    console.log("Submitting job through FalProvider...");
    const job = await FalProvider.submitTryOnJob(
      "https://v3b.fal.media/files/b/0a95e6a7/rufLtoJsox24R-Wotxjsl_1775960684260.plain", // user image
      "https://v3b.fal.media/files/b/46b4122d/jKjP-KxIol22jN_2PklR2_1775960920401.plain", // outfit image
      "top",
      { height: "168" }
    );
    console.log("Job Submitted Successfully!", job);

  } catch (err: any) {
    console.error("Test Error:", err.message);
  }
}

run().catch(console.error);
