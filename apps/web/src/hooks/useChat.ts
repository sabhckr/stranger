import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  ChatMode,
  ReportReason,
  ServerMessage,
  SignalData,
  TranscriptLine,
} from '@stranger/protocol';
import { MAX_TRANSCRIPT_LINES } from '@stranger/protocol';
import { ChatClient, type ConnectionState } from '../lib/chat-client.js';
import { wsUrl } from '../lib/config.js';
import { getClientId, getConsent } from '../lib/identity.js';

export type ChatStatus = 'idle' | 'searching' | 'chatting' | 'ended';

export interface ChatMessage {
  id: number;
  kind: 'me' | 'partner' | 'system';
  text: string;
  ts: number;
}

export interface PairInfo {
  pairId: string;
  mode: ChatMode;
  sharedInterests: string[];
  initiator: boolean;
}

export interface ChatState {
  connection: ConnectionState;
  status: ChatStatus;
  onlineCount: number;
  mode: ChatMode | null;
  interests: string[];
  pair: PairInfo | null;
  lastPairId: string | null;
  messages: ChatMessage[];
  partnerTyping: boolean;
  notices: Array<{ tone: 'info' | 'error' | 'success'; text: string; id: number }>;
  banned: { reason: string; expiresAt: number | null } | null;
  maxMessageLength: number;
  features: { video: boolean; turn: boolean };
  reportAck: string | null;
}

type Action =
  | { type: 'connection'; state: ConnectionState }
  | { type: 'frame'; frame: ServerMessage }
  | { type: 'start'; mode: ChatMode; interests: string[] }
  | { type: 'local_message'; text: string }
  | { type: 'notice'; tone: 'info' | 'error' | 'success'; text: string }
  | { type: 'clear_notice'; id: number }
  | { type: 'reset' };

let nextId = 1;
const msg = (kind: ChatMessage['kind'], text: string, ts = Date.now()): ChatMessage => ({
  id: nextId++,
  kind,
  text,
  ts,
});

export const initialChatState: ChatState = {
  connection: 'idle',
  status: 'idle',
  onlineCount: 0,
  mode: null,
  interests: [],
  pair: null,
  lastPairId: null,
  messages: [],
  partnerTyping: false,
  notices: [],
  banned: null,
  maxMessageLength: 2000,
  features: { video: true, turn: false },
  reportAck: null,
};

export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'connection': {
      if (
        action.state === 'reconnecting' &&
        (state.status === 'chatting' || state.status === 'searching')
      ) {
        return {
          ...state,
          connection: action.state,
          status: 'ended',
          pair: null,
          partnerTyping: false,
          messages: [...state.messages, msg('system', 'Connection lost. Reconnecting…')],
        };
      }
      return { ...state, connection: action.state };
    }
    case 'start':
      return {
        ...state,
        mode: action.mode,
        interests: action.interests,
        status: 'searching',
        messages: [],
        pair: null,
        partnerTyping: false,
        reportAck: null,
      };
    case 'local_message':
      return { ...state, messages: [...state.messages, msg('me', action.text)] };
    case 'notice':
      return { ...state, notices: pushNotice(state.notices, action.tone, action.text) };
    case 'clear_notice':
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };
    case 'reset':
      return {
        ...initialChatState,
        connection: state.connection,
        onlineCount: state.onlineCount,
        features: state.features,
        maxMessageLength: state.maxMessageLength,
      };
    case 'frame':
      return applyFrame(state, action.frame);
  }
}

const MAX_NOTICES = 3;
function pushNotice(
  list: ChatState['notices'],
  tone: 'info' | 'error' | 'success',
  text: string,
): ChatState['notices'] {
  return [...list, { tone, text, id: nextId++ }].slice(-MAX_NOTICES);
}

function applyFrame(state: ChatState, frame: ServerMessage): ChatState {
  switch (frame.type) {
    case 'welcome':
      return {
        ...state,
        onlineCount: frame.onlineCount,
        maxMessageLength: frame.maxMessageLength,
        features: frame.features,
      };
    case 'presence':
      return { ...state, onlineCount: frame.onlineCount };
    case 'queued':
      return {
        ...state,
        status: 'searching',
        pair: null,
        partnerTyping: false,
        mode: frame.mode,
        interests: frame.interests,
      };
    case 'matched': {
      const shared = frame.sharedInterests;
      const intro =
        shared.length > 0
          ? `You both like ${shared.join(', ')}. Say hi!`
          : "You're now chatting with a random stranger. Say hi!";
      return {
        ...state,
        status: 'chatting',
        partnerTyping: false,
        reportAck: null,
        pair: {
          pairId: frame.pairId,
          mode: frame.mode,
          sharedInterests: shared,
          initiator: frame.initiator,
        },
        lastPairId: frame.pairId,
        messages: [msg('system', intro)],
      };
    }
    case 'message':
      return {
        ...state,
        partnerTyping: false,
        messages: [...state.messages, msg('partner', frame.text, frame.ts)],
      };
    case 'typing':
      return { ...state, partnerTyping: frame.isTyping };
    case 'partner_left': {
      const text =
        frame.reason === 'stop' || frame.reason === 'next'
          ? 'Stranger has left the chat.'
          : frame.reason === 'moderated'
            ? 'Stranger was removed by moderation.'
            : 'Stranger has disconnected.';
      return {
        ...state,
        status: 'ended',
        pair: null,
        partnerTyping: false,
        messages: [...state.messages, msg('system', text)],
      };
    }
    case 'idle':
      return {
        ...state,
        status: state.status === 'chatting' ? 'ended' : 'idle',
        pair: null,
        partnerTyping: false,
      };
    case 'report_ack':
      return {
        ...state,
        reportAck: frame.reportId,
        notices: pushNotice(state.notices, 'success', 'Thanks. Your report has been received.'),
      };
    case 'block_ack':
      return {
        ...state,
        notices: pushNotice(
          state.notices,
          'success',
          "Blocked. You won't be matched with them again.",
        ),
      };
    case 'banned':
      return {
        ...state,
        banned: { reason: frame.reason, expiresAt: frame.expiresAt },
        status: 'idle',
        pair: null,
      };
    case 'error': {
      if (frame.code === 'rate_limited' && state.status === 'chatting') {
        return { ...state, notices: pushNotice(state.notices, 'info', frame.message) };
      }
      return { ...state, notices: pushNotice(state.notices, 'error', frame.message) };
    }
    case 'signal':
    case 'pong':
      return state;
  }
}

