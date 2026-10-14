import { useEffect, useState } from 'react';
import type { ChatMode } from '@stranger/protocol';
import { Logo } from './Logo.js';
import { OnlinePill } from './OnlinePill.js';
import { InterestsInput } from './InterestsInput.js';
import {
  Faq,
  FeatureCards,
  HeroCopy,
  HouseRules,
  MoreAboutStrangerChat,
  SiteFooter,
} from './landing-content.js';
import { MediaError, requestCameraAndMic } from '../lib/media.js';

export interface HomeProps {
  onlineCount: number;
  connection: string;
  videoAvailable: boolean;
  /** True when this static deployment has no chat server configured (see docs/DEPLOYMENT.md). */
  backendMissing?: boolean;
  onStart: (mode: ChatMode, interests: string[], localStream: MediaStream | null) => void;
}

export function Home({
  onlineCount,
  connection,
  videoAvailable,
  backendMissing = false,
  onStart,
}: HomeProps) {
  const [mode, setMode] = useState<ChatMode>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'video' && videoAvailable
      ? 'video'
      : 'text',
  );
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStart = connection === 'open' && !busy;
  // Free hosting sleeps when idle; after a few seconds of connecting, tell the visitor why it takes a moment.
  const [slowTimerFired, setSlowTimerFired] = useState(false);
  useEffect(() => {
    if (connection === 'open' || backendMissing) return;
    const t = setTimeout(() => setSlowTimerFired(true), 5000);
    return () => clearTimeout(t);
  }, [connection, backendMissing]);
  const slowConnect = slowTimerFired && connection !== 'open' && !backendMissing;

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
          <HeroCopy />
          {backendMissing && (
            <div className="alert alert-warn" role="status">
              This page is a static preview: the chat server is not connected to it yet, so matching
              is unavailable here. The operator can connect one by setting the API and WebSocket
              URLs for this deployment.
            </div>
          )}

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
                    : backendMissing
                      ? 'Chat server not connected.'
                      : slowConnect
                        ? 'Waking up the chat server. On free hosting this can take up to a minute…'
                        : 'Connecting to the server…'}
                </span>
              </div>
            </section>
            <HouseRules />
          </div>

          <FeatureCards />
          <MoreAboutStrangerChat />
          <Faq />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
