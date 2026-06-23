"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Clapperboard, Loader2, Plus, Sparkles } from "lucide-react";
import { ChatMessage, loadConversations, sendChatMessage } from "@/lib/api";
import { getAnonymousUserId } from "@/lib/user";

type UiMessage = ChatMessage & { pending?: boolean };

const starter = [
  "I'm building CalAI, a calorie-tracking app. Here's the site: calai.app",
  "What can you do?",
  "Make a funny UGC video for linear.app"
];

export default function Home() {
  const [anonymousUserId, setAnonymousUserId] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = getAnonymousUserId();
    setAnonymousUserId(id);
    loadConversations(id)
      .then((data) => {
        const latest = data.conversations[0];
        if (latest) {
          setConversationId(latest.id);
          setMessages(latest.messages);
        }
      })
      .catch(() => setMessages([]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submitMessage();
  }

  async function submitMessage() {
    if (!canSend) return;

    const content = input.trim();
    const optimistic: UiMessage = {
      id: `local-${Date.now()}`,
      role: "USER",
      content
    };

    setInput("");
    setError("");
    setMessages((current) => [...current, optimistic]);
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        anonymousUserId,
        conversationId,
        message: content
      });

      setConversationId(response.conversationId);
      setMessages((current) => [...current, response.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSending(false);
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setInput("");
  }

  return (
    <main className="app-shell">
      <section className="chat-panel">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Clapperboard size={22} />
            </div>
            <div>
              <h1>Result UGC Chat</h1>
              <p>Product URL in. Short-form video out.</p>
            </div>
          </div>
          <button className="icon-button" onClick={newChat} aria-label="New chat" title="New chat">
            <Plus size={20} />
          </button>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="spark">
                <Sparkles size={30} />
              </div>
              <h2>Send a product and I’ll make the ad.</h2>
              <p>
                Try a URL, a rough product description, or ask what this can do. The chat is saved
                to this browser’s anonymous user.
              </p>
              <div className="starter-grid">
                {starter.map((item) => (
                  <button key={item} onClick={() => setInput(item)} className="starter">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}

          {isSending ? (
            <div className="bubble assistant typing">
              <Loader2 size={18} className="spin" />
              <span>Thinking, scraping, assembling...</span>
            </div>
          ) : null}
          <div ref={scrollRef} />
        </div>

        {error ? <div className="error">{error}</div> : null}

        <form className="composer" onSubmit={onSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
            placeholder="Paste a product URL or say hi..."
            rows={1}
          />
          <button className="send-button" disabled={!canSend} aria-label="Send message">
            {isSending ? <Loader2 size={20} className="spin" /> : <ArrowUp size={20} />}
          </button>
        </form>
      </section>
    </main>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "USER";

  return (
    <article className={`bubble ${isUser ? "user" : "assistant"}`}>
      <p>{message.content}</p>
      {message.videoUrl ? (
        <div className="video-result">
          <video controls playsInline src={message.videoUrl} />
          <a href={message.videoUrl} target="_blank" rel="noreferrer">
            Open final video URL
          </a>
        </div>
      ) : null}
    </article>
  );
}
