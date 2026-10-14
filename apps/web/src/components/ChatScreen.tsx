import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatActions, ChatState } from '../hooks/useChat.js';
import { useRtc } from '../hooks/useRtc.js';
import { Logo } from './Logo.js';
import { OnlinePill } from './OnlinePill.js';
import { MessageList } from './MessageList.js';
import { Composer } from './Composer.js';
import { VideoStage } from './VideoStage.js';
import { ReportDialog } from './ReportDialog.js';

export interface ChatScreenProps {
  state: ChatState;
  actions: ChatActions;
  localStream: MediaStream | null;
  onLeave: () => void;
}

const STATUS_TEXT: Record<ChatState['status'], string> = {
  idle: 'Ready',
  searching: 'Looking for someone…',
  chatting: 'Connected to a stranger',
  ended: 'Chat ended',
};

export function ChatScreen({ state, actions, localStream, onLeave }: ChatScreenProps) {
  const { status, pair, mode } = state;
  const rtc = useRtc(pair, localStream, actions.sendSignal, actions.onSignal);
  const [reportOpen, setReportOpen] = useState(false);
  const [escArmed, setEscArmed] = useState(false);
  const escTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canModerate = Boolean(pair || state.lastPairId);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || reportOpen) return;
      if ((e.target as HTMLElement | null)?.closest('dialog')) return;
      if (status === 'chatting') {
        if (escArmed) {
          actions.stop();
          setEscArmed(false);
        } else {
          setEscArmed(true);
          if (escTimer.current) clearTimeout(escTimer.current);
          escTimer.current = setTimeout(() => setEscArmed(false), 2000);
        }
      } else if (status === 'searching') {
        actions.cancel();
      }
    },
    [status, escArmed, actions, reportOpen],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);
  useEffect(
    () => () => {
      if (escTimer.current) clearTimeout(escTimer.current);
    },
    [],
  );

  const primary =
    status === 'searching'
      ? { label: 'Stop searching', onClick: actions.cancel, cls: 'btn' }
      : status === 'chatting'
        ? { label: 'Next', onClick: actions.next, cls: 'btn btn-primary' }
        : { label: 'New chat', onClick: actions.next, cls: 'btn btn-primary' };

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="left">
          <Logo compact />
          <span className="status" data-state={status} role="status" aria-live="polite">
            <span className="ind" aria-hidden="true" />
            <span data-testid="status-text">{STATUS_TEXT[status]}</span>
            {pair && pair.sharedInterests.length > 0 && (
              <span className="pill pill-accent" title="Shared interests">
                {pair.sharedInterests.join(' · ')}
              </span>
            )}
          </span>
        </div>
        <div className="right">
          <OnlinePill count={state.onlineCount} connection={state.connection} />
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className={`chat-body${mode === 'video' ? ' with-video' : ''}`}>
        {mode === 'video' && <VideoStage localStream={localStream} rtc={rtc} status={status} />}
        <div className="messages-wrap">
          <MessageList messages={state.messages} partnerTyping={state.partnerTyping} />
          <Composer
            disabled={status !== 'chatting'}
            maxLength={state.maxMessageLength}
            onSend={actions.sendMessage}
            onTyping={actions.setTyping}
          />
        </div>
      </div>

      <div className="chat-actions" role="toolbar" aria-label="Chat controls">
        <button
          type="button"
          className={`${primary.cls} btn-lg`}
          onClick={primary.onClick}
          data-testid="primary-action"
        >
          <span className="btn-label">{primary.label}</span>
          {status === 'chatting' && <span aria-hidden="true">→</span>}
        </button>
        {status === 'chatting' && (
          <button type="button" className="btn btn-lg" onClick={actions.stop} data-testid="stop">
            Stop
          </button>
        )}
        {escArmed && (
          <span className="esc-hint" role="status">
            Press <span className="kbd">Esc</span> again to stop
          </span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-danger"
          disabled={!canModerate}
          onClick={() => setReportOpen(true)}
          data-testid="report"
        >
          ⚑ <span className="btn-label">Report</span>
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canModerate}
          onClick={actions.block}
          data-testid="block"
        >
          ⛔ <span className="btn-label">Block</span>
        </button>
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={(reason, details, includeTranscript, alsoBlock) => {
          actions.report(reason, details, includeTranscript);
          if (alsoBlock) actions.block();
          setReportOpen(false);
        }}
      />
    </div>
  );
}
