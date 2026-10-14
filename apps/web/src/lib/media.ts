export type MediaErrorKind =
  'denied' | 'no-device' | 'in-use' | 'insecure' | 'unsupported' | 'unknown';

export class MediaError extends Error {
  constructor(
    readonly kind: MediaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

export const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user',
  },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

/** Ask for camera + microphone. Only call this from a user gesture after explicit consent. */
export async function requestCameraAndMic(
  constraints: MediaStreamConstraints = MEDIA_CONSTRAINTS,
): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new MediaError('insecure', 'Camera access needs a secure (HTTPS or localhost) page.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaError('unsupported', 'This browser does not support camera access.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new MediaError(
        'denied',
        'Camera and microphone access was declined. Allow access in your browser to use video chat.',
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new MediaError('no-device', 'No camera or microphone was found.');
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new MediaError('in-use', 'Your camera is busy in another app.');
    }
    throw new MediaError('unknown', 'Could not start your camera.');
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}
