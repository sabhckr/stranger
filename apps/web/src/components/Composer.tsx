import { useEffect, useRef, useState } from 'react';

export interface ComposerProps {
  disabled: boolean;
  maxLength: number;
  onSend: (text: string) => boolean;
  onTyping: (isTyping: boolean) => void;
  placeholder?: string;
}

export function Composer({ disabled, maxLength, onSend, onTyping, placeholder }: ComposerProps) {
  const [text, setText] = useState('');
  const typingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const stopTyping = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (typingRef.current) {
      typingRef.current = false;
      onTyping(false);
    }
  };

  useEffect(() => {
    if (!disabled) areaRef.current?.focus();
    else stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => () => stopTyping(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!text.trim()) return;
    if (onSend(text)) {
      setText('');
      stopTyping();
      areaRef.current?.focus();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={areaRef}
        rows={1}
        value={text}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder ?? (disabled ? 'Waiting for a partner…' : 'Type a message')}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          if (!typingRef.current) {
            typingRef.current = true;
            onTyping(true);
          }
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(stopTyping, 2000);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" className="btn btn-primary" disabled={disabled || !text.trim()}>
        Send
      </button>
      {text.length > maxLength * 0.8 && (
        <span className="counter" aria-live="polite">
          {text.length} / {maxLength}
        </span>
      )}
    </form>
  );
}
