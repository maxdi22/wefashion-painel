import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    const userImage = "https://v3b.fal.media/files/b/0a95e6a7/rufLtoJsox24R-Wotxjsl_1775960684260.plain"; // dummy
    const productUrl = "https://v3b.fal.media/files/b/0a95e6a7/rufLtoJsox24R-Wotxjsl_1775960684260.plain"; // dummy
    
    console.log("Testing nano-banana-2 input schema...");
    
    // Attempt with image_urls as a single field
    const res1 = await fal.queue.submit("fal-ai/nano-banana-2/edit", {
      input: {
        prompt: "test",
        image_urls: [userImage]
      }
    });
    console.log("Method 1 (image_urls) submitted:", res1.request_id);

    // Attempt with just image
    const res2 = await fal.queue.submit("fal-ai/nano-banana-2/edit", {
      input: {
        prompt: "test",
        image: userImage
      }
    });
    console.log("Method 2 (image) submitted:", res2.request_id);

  } catch (error: any) {
    console.error("Schema test failed:", error.message);
    if (error.body) console.error("Body:", error.body);
  }
}

run().catch(console.error);
