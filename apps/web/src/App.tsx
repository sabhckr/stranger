import { useCallback, useEffect, useState } from 'react';
import type { ChatMode } from '@stranger/protocol';
import { useChat } from './hooks/useChat.js';
import { getConsent } from './lib/identity.js';
import { stopStream } from './lib/media.js';
import { navigate, useRoute } from './router.js';
import { ConsentGate } from './components/ConsentGate.js';
import { Home } from './components/Home.js';
import { ChatScreen } from './components/ChatScreen.js';
import { AdminPage } from './components/AdminPage.js';
import { BannedScreen } from './components/BannedScreen.js';
import { PrivacyPage, SafetyPage, TermsPage } from './components/LegalPages.js';
import { Toasts } from './components/Toasts.js';

export function App() {
  const route = useRoute();
  const [consented, setConsented] = useState(() => getConsent() !== null);
  const [state, actions] = useChat(consented);
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
      page = <AdminPage />;
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
    default:
      page = (
        <Home
          onlineCount={state.onlineCount}
          connection={state.connection}
          videoAvailable={state.features.video}
          onStart={onStart}
        />
      );
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
