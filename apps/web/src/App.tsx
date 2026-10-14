import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { ChatMode } from '@stranger/protocol';
import { useChat } from './hooks/useChat.js';
import { getConsent } from './lib/identity.js';
import { backendMissing, warmBackend } from './lib/config.js';
import { stopStream } from './lib/media.js';
import { navigate, useRoute } from './router.js';
import { ConsentGate } from './components/ConsentGate.js';
import { Home } from './components/Home.js';
import { ChatScreen } from './components/ChatScreen.js';
const AdminPage = lazy(() =>
  import('./components/AdminPage.js').then((m) => ({ default: m.AdminPage })),
);
import { SeoLanding } from './components/SeoLanding.js';
import { applyHead } from './seo/head.js';
import { SEO_PAGES } from './seo/pages.js';
import { BannedScreen } from './components/BannedScreen.js';
import { PrivacyPage, SafetyPage, TermsPage } from './components/LegalPages.js';
import { Toasts } from './components/Toasts.js';

export function App() {
  const route = useRoute();
  const [consented, setConsented] = useState(() => getConsent() !== null);
  const noBackend = backendMissing();
  const [state, actions] = useChat(consented && !noBackend);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const onStart = useCallback(
    (mode: ChatMode, interests: string[], stream: MediaStream | null) => {
      setLocalStream(stream);
      actions.start(mode, interests);
      navigate('/chat');
    },
    [actions],
  );

  const onLeave = useCallback(() => {
    actions.stop();
    stopStream(localStream);
    setLocalStream(null);
    actions.reset();
    navigate('/');
  }, [actions, localStream]);

  // Wake a sleeping backend while the visitor reads the landing page.
  useEffect(() => {
    warmBackend();
  }, []);

  // Per-route title, description, canonical, Open Graph and robots.
  useEffect(() => {
    applyHead(route);
  }, [route]);

  // Landing on /chat without an active session (refresh, deep link) goes home.
  useEffect(() => {
    if (route === 'chat' && state.mode === null) navigate('/', true);
  }, [route, state.mode]);

  // Release the camera if the tab is closed mid-chat.
  useEffect(() => {
    const release = () => stopStream(localStream);
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [localStream]);

  if (state.banned)
    return <BannedScreen reason={state.banned.reason} expiresAt={state.banned.expiresAt} />;

  let page: React.ReactNode;
  switch (route) {
    case 'chat':
      page = state.mode ? (
        <ChatScreen state={state} actions={actions} localStream={localStream} onLeave={onLeave} />
      ) : null;
      break;
    case 'admin':
      page = (
        <Suspense fallback={<div className="center-page">Loading…</div>}>
          <AdminPage />
        </Suspense>
      );
      break;
    case 'terms':
      page = <TermsPage />;
      break;
    case 'privacy':
      page = <PrivacyPage />;
      break;
    case 'safety':
      page = <SafetyPage />;
      break;
    case 'not-found':
      page = (
        <div className="center-page">
          <div className="card">
            <h1 style={{ marginTop: 0 }}>Page not found</h1>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
              Go home
            </button>
          </div>
        </div>
      );
      break;
    default: {
      const landing = route.startsWith('landing:')
        ? SEO_PAGES.find((p) => p.slug === route.slice('landing:'.length))
        : undefined;
      if (landing) {
        page = (
          <SeoLanding
            page={landing}
            onlineCount={state.onlineCount}
            connection={state.connection}
          />
        );
        break;
      }
      page = (
        <Home
          onlineCount={state.onlineCount}
          connection={state.connection}
          videoAvailable={state.features.video}
          backendMissing={noBackend}
          onStart={onStart}
        />
      );
    }
  }

  const needsGate = !consented && (route === 'home' || route === 'chat');
  return (
    <>
      {page}
      {needsGate && <ConsentGate onAccept={() => setConsented(true)} />}
      <Toasts notices={state.notices} onDismiss={actions.clearNotice} />
    </>
  );
}
