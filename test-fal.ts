import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const buf = Buffer.from("Hello base64 fal storage test", "utf-8");
  // using global Blob from Node.js
  const blob = new Blob([buf], { type: 'text/plain' });
  try {
    const url = await fal.storage.upload(blob);
    console.log("Uploaded URL:", url);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

run().catch(console.error);
