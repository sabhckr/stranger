import { useEffect, useRef, useState } from 'react';
import { saveConsent } from '../lib/identity.js';
import { navigate } from '../router.js';

export function ConsentGate({ onAccept }: { onAccept: () => void }) {
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  const ready = age && terms;

  return (
    <div className="gate-backdrop">
      <div
        className="card gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-desc"
      >
        <h2 id="gate-title">Before you start</h2>
        <p id="gate-desc">
          STRANGER connects you with a random person. No account, no profile. Chats are not stored
          by us. Please confirm the following:
        </p>
        <label className="check">
          <input
            ref={firstRef}
            type="checkbox"
            checked={age}
            onChange={(e) => setAge(e.target.checked)}
          />
          <span>
            I am 18 years of age or older.
            <small>This service is for adults only.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            I agree to the{' '}
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                navigate('/terms');
              }}
            >
              Terms
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigate('/privacy');
              }}
            >
              Privacy Policy
            </a>
            , and I will follow the{' '}
            <a
              href="/safety"
              onClick={(e) => {
                e.preventDefault();
                navigate('/safety');
              }}
            >
              safety rules
            </a>
            .<small>Harassment, nudity, hate and anything involving minors gets you banned.</small>
          </span>
        </label>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!ready}
            onClick={() => {
              saveConsent();
              onAccept();
            }}
          >
            Enter STRANGER
          </button>
        </div>
      </div>
    </div>
  );
}
