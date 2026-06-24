export type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  videoUrl?: string | null;
  createdAt?: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function loadConversations(anonymousUserId: string) {
  const response = await fetch(
    `${API_URL}/api/conversations?anonymousUserId=${encodeURIComponent(anonymousUserId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Could not load conversations");
  return (await response.json()) as { conversations: Conversation[] };
}

export async function sendChatMessage(params: {
  anonymousUserId: string;
  conversationId?: string | null;
  message: string;
}) {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const msg = data?.message || data?.error || "Could not send message";
    const errorId = data?.errorId ? ` (ID: ${data.errorId})` : "";
    throw new Error(`${msg}${errorId}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n\n");
      // Keep the last partial chunk in the buffer
      buffer = lines.pop() || "";

      for (const chunk of lines) {
        const eventMatch = chunk.match(/event: (.*)/);
        const dataMatch = chunk.match(/data: (.*)/);

        if (eventMatch && dataMatch) {
          const event = eventMatch[1].trim();
          const dataStr = dataMatch[1].trim();

          if (event === "error") {
            const errData = JSON.parse(dataStr);
            throw new Error(errData.error || "Stream error");
          }

          if (event === "done") {
            return JSON.parse(dataStr) as {
              conversationId: string;
              message: ChatMessage;
              video?: { publicUrl: string } | null;
            };
          }
        }
      }
    }
    if (done) break;
  }

  throw new Error("Stream closed without done event");
}
