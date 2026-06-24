import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { handleChatTurn } from "./chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: "*",
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  "/videos",
  express.static(path.resolve(__dirname, "../storage/videos")),
);

const ChatBody = z.object({
  anonymousUserId: z.string().min(6).max(120),
  conversationId: z.string().optional().nullable(),
  message: z.string().min(1).max(2000),
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/conversations", async (req, res, next) => {
  try {
    const anonymousUserId = String(req.query.anonymousUserId || "");
    if (!anonymousUserId)
      return res.status(400).json({ error: "anonymousUserId is required" });

    const user = await prisma.user.findUnique({
      where: { anonymousId: anonymousUserId },
      include: {
        conversations: {
          orderBy: { updatedAt: "desc" },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        },
      },
    });

    res.json({ conversations: user?.conversations || [] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const body = ChatBody.parse(req.body);
    const user = await prisma.user.upsert({
      where: { anonymousId: body.anonymousUserId },
      update: {},
      create: { anonymousId: body.anonymousUserId },
    });

    const conversation = body.conversationId
      ? await prisma.conversation.findFirst({
          where: { id: body.conversationId, userId: user.id },
        })
      : null;

    const activeConversation =
      conversation ||
      (await prisma.conversation.create({
        data: {
          userId: user.id,
          title: body.message.slice(0, 54) || "UGC video chat",
        },
      }));

    await prisma.message.create({
      data: {
        conversationId: activeConversation.id,
        role: "USER",
        content: body.message,
      },
    });

    const history = await prisma.message.findMany({
      where: { conversationId: activeConversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Initial event
    sendEvent("start", { conversationId: activeConversation.id });

    const reply = await handleChatTurn({
      message: body.message,
      conversation: activeConversation,
      history,
      onProgress: (progress) => {
        sendEvent("progress", progress);
      },
    });

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: activeConversation.id,
        role: "ASSISTANT",
        content: reply.content,
        videoUrl: reply.video?.publicUrl,
        metadata: reply.video?.metadata || undefined,
      },
    });

    // Final result event
    sendEvent("done", {
      conversationId: activeConversation.id,
      message: assistantMessage,
      video: reply.video,
    });

    res.end();
  } catch (error) {
    // If headers haven't been sent yet, we can send a standard 500
    if (!res.headersSent) {
      next(error);
    } else {
      // If we're in the middle of an SSE stream, send an error event
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Something went wrong while generating the response.",
    detail: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

app.listen(port, () => {
  console.log(`Result UGC backend listening on http://localhost:${port}`);
});
