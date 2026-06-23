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
    { cache: "no-store" }
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
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Could not send message");
  }

  return (await response.json()) as {
    conversationId: string;
    message: ChatMessage;
    video?: { publicUrl: string } | null;
  };
}
