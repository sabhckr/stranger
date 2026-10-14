import { useState } from 'react';
import type { ChatMode } from '@stranger/protocol';
import { Logo } from './Logo.js';
import { OnlinePill } from './OnlinePill.js';
import { InterestsInput } from './InterestsInput.js';
import { MediaError, requestCameraAndMic } from '../lib/media.js';
import { navigate } from '../router.js';

export interface HomeProps {
  onlineCount: number;
  connection: string;
  videoAvailable: boolean;
  onStart: (mode: ChatMode, interests: string[], localStream: MediaStream | null) => void;
}

export function Home({ onlineCount, connection, videoAvailable, onStart }: HomeProps) {
  const [mode, setMode] = useState<ChatMode>('text');
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStart = connection === 'open' && !busy;

  const start = async () => {
    setError(null);
    if (mode === 'video') {
      setBusy(true);
      try {
        const stream = await requestCameraAndMic();
        onStart('video', interests, stream);
      } catch (err) {
        setError(err instanceof MediaError ? err.message : 'Could not start your camera.');
      } finally {
        setBusy(false);
      }
      return;
    }
    onStart('text', interests, null);
  };

  return (
    <div className="page">
      <div className="container">
        <header className="site-header">
          <Logo />
          <OnlinePill count={onlineCount} connection={connection} />
        </header>
        <main>
          <section className="hero">
            <h1>
              Talk to <em>someone new</em>.
            </h1>
            <p className="lead">
              Anonymous one-to-one text or video chat with a random stranger. No sign-up. Skip
              anytime. Your messages are never stored.
            </p>
          </section>

          <div className="start-grid">
            <section className="card" aria-labelledby="start-title">
              <h2 id="start-title" className="sr-only">
                Start a chat
              </h2>
              <span className="field-label" id="mode-label">
                How do you want to chat?
              </span>
              <div className="mode-grid" role="radiogroup" aria-labelledby="mode-label">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'text'}
                  className="mode"
                  onClick={() => setMode('text')}
                >
                  <span className="mode-title">💬 Text chat</span>
                  <span className="mode-desc">
                    Type with a stranger. Fast, light, works anywhere.
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'video'}
                  className="mode"
                  disabled={!videoAvailable}
                  onClick={() => setMode('video')}
                >
                  <span className="mode-title">🎥 Video chat</span>
                  <span className="mode-desc">
                    Face to face, peer-to-peer. You choose when your camera turns on.
                  </span>
                </button>
              </div>
              <div style={{ marginTop: 18 }}>
                <InterestsInput value={interests} onChange={setInterests} />
              </div>
              {mode === 'video' && (
                <div className="alert alert-info" role="note">
                  Your browser will ask for camera and microphone access when you press Start. Video
                  goes directly to the other person and is never recorded by STRANGER.
                </div>
              )}
              {error && (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              )}
              <div className="start-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => void start()}
                  disabled={!canStart}
                  data-testid="start"
                >
                  {busy
                    ? 'Starting camera…'
                    : mode === 'video'
                      ? 'Start video chat'
                      : 'Start text chat'}
                </button>
                <span className="hint" style={{ margin: 0 }}>
                  {connection === 'open'
                    ? 'You can leave at any time.'
                    : 'Connecting to the server…'}
                </span>
              </div>
            </section>

            <aside className="card" aria-labelledby="rules-title">
              <h2 id="rules-title" style={{ margin: '0 0 14px', fontSize: 18 }}>
                House rules
              </h2>
              <ul className="rules" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li>
                  <span className="ico" aria-hidden="true">
                    18
                  </span>
                  <span>
                    <strong>Adults only.</strong> Anyone who appears to be a minor is reported and
                    removed.
                  </span>
                </li>
                <li>
                  <span className="ico" aria-hidden="true">
                    ✕
                  </span>
                  <span>
                    <strong>No nudity, harassment or hate.</strong> Reports from multiple people
                    lead to automatic bans.
                  </span>
                </li>
                <li>
                  <span className="ico" aria-hidden="true">
                    ⚑
                  </span>
                  <span>
                    <strong>Report and block</strong> are one tap away during every chat.
                  </span>
                </li>
                <li>
                  <span className="ico" aria-hidden="true">
                    ◎
                  </span>
                  <span>
                    <strong>Stay anonymous.</strong> Never share your address, bank details or
                    passwords.
                  </span>
                </li>
              </ul>
            </aside>
          </div>

          <section className="features" aria-label="How it works">
            <div className="card feature">
              <h3>Interest matching</h3>
              <p>
                Add a few interests and we pair you with someone who shares one. If nobody does, we
                match you with anyone after a few seconds.
              </p>
            </div>
            <div className="card feature">
              <h3>Peer-to-peer video</h3>
              <p>
                Video and audio travel directly between browsers over encrypted WebRTC. Our servers
                only help the two of you find each other.
              </p>
            </div>
            <div className="card feature">
              <h3>Nothing to remember</h3>
              <p>
                No accounts and no chat history. Reports keep a short excerpt for moderation only,
                for a limited time.
              </p>
            </div>
          </section>
        </main>
        <footer className="site-footer">
          <span>© {new Date().getFullYear()} STRANGER</span>
          <a
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              navigate('/terms');
            }}
          >
            Terms
          </a>
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              navigate('/privacy');
            }}
          >
            Privacy
          </a>
          <a
            href="/safety"
            onClick={(e) => {
              e.preventDefault();
              navigate('/safety');
            }}
          >
            Safety
          </a>
        </footer>
      </div>
    </div>
  );
}
