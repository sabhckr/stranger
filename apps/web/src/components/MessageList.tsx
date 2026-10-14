import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useChat.js';

export function MessageList({
  messages,
  partnerTyping,
}: {
  messages: ChatMessage[];
  partnerTyping: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, partnerTyping]);

  return (
    <div className="messages-wrap">
      <ol
        ref={listRef}
        className="messages"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.map((m) => (
          <li key={m.id} className={`msg msg-${m.kind}`} data-kind={m.kind}>
            {m.kind !== 'system' && (
              <span className="who">{m.kind === 'me' ? 'You' : 'Stranger'}</span>
            )}
            {m.text}
          </li>
        ))}
      </ol>
      <div className="typing" aria-live="polite">
        {partnerTyping ? 'Stranger is typing…' : ''}
      </div>
    </div>
  );
}
