import { generateUgcVideo } from "../backend/src/videoGenerator.js";
import { prisma } from "../backend/src/prisma.js";

async function run() {
  const brief = {
    productName: "Result UGC Chat",
    audience: "Founder and marketing teams",
    hook: "POV: your AI actually knows what's trending",
    caption:
      "Stop using boring ads. Start being spectacular. It's a brat summer for your marketing.",
    overlayLines: [
      "POV: Result gets the trends",
      "very brat",
      "spectacular results",
    ],
    gifMood: "spectacular guy reaction",
    audioMood: "brat hyperpop viral beat",
  };

  const product = {
    url: "https://result-ugc.ai",
    title: "Result UGC Chat - Viral Video Generator",
    image:
      "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop",
  };

  console.log("Generating spectacular trending video...");
  const video = await generateUgcVideo({
    conversationId: "test-conv-123",
    product,
    brief,
  });

  console.log("Video generated!");
  console.log("Public URL:", video.publicUrl);
  console.log("Metadata:", JSON.stringify(video.metadata, null, 2));

  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to generate video:", err);
  process.exit(1);
});