export interface ChatActions {
  start(mode: ChatMode, interests: string[]): void;
  next(): void;
  stop(): void;
  cancel(): void;
  sendMessage(text: string): boolean;
  setTyping(isTyping: boolean): void;
  report(reason: ReportReason, details?: string, includeTranscript?: boolean): void;
  block(): void;
  sendSignal(data: SignalData): void;
  onSignal(fn: (data: SignalData) => void): () => void;
  clearNotice(id: number): void;
  reset(): void;
}

/**
 * `enabled` gates the WebSocket: nothing is sent to the server until the user has passed the consent
 * gate, and the hello frame always carries the consent that was given.
 */
export function useChat(enabled = true): [ChatState, ChatActions] {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const clientRef = useRef<ChatClient | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const signalListeners = useRef(new Set<(data: SignalData) => void>());

  useEffect(() => {
    if (!enabled) return;
    const client = new ChatClient({
      url: wsUrl(),
      clientId: getClientId(),
      consent: () => {
        const c = getConsent();
        return { ageConfirmed: c?.ageConfirmed ?? false, termsAccepted: c?.termsAccepted ?? false };
      },
    });
    clientRef.current = client;
    const offFrame = client.onFrame((frame) => {
      if (frame.type === 'signal') {
        for (const fn of signalListeners.current) fn(frame.data);
        return;
      }
      dispatch({ type: 'frame', frame });
    });
    const offState = client.onState((s) => dispatch({ type: 'connection', state: s }));
    client.connect();
    return () => {
      offFrame();
      offState();
      client.disconnect();
      clientRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((m: Parameters<ChatClient['send']>[0]) => {
    const ok = clientRef.current?.send(m) ?? false;
    if (!ok)
      dispatch({ type: 'notice', tone: 'error', text: 'Not connected yet. Please wait a moment.' });
    return ok;
  }, []);

  const actions = useMemo<ChatActions>(
    () => ({
      start(mode, interests) {
        dispatch({ type: 'start', mode, interests });
        send({ type: 'find', mode, interests });
      },
      next() {
        const s = stateRef.current;
        if (s.status === 'searching') return;
        if (s.status === 'idle' && s.mode) {
          dispatch({ type: 'start', mode: s.mode, interests: s.interests });
          send({ type: 'find', mode: s.mode, interests: s.interests });
          return;
        }
        send({ type: 'next' });
      },
      stop() {
        send({ type: 'stop' });
      },
      cancel() {
        send({ type: 'cancel' });
      },
      sendMessage(text) {
        const trimmed = text.replace(/\s+$/u, '');
        if (!trimmed.trim()) return false;
        if (stateRef.current.status !== 'chatting') return false;
        if (send({ type: 'message', text: trimmed })) {
          dispatch({ type: 'local_message', text: trimmed });
          return true;
        }
        return false;
      },
      setTyping(isTyping) {
        if (stateRef.current.status !== 'chatting') return;
        clientRef.current?.send({ type: 'typing', isTyping });
      },
      report(reason, details, includeTranscript = true) {
        const s = stateRef.current;
        const pairId = s.pair?.pairId ?? s.lastPairId ?? undefined;
        const transcript: TranscriptLine[] | undefined = includeTranscript
          ? s.messages
              .filter((m) => m.kind !== 'system')
              .slice(-MAX_TRANSCRIPT_LINES)
              .map((m) => ({ from: m.kind === 'me' ? 'me' : 'partner', text: m.text, ts: m.ts }))
          : undefined;
        send({
          type: 'report',
          reason,
          ...(pairId ? { pairId } : {}),
          ...(details?.trim() ? { details: details.trim() } : {}),
          ...(transcript ? { transcript } : {}),
        });
      },
      block() {
        const s = stateRef.current;
        const pairId = s.pair?.pairId ?? s.lastPairId ?? undefined;
        send({ type: 'block', ...(pairId ? { pairId } : {}) });
      },
      sendSignal(data) {
        clientRef.current?.send({ type: 'signal', data });
      },
      onSignal(fn) {
        signalListeners.current.add(fn);
        return () => signalListeners.current.delete(fn);
      },
      clearNotice(id) {
        dispatch({ type: 'clear_notice', id });
      },
      reset() {
        dispatch({ type: 'reset' });
      },
    }),
    [send],
  );

  return [state, actions];
}
