import { useCallback, useEffect, useState } from 'react';
import type { SignalData } from '@stranger/protocol';
import { fetchIceServers } from '../lib/api.js';
import { RtcSession, type RtcState } from '../lib/rtc.js';
import type { PairInfo } from './useChat.js';

export interface RtcControls {
  remoteStream: MediaStream | null;
  rtcState: RtcState | 'idle';
  turnAvailable: boolean | null;
  micEnabled: boolean;
  camEnabled: boolean;
  toggleMic(): void;
  toggleCam(): void;
}

interface SessionView {
  pairId: string;
  state: RtcState;
  remote: MediaStream | null;
}

/**
 * Creates one RtcSession per video pair and tears it down when the pair ends.
 * `localStream` must already be acquired with the user's consent.
 */
export function useRtc(
  pair: PairInfo | null,
  localStream: MediaStream | null,
  sendSignal: (data: SignalData) => void,
  onSignal: (fn: (data: SignalData) => void) => () => void,
): RtcControls {
  const [view, setView] = useState<SessionView | null>(null);
  const [turnAvailable, setTurnAvailable] = useState<boolean | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const pairId = pair?.mode === 'video' ? pair.pairId : null;
  const polite = pair ? !pair.initiator : true;

  useEffect(() => {
    if (!pairId || !localStream) return;
    let cancelled = false;
    let session: RtcSession | null = null;
    const pending: SignalData[] = [];
    const offSignal = onSignal((data) => {
      if (session) void session.handleSignal(data);
      else pending.push(data);
    });
    const patch = (fn: (v: SessionView) => SessionView) =>
      setView((v) => (v && v.pairId === pairId ? fn(v) : v));

    void (async () => {
      let iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
      try {
        const ice = await fetchIceServers();
        iceServers = ice.iceServers;
        setTurnAvailable(ice.turn);
      } catch (err) {
        console.warn('rtc: using default STUN; ICE config failed', err);
        setTurnAvailable(false);
      }
      if (cancelled) return;
      setView({ pairId, state: 'new', remote: null });
      session = new RtcSession({
        polite,
        iceServers,
        localStream,
        sendSignal,
        onRemoteStream: (remote) => patch((v) => ({ ...v, remote })),
        onState: (state) => patch((v) => ({ ...v, state })),
      });
      for (const data of pending.splice(0)) void session.handleSignal(data);
    })();

    return () => {
      cancelled = true;
      offSignal();
      session?.close();
    };
  }, [pairId, localStream, polite, sendSignal, onSignal]);

  // Track enablement is applied straight to the local tracks so it survives Next/rematch.
  useEffect(() => {
    for (const t of localStream?.getAudioTracks() ?? []) t.enabled = micEnabled;
  }, [localStream, micEnabled]);
  useEffect(() => {
    for (const t of localStream?.getVideoTracks() ?? []) t.enabled = camEnabled;
  }, [localStream, camEnabled]);

  const toggleMic = useCallback(() => setMicEnabled((v) => !v), []);
  const toggleCam = useCallback(() => setCamEnabled((v) => !v), []);

  const current = view && view.pairId === pairId ? view : null;
  const rtcState: RtcState | 'idle' = !pairId ? 'idle' : current ? current.state : 'connecting';
  return {
    remoteStream: current?.remote ?? null,
    rtcState,
    turnAvailable,
    micEnabled,
    camEnabled,
    toggleMic,
    toggleCam,
  };
}
