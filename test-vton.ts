import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    const userImage = "https://v3b.fal.media/files/b/456...jpg"; // placeholder URL needed
    const productUrl = "https://v3b.fal.media/files/b/123...jpg"; // placeholder URL needed
    
    console.log("Checking fashn-vton schema...");
    
    // This is just to test if the endpoint exists and accepts these keys
    // We won't actually run it with valid URLs yet if we don't have them
    const res = await fal.queue.submit("fal-ai/fashn-vton", {
      input: {
        human_image_url: "https://example.com/human.jpg",
        garment_image_url: "https://example.com/garment.jpg",
        category: "tops"
      }
    });
    console.log("Fashn success:", res.request_id);
  } catch (error: any) {
    console.error("Fashn test:", error.message);
    if (error.body) console.error("Body:", error.body);
  }
}

run().catch(console.error);
