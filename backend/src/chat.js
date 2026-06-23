import Anthropic from "@anthropic-ai/sdk";
import { extractUrl, readProductPage } from "./product.js";
import { generateUgcVideo } from "./videoGenerator.js";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

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

  const product = await readProductPage(url);
  const brief = await createCreativeBrief({ userMessage: message, product });
  const video = await generateUgcVideo({
    conversationId: conversation.id,
    product,
    brief,
  });

  return {
    content: `I made a short UGC-style video for ${brief.productName}. ${brief.caption}\n\n${video.publicUrl}`,
    video,
  };
}

async function conversationalReply(message, history) {
  const fallback = localConversation(message);
  if (!anthropic) return fallback;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 220,
      temperature: 0.7,
      system:
        "You are a concise, friendly assistant inside a UGC video generator. Reply naturally. If asked what you do, say you can generate UGC videos from product URLs.",
      messages: [
        ...history.slice(-8).map((item) => ({
          role: item.role === "USER" ? "user" : "assistant",
          content: item.content,
        })),
        { role: "user", content: message },
      ],
    });

    return response.content?.[0]?.text?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function createCreativeBrief({ userMessage, product }) {
  const fallback = localBrief(product);
  if (!anthropic) return fallback;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.9,
      system:
        "You are a trend-obsessed UGC creative director. You create viral, funny, current UGC short-form video briefs. Use trending concepts like 'Brat Summer', 'Matching my freak', 'Spectacular guy', 'Main character energy', and TikTok-style hooks. The output must be safe to render as text overlays.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a 5-10 second UGC-style marketing video brief. Use clever social-video language, not corporate ad copy.",
            userMessage,
            product,
          }),
        },
      ],
    });

    const raw = response.content?.[0]?.text || "";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    return normalizeBrief(parsed, product);
  } catch {
    return fallback;
  }
}

function localConversation(message) {
  if (/^\s*(hi|hey|hello|yo)\s*[!.]*\s*$/i.test(message)) {
    return "Hey! Send me a product URL and I’ll turn it into a punchy little UGC video.";
  }

  if (/what can you do|help|how does this work/i.test(message)) {
    return "I can generate UGC videos for you. Send me a product URL and I’ll make a short marketing video with a hook, background, audio mood, and GIF overlay.";
  }

  return "I’m here for UGC videos. Drop a product URL and I’ll assemble a short, social-style promo for it.";
}

function localBrief(product) {
  const host = product?.url
    ? new URL(product.url).hostname.replace(/^www\./, "")
    : "your product";
  const productName = product?.title?.split(/[|-]/)[0]?.trim() || host;
  return normalizeBrief(
    {
      productName,
      audience: "busy people who want the result without the friction",
      hook: "POV: you found the app that does the annoying part for you",
      caption:
        "It gives main-character productivity without the spreadsheet spiral. Very spectacular.",
      overlayLines: [
        "POV: the app gets it",
        "very brat",
        "spectacular results",
      ],
      gifMood: "spectacular guy reaction",
      audioMood: "brat hyperpop viral beat",
    },
    product,
  );
}

function normalizeBrief(value, product) {
  const host = product?.url
    ? new URL(product.url).hostname.replace(/^www\./, "")
    : "Product";
  return {
    productName: String(value.productName || product?.title || host).slice(
      0,
      48,
    ),
    audience: String(value.audience || "online shoppers").slice(0, 120),
    hook: String(value.hook || "POV: this makes life easier").slice(0, 80),
    caption: String(
      value.caption || "Short, useful, and weirdly satisfying.",
    ).slice(0, 180),
    overlayLines: Array.isArray(value.overlayLines)
      ? value.overlayLines.slice(0, 3).map((line) => String(line).slice(0, 34))
      : ["POV: this just clicked", "tiny app", "big relief"],
    gifMood: String(value.gifMood || "happy reaction").slice(0, 40),
    audioMood: String(value.audioMood || "upbeat pop").slice(0, 40),
  };
}
