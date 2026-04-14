import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    const fakeImageBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const blob1 = new Blob([fakeImageBuffer], { type: "image/png" });
    const url1 = await fal.storage.upload(blob1);
    
    // Test the exact params
    const res = await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input: {
        prompt: "[USER_IDENTITY] First image is the persona. [PRODUCT] Second image is a red shirt. Apply the shirt to the persona.",
        image_urls: [url1, url1]
      }
    });
    console.log("Success!", res);
  } catch (error: any) {
    console.error("Test failed:", error.message);
    if (error.body) console.error(JSON.stringify(error.body, null, 2));
  }
}

run().catch(console.error);
