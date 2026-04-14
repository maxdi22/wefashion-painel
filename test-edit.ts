import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    const url = "https://v3b.fal.media/files/b/0a95e6a7/rufLtoJsox24R-Wotxjsl_1775960684260.plain";
    console.log("Starting generation...");
    const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input: {
        prompt: "A beautiful professional outfit",
        image: url
      }
    });

    console.log("Success:", result);
  } catch (error: any) {
    console.error("Error generating tryon:", error.message || error);
    if (error.body) {
        console.error("Response body:", error.body);
    }
  }
}

run().catch(console.error);
