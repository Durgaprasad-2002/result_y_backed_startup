import OpenAI from "openai";
import { extractUrl, readProductPage } from "./product.js";
import { generateUgcVideo } from "./videoGenerator.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const GPT_MODEL = process.env.GPT_MODEL || "gpt-4o";

export async function handleChatTurn({
  message,
  conversation,
  history,
  onProgress,
}) {
  const url = extractUrl(message);
  const asksForVideo =
    /\b(video|ugc|ad|creative|short|tiktok|reel|promo)\b/i.test(message);
  const shouldGenerate = Boolean(url) && (asksForVideo || message.length > 20);

  if (!shouldGenerate) {
    return {
      content: await conversationalReply(message, history),
      video: null,
    };
  }

  if (onProgress) onProgress({ status: "scraping", url });
  const pageData = await readProductPage(url);

  if (onProgress) onProgress({ status: "generating_script", pageData });
  const script = await generateScriptWithGPT(message, pageData);

  if (onProgress) onProgress({ status: "generating_video", script });
  const video = await generateUgcVideo({
    conversationId: conversation.id,
    pageData,
    script,
    onProgress,
  });

  return {
    content: `I made a short UGC-style video for ${script.product_name}. ${script.scenes[0].on_screen_text}\n\n${video.publicUrl}`,
    video,
  };
}

async function conversationalReply(message, history) {
  const fallback =
    "Hey! Send me a product URL and I’ll turn it into a punchy little UGC video.";
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "sk-xxxx")
    return fallback;

  try {
    const feedbackResponse = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a concise, friendly assistant inside a UGC video generator. Reply naturally. If asked what you do, say you can generate UGC videos from product URLs.",
        },
        ...history.slice(-8).map((item) => ({
          role: item.role === "USER" ? "user" : "assistant",
          content: item.content,
        })),
        { role: "user", content: message },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return feedbackResponse.choices[0].message.content.trim();
  } catch (err) {
    console.error("GPT conversational error:", err.message);
    return fallback;
  }
}

async function generateScriptWithGPT(userMessage, pageData) {
  const systemPrompt = `You are a UGC (user-generated content) video script writer.
You will be given a user's request and scraped data from a product/landing page.
Analyze the product and write a short, casual, authentic-sounding UGC ad script.

Respond ONLY with valid JSON, matching this schema:
{
  "product_name": string,
  "scenes": [
    {
      "id": "hook" | "problem" | "solution" | "demo" | "cta",
      "voiceover": string,       // 1-3 short casual sentences, spoken aloud
      "on_screen_text": string,  // short caption overlay, <=8 words
      "visual_idea": string      // what should be shown on screen
    }
  ]
}
Keep voiceover lines short — each scene should be speakable in 3-6 seconds.
Tone: relatable, casual, first-person, like a real customer talking to camera.`;

  const userPrompt = `User request: "${userMessage}"

Scraped page data:
Title: ${pageData.title}
Description: ${pageData.description}
Page text (excerpt): ${pageData.bodyText.slice(0, 3000)}
Source URL: ${pageData.sourceUrl}`;

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const raw = response.choices[0].message.content;
  return JSON.parse(raw);
}
