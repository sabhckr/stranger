import type { SignalData } from '@stranger/protocol';

export type RtcState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface RtcSessionOptions {
  /** The non-initiator is "polite" and yields on offer collisions (perfect negotiation). */
  polite: boolean;
  iceServers: RTCIceServer[];
  localStream: MediaStream;
  sendSignal: (data: SignalData) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: RtcState) => void;
  /** Injectable for tests. */
  RTCPeerConnectionImpl?: typeof RTCPeerConnection;
}

/**
 * One peer connection per chat partner. Implements the W3C "perfect negotiation" pattern so both
 * sides can add tracks at any time without glare bugs.
 */
export class RtcSession {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;
  private closed = false;
  private readonly remoteStream = new MediaStream();

  constructor(private readonly opts: RtcSessionOptions) {
    const PC = opts.RTCPeerConnectionImpl ?? RTCPeerConnection;
    this.pc = new PC({ iceServers: opts.iceServers, bundlePolicy: 'max-bundle' });

    for (const track of opts.localStream.getTracks()) this.pc.addTrack(track, opts.localStream);

    this.pc.ontrack = ({ track, streams }) => {
      // Prefer the sender's stream (both tracks share it); fall back to a locally assembled one.
      const stream = streams[0];
      if (stream) {
        opts.onRemoteStream(stream);
        return;
      }
      this.remoteStream.addTrack(track);
      opts.onRemoteStream(this.remoteStream);
    };
    this.pc.onicecandidate = ({ candidate }) => {
      opts.sendSignal({ kind: 'candidate', candidate: candidate ? candidate.toJSON() : null });
    };
    this.pc.onnegotiationneeded = () => void this.negotiate();
    this.pc.onconnectionstatechange = () => this.emitState();
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'failed') void this.pc.restartIce();
      this.emitState();
    };
  }

  private emitState(): void {
    if (this.closed) return;
    const s = this.pc.connectionState;
    const mapped: RtcState =
      s === 'connected'
        ? 'connected'
        : s === 'failed'
          ? 'failed'
          : s === 'disconnected'
            ? 'disconnected'
            : s === 'closed'
              ? 'closed'
              : s === 'new'
                ? 'new'
                : 'connecting';
    this.opts.onState(mapped);
  }

  private async negotiate(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      const desc = this.pc.localDescription;
      if (desc)
        this.opts.sendSignal({
          kind: 'description',
          description: { type: desc.type, sdp: desc.sdp },
        });
    } catch (err) {
      console.warn('rtc: negotiation failed', err);
    } finally {
      this.makingOffer = false;
    }
  }

  async handleSignal(data: SignalData): Promise<void> {
    if (this.closed) return;
    try {
      if (data.kind === 'description') {
        const description = data.description;
        const readyForOffer =
          !this.makingOffer &&
          (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
        const offerCollision = description.type === 'offer' && !readyForOffer;
        this.ignoreOffer = !this.opts.polite && offerCollision;
        if (this.ignoreOffer) return;
        this.isSettingRemoteAnswerPending = description.type === 'answer';
        await this.pc.setRemoteDescription(description);
        this.isSettingRemoteAnswerPending = false;
        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          const local = this.pc.localDescription;
          if (local)
            this.opts.sendSignal({
              kind: 'description',
              description: { type: local.type, sdp: local.sdp },
            });
        }
      } else if (data.kind === 'candidate') {
        try {
          await this.pc.addIceCandidate(data.candidate ?? undefined);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn('rtc: signal handling failed', err);
    }
  }

  setAudioEnabled(enabled: boolean): void {
    for (const t of this.opts.localStream.getAudioTracks()) t.enabled = enabled;
  }

  setVideoEnabled(enabled: boolean): void {
    for (const t of this.opts.localStream.getVideoTracks()) t.enabled = enabled;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onnegotiationneeded = null;
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    for (const sender of this.pc.getSenders()) {
      try {
        this.pc.removeTrack(sender);
      } catch {
        /* already closed */
      }
    }
    this.pc.close();
    this.opts.onState('closed');
  }
}
