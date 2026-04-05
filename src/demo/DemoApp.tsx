import { useState } from 'react';
import { PaperCanvas } from '../lib';
import { buildDemoPaperMap } from './demoData';

const demoPaperMap = buildDemoPaperMap();

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

function EchoChat({ initialPrompt }: { initialPrompt: string }) {
  const [draft, setDraft] = useState(initialPrompt);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: 'user', text: initialPrompt },
    { id: 2, role: 'assistant', text: initialPrompt },
  ]);

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: current.length + 1, role: 'user', text },
      { id: current.length + 2, role: 'assistant', text },
    ]);
    setDraft('');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitDraft();
  }

  return (
    <section
      style={{
        display: 'grid',
        gap: 14,
        padding: 14,
        borderRadius: 20,
        border: '1px solid color-mix(in srgb, var(--line) 55%, white)',
        background: `
          radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 10%, white), transparent 34%),
          linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 76%, white), color-mix(in srgb, var(--surface) 94%, white))
        `,
        boxShadow: '0 18px 40px rgba(32, 24, 18, 0.08)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                marginBottom: 6,
                fontFamily: '"Trebuchet MS", "Avenir Next", Arial, sans-serif',
                fontSize: '0.72em',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
              }}
            >
              Prototype Thread
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: '"Avenir Next", "Trebuchet MS", Arial, sans-serif',
                fontSize: '1.25em',
                lineHeight: 1.05,
              }}
            >
              Echo Chat
            </h2>
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid color-mix(in srgb, var(--accent) 22%, white)',
              background: 'color-mix(in srgb, var(--surface-raised) 82%, white)',
              fontFamily: '"Trebuchet MS", "Avenir Next", Arial, sans-serif',
              fontSize: '0.74em',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Live Mirror
          </div>
        </div>

        <p
          style={{
            margin: 0,
            color: 'color-mix(in srgb, var(--text) 72%, white)',
            lineHeight: 1.55,
          }}
        >
          入力した内容を、そのまま返すだけの試験用チャットです。見た目だけ先に整えて、
          あとから実際の応答ロジックを差し込める形にしています。
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 10,
          padding: 4,
          borderRadius: 18,
          background: 'color-mix(in srgb, var(--surface) 45%, white)',
        }}
      >
        {messages.map((message) => (
          <article
            key={message.id}
            style={{
              padding: '12px 14px',
              border: '1px solid color-mix(in srgb, var(--line) 45%, white)',
              borderRadius: 16,
              background:
                message.role === 'user'
                  ? 'linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 94%, white), color-mix(in srgb, var(--surface) 98%, white))'
                  : 'linear-gradient(180deg, color-mix(in srgb, var(--quote) 84%, white), color-mix(in srgb, var(--surface-raised) 92%, white))',
              boxShadow:
                message.role === 'user'
                  ? '0 8px 18px rgba(55, 43, 33, 0.05)'
                  : '0 10px 22px rgba(79, 60, 38, 0.09)',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: '"Trebuchet MS", "Avenir Next", Arial, sans-serif',
                  fontSize: '0.74em',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: message.role === 'user' ? 'var(--muted)' : 'var(--accent)',
                }}
              >
                {message.role === 'user' ? 'User' : 'Assistant'}
              </div>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background:
                    message.role === 'user'
                      ? 'color-mix(in srgb, var(--muted) 55%, white)'
                      : 'var(--accent)',
                  boxShadow:
                    message.role === 'user'
                      ? '0 0 0 4px color-mix(in srgb, var(--surface-raised) 60%, white)'
                      : '0 0 0 4px color-mix(in srgb, var(--accent) 16%, white)',
                }}
              />
            </header>
            <p
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                color: 'color-mix(in srgb, var(--text) 90%, black)',
              }}
            >
              {message.text}
            </p>
          </article>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: 10,
          padding: 12,
          borderRadius: 18,
          border: '1px solid color-mix(in srgb, var(--line) 42%, white)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 82%, white), color-mix(in srgb, var(--surface) 96%, white))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <label
            htmlFor="echo-input"
            style={{
              fontFamily: '"Trebuchet MS", "Avenir Next", Arial, sans-serif',
              fontSize: '0.75em',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Message
          </label>
          <div
            style={{
              fontSize: '0.82em',
              color: 'var(--muted)',
            }}
          >
            Enter to send, Shift+Enter for newline
          </div>
        </div>
        <textarea
          id="echo-input"
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ここに入力"
          style={{
            width: '100%',
            minHeight: 96,
            resize: 'vertical',
            padding: '12px 14px',
            border: '1px solid color-mix(in srgb, var(--line) 38%, white)',
            borderRadius: 16,
            background: 'color-mix(in srgb, var(--surface) 94%, white)',
            color: 'var(--text)',
            font: 'inherit',
            lineHeight: 1.5,
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: '0.84em',
              color: 'color-mix(in srgb, var(--muted) 86%, white)',
            }}
          >
            Echo only. No model connected yet.
          </div>
          <button
            type="submit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 11px 9px 14px',
              border: '1px solid color-mix(in srgb, var(--accent) 18%, white)',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--surface-raised) 78%, white)',
              color: 'color-mix(in srgb, var(--text) 92%, black)',
              font: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(32, 24, 18, 0.08)',
            }}
          >
            <span>Send</span>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 999,
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 76%, white), color-mix(in srgb, var(--accent) 88%, black))',
                color: 'white',
                boxShadow: '0 8px 18px color-mix(in srgb, var(--accent) 22%, transparent)',
                fontSize: '0.92em',
              }}
            >
              ↗
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}

export default function DemoApp() {
  return (
    <PaperCanvas
      debug={false}
      paperMap={demoPaperMap}
      onCreateChild={(parentId, create) => {
        const parent = demoPaperMap.get(parentId);
        const prompt = parent?.title ?? 'hello';
        create({
          title: `Echo: ${prompt}`,
          content: <EchoChat initialPrompt={prompt} />,
        });
      }}
    />
  );
}
