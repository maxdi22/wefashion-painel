import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
dotenv.config();

async function test() {
  const MODEL_ID = "fal-ai/nano-banana-2/edit";
  const payload = {
    prompt: "A person wearing a sweater, high-end fashion photography",
    image_urls: [
        "https://v3b.fal.media/files/b/0a95e7e7/6gMHAIQJrRec4-hHW3aQ1_1775963882943.jpeg",
        "https://v3b.fal.media/files/b/0a95e7e7/OEiBnN_dJtdPtduln0hUu_1775963884540.octet"
    ],
    num_images: 1,
    aspect_ratio: "9:16",
    output_format: "png",
    safety_tolerance: "4",
    resolution: "1K",
    limit_generations: true
  };

  try {
    console.log("Starting subscribe test...");
    const result = await fal.subscribe(MODEL_ID, {
      input: payload,
      logs: true
    });
    console.log("RAW RESULT KEYS:", Object.keys(result));
    console.log("RAW RESULT:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Test Error:", err.message);
  }
}

test();
