import { useId, useRef, useState } from 'react';
import { Interest, MAX_INTERESTS } from '@stranger/protocol';

export interface InterestsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Parse free text into zero or more normalised interests (comma / newline separated). */
export function parseInterestInput(raw: string): { accepted: string[]; rejected: string[] } {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    if (!part.trim()) continue;
    const r = Interest.safeParse(part);
    if (r.success) accepted.push(r.data);
    else rejected.push(part.trim());
  }
  return { accepted, rejected };
}

export function InterestsInput({ value, onChange, disabled }: InterestsInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const commit = (raw: string) => {
    const { accepted, rejected } = parseInterestInput(raw);
    const next = [...value];
    for (const a of accepted) if (!next.includes(a) && next.length < MAX_INTERESTS) next.push(a);
    if (next.length !== value.length) onChange(next);
    if (rejected.length)
      setError(
        `Could not add "${rejected[0]}". Use letters, numbers and spaces (max 24 characters).`,
      );
    else if (value.length >= MAX_INTERESTS && accepted.length)
      setError(`You can add up to ${MAX_INTERESTS} interests.`);
    else setError(null);
    setDraft('');
  };

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        Interests{' '}
        <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(optional)</span>
      </label>
      <div className="chips" onClick={() => inputRef.current?.focus()}>
        {value.map((interest) => (
          <span className="chip" key={interest}>
            {interest}
            <button
              type="button"
              aria-label={`Remove ${interest}`}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== interest));
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={draft}
          disabled={disabled || value.length >= MAX_INTERESTS}
          placeholder={value.length ? 'Add another…' : 'music, films, coding…'}
          autoComplete="off"
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',') || v.includes('\n')) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
        />
      </div>
      <p
        className="hint"
        id={`${id}-hint`}
        role={error ? 'alert' : undefined}
        style={error ? { color: 'var(--danger)' } : undefined}
      >
        {error ??
          'Press Enter or comma to add. We match you with people who share one of these first, then with anyone.'}
      </p>
    </div>
  );
}
