import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as ContentApi from "../../api/api-content.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { BottomNav, TopBar } from "../../components/layout.jsx";
import { Icon } from "../../components/Icon.jsx";
import { LogoHand } from "../../components/illustrations.jsx";
import { SignDialog } from "../../components/SignDialog.jsx";
import { readPreference, storePreference } from "../../utils/session-storage.js";
import { prefersReducedMotion } from "../../utils/motion.js";
import "./assistant.css";

const MAX_STORED_MESSAGES = 40;
const HISTORY_SENT_TO_API = 10;

function formatMessageTime(isoDate) {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `Hoje - ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Ontem - ${time}`;
  return `${date.toLocaleDateString("pt-BR")} - ${time}`;
}

function createMessage(role, content, signs = []) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, role, content, signs, sentAt: new Date().toISOString() };
}

function BotAvatar() {
  return (
    <span className="chat-bot-avatar" aria-hidden="true">
      <LogoHand size={24} color="#fff" />
    </span>
  );
}

function ChatMessage({ message, onOpenSign }) {
  const fromUser = message.role === "user";
  return (
    <li className={`chat-message ${fromUser ? "chat-message--user" : "chat-message--bot"}`}>
      {!fromUser && <BotAvatar />}
      <div>
        <p className="chat-message__bubble">{message.content}</p>
        {message.signs.length > 0 && (
          <div className="chat-message__signs">
            {message.signs.map((sign) => (
              <button key={sign.slug} type="button" className="chat-sign-chip" onClick={() => onOpenSign(sign)}>
                <Icon name="hand" size={14} /> {sign.word}
              </button>
            ))}
          </div>
        )}
        <time className="chat-message__time" dateTime={message.sentAt}>{formatMessageTime(message.sentAt)}</time>
      </div>
    </li>
  );
}

export function AssistantPage() {
  const { user } = useAuth();
  // Histórico por conta: outra pessoa entrando no mesmo aparelho não vê a conversa.
  const historyKey = `assistant-history:${user.publicId}`;
  const [messages, setMessages] = useState(() => readPreference(historyKey, []));
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [openSign, setOpenSign] = useState(null);
  const listEndRef = useRef(null);

  useEffect(() => {
    storePreference(historyKey, messages.slice(-MAX_STORED_MESSAGES));
    listEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [messages, historyKey]);

  async function sendQuestion(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;

    const history = messages.slice(-HISTORY_SENT_TO_API).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, createMessage("user", text)]);
    setQuestion("");
    setSending(true);
    try {
      const reply = await ContentApi.askAssistant(text, history);
      setMessages((current) => [...current, createMessage("assistant", reply.answer, reply.signs)]);
    } catch (askError) {
      setMessages((current) => [...current, createMessage("assistant", askError.message)]);
    } finally {
      setSending(false);
    }
  }

  const firstName = user.nickname.split(" ")[0];

  return (
    <div className="screen screen--with-nav assistant-screen">
      <TopBar
        title="Assistente Signa"
        subtitle="Online"
        backTo={-1}
        rounded
        icon={
          <span className="assistant-header-icon" aria-hidden="true">
            <LogoHand size={26} color="#fff" />
          </span>
        }
      />
      <main className="chat-body">
        <ul className="chat-list" aria-live="polite">
          {messages.length === 0 && (
            <ChatMessage
              message={{ ...createMessage("assistant", `Oi ${firstName}! Pergunte sobre um sinal ou sobre Libras.`), id: "welcome" }}
              onOpenSign={setOpenSign}
            />
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} onOpenSign={setOpenSign} />
          ))}
          {sending && <li className="chat-typing">Assistente está digitando…</li>}
          <li ref={listEndRef} aria-hidden="true" />
        </ul>
      </main>

      <form className="chat-composer" onSubmit={sendQuestion}>
        <label className="chat-composer__input">
          <span className="visually-hidden">Sua pergunta</span>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Escreva a sua Pergunta...." maxLength={1000} />
        </label>
        <Link to="/camera" className="chat-composer__button chat-composer__button--outline" aria-label="Abrir o tradutor pela câmera">
          <Icon name="camera" size={32} strokeWidth={1.3} />
        </Link>
        <button type="submit" className="chat-composer__button" disabled={sending || !question.trim()} aria-label="Enviar">
          <Icon name="send" size={26} strokeWidth={1.5} />
        </button>
      </form>
      <BottomNav />

      {openSign && <SignDialog word={openSign.word} avatar={openSign.avatar} onClose={() => setOpenSign(null)} />}
    </div>
  );
}
