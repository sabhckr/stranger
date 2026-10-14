import { useEffect, useRef } from 'react';
import type { ChatStatus } from '../hooks/useChat.js';
import type { RtcControls } from '../hooks/useRtc.js';

function attach(video: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!video) return;
  if (video.srcObject !== stream) video.srcObject = stream;
  if (stream) void video.play().catch(() => undefined);
}

export function VideoStage({
  localStream,
  rtc,
  status,
}: {
  localStream: MediaStream | null;
  rtc: RtcControls;
  status: ChatStatus;
}) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  useEffect(() => attach(remoteRef.current, rtc.remoteStream), [rtc.remoteStream]);
  useEffect(() => attach(localRef.current, localStream), [localStream]);

  const overlay =
    status === 'searching'
      ? { big: 'Looking for someone…', small: 'Your camera stays local until a partner connects.' }
      : status === 'chatting' && rtc.rtcState !== 'connected'
        ? rtc.rtcState === 'failed'
          ? {
              big: 'Could not connect video',
              small:
                rtc.turnAvailable === false
                  ? 'No relay (TURN) server is configured, so some networks cannot connect. Try Next.'
                  : 'Try Next to find someone else.',
            }
          : { big: 'Connecting video…', small: 'Setting up a direct, encrypted connection.' }
        : status === 'ended'
          ? { big: 'Stranger left', small: 'Press Next to meet someone else.' }
          : status === 'idle'
            ? { big: 'Ready', small: 'Press Next to start.' }
            : null;

  return (
    <section className="stage" aria-label="Video">
      <video
        ref={remoteRef}
        className="remote"
        autoPlay
        playsInline
        aria-label="Stranger's video"
        data-testid="remote-video"
      />
      <video
        ref={localRef}
        className="local"
        autoPlay
        playsInline
        muted
        aria-label="Your camera preview"
        data-testid="local-video"
      />
      {overlay && (
        <div className="overlay" role="status">
          <div>
            <div className="big">{overlay.big}</div>
            <div>{overlay.small}</div>
          </div>
        </div>
      )}
      <div className="stage-note">
        {status === 'chatting' && rtc.rtcState === 'connected' && (
          <span className="pill">Video connected</span>
        )}
        {rtc.turnAvailable === false && (
          <span className="pill pill-warn">No TURN relay configured</span>
        )}
      </div>
      <div className="stage-controls">
        <button
          type="button"
          className="btn btn-icon"
          aria-label={rtc.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={rtc.micEnabled}
          onClick={rtc.toggleMic}
        >
          {rtc.micEnabled ? '🎙' : '🔇'}
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={rtc.camEnabled ? 'Turn camera off' : 'Turn camera on'}
          aria-pressed={rtc.camEnabled}
          onClick={rtc.toggleCam}
        >
          {rtc.camEnabled ? '📷' : '🚫'}
        </button>
      </div>
    </section>
  );
}
