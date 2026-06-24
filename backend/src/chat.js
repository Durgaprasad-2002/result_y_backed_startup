import axios from "axios";
import { extractUrl, readProductPage } from "./product.js";
import { generateUgcVideo } from "./videoGenerator.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function handleChatTurn({ message, conversation, history }) {
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

  const pageData = await readProductPage(url);
  const script = await generateScriptWithGemini(message, pageData);
  const video = await generateUgcVideo({
    conversationId: conversation.id,
    pageData,
    script,
  });

  return {
    content: `I made a short UGC-style video for ${script.product_name}. ${script.scenes[0].on_screen_text}\n\n${video.publicUrl}`,
    video,
  };
}

async function conversationalReply(message, history) {
  const fallback =
    "Hey! Send me a product URL and I’ll turn it into a punchy little UGC video.";
  if (!GEMINI_API_KEY) return fallback;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const systemPrompt =
      "You are a concise, friendly assistant inside a UGC video generator. Reply naturally. If asked what you do, say you can generate UGC videos from product URLs.";

    const contents = [
      ...history.slice(-8).map((item) => ({
        role: item.role === "USER" ? "user" : "model",
        parts: [{ text: item.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await axios.post(url, {
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 220 },
    });

    return (
      response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      fallback
    );
  } catch (err) {
    console.error("Gemini conversational error:", err.message);
    return fallback;
  }
}

async function generateScriptWithGemini(userMessage, pageData) {
  const systemPrompt = `You are a UGC (user-generated content) video script writer.
You will be given a user's request and scraped data from a product/landing page.
Analyze the product and write a short, casual, authentic-sounding UGC ad script.

Respond ONLY with valid JSON (no markdown fences, no preamble), matching this schema:
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1500,
        responseMimeType: "application/json",
      },
    },
    { headers: { "Content-Type": "application/json" } },
  );

  const raw = response.data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .join("\n")
    .trim();

  if (!raw) {
    throw new Error("Gemini returned no text content");
  }

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}
