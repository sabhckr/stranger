/**
 * STRANGER wire protocol — single source of truth shared by server, web client and tests.
 * Every WebSocket frame is a JSON object with a `type` discriminator and is validated with zod
 * on both ends. Changing anything here is a protocol change: bump PROTOCOL_VERSION.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

export const MAX_INTERESTS = 10;
export const INTEREST_MAX_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_REPORT_DETAILS_LENGTH = 1000;
export const MAX_TRANSCRIPT_LINES = 50;
export const MAX_SDP_LENGTH = 100_000;

/** WebSocket close codes used by the server (4000–4999 are application-defined). */
export const CloseCode = {
  INVALID_PROTOCOL: 4000,
  HANDSHAKE_TIMEOUT: 4001,
  REPLACED: 4002,
  BANNED: 4003,
  TOO_MANY_CONNECTIONS: 4004,
  ORIGIN_NOT_ALLOWED: 4005,
  ABUSE: 4008,
  SERVER_SHUTDOWN: 1012,
} as const;

export const ChatMode = z.enum(['text', 'video']);
export type ChatMode = z.infer<typeof ChatMode>;

/** Interests are normalised (trimmed, lower-cased) so "Music" and "music " match. */
export const Interest = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(INTEREST_MAX_LENGTH)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _+#.-]*$/u, 'Interest contains unsupported characters');
export const Interests = z.array(Interest).max(MAX_INTERESTS);

export const ReportReason = z.enum([
  'nudity',
  'harassment',
  'underage',
  'spam',
  'violence',
  'hate',
  'scam',
  'other',
]);
export type ReportReason = z.infer<typeof ReportReason>;

export const TranscriptLine = z.object({
  from: z.enum(['me', 'partner']),
  text: z.string().max(MAX_MESSAGE_LENGTH),
  ts: z.number().int().nonnegative(),
});
export type TranscriptLine = z.infer<typeof TranscriptLine>;

/** WebRTC signaling payloads relayed verbatim between the two peers of a pair. */
export const SignalData = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('description'),
    description: z.object({
      type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
      sdp: z.string().max(MAX_SDP_LENGTH).optional(),
    }),
  }),
  z.object({
    kind: z.literal('candidate'),
    candidate: z
      .object({
        candidate: z.string().max(4096).optional(),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .nullable(),
  }),
]);
export type SignalData = z.infer<typeof SignalData>;

// ---------------------------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------------------------
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    /** Random UUID generated once per browser; HMAC-hashed server-side before any storage. */
    clientId: z.uuid(),
    ageConfirmed: z.boolean(),
    termsAccepted: z.boolean(),
  }),
  z.object({ type: z.literal('find'), mode: ChatMode, interests: Interests }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('message'), text: z.string().min(1).max(MAX_MESSAGE_LENGTH) }),
  z.object({ type: z.literal('typing'), isTyping: z.boolean() }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('signal'), data: SignalData }),
  z.object({
    type: z.literal('report'),
    /** Current or most recent pair; lets a user report a partner who already left. */
    pairId: z.string().max(64).optional(),
    reason: ReportReason,
    details: z.string().max(MAX_REPORT_DETAILS_LENGTH).optional(),
    transcript: z.array(TranscriptLine).max(MAX_TRANSCRIPT_LINES).optional(),
  }),
  z.object({ type: z.literal('block'), pairId: z.string().max(64).optional() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
export type ClientMessageType = ClientMessage['type'];

// ---------------------------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------------------------
export const ErrorCode = z.enum([
  'invalid_message',
  'handshake_required',
  'consent_required',
  'not_matched',
  'already_searching',
  'rate_limited',
  'message_blocked',
  'banned',
  'too_many_connections',
  'unsupported_version',
  'server_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const PartnerLeftReason = z.enum(['next', 'stop', 'disconnected', 'moderated']);
export type PartnerLeftReason = z.infer<typeof PartnerLeftReason>;

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    sessionId: z.string(),
    onlineCount: z.number().int().nonnegative(),
    maxMessageLength: z.number().int().positive(),
    features: z.object({ video: z.boolean(), turn: z.boolean() }),
  }),
  z.object({ type: z.literal('idle') }),
  z.object({ type: z.literal('queued'), mode: ChatMode, interests: Interests }),
  z.object({
    type: z.literal('matched'),
    pairId: z.string(),
    mode: ChatMode,
    sharedInterests: z.array(z.string()),
    /** The initiator creates the WebRTC offer; the other side is the "polite" peer. */
    initiator: z.boolean(),
  }),
  z.object({ type: z.literal('message'), text: z.string(), ts: z.number().int() }),
  z.object({ type: z.literal('typing'), isTyping: z.boolean() }),
  z.object({ type: z.literal('partner_left'), reason: PartnerLeftReason }),
  z.object({ type: z.literal('signal'), data: SignalData }),
  z.object({ type: z.literal('presence'), onlineCount: z.number().int().nonnegative() }),
  z.object({ type: z.literal('report_ack'), reportId: z.string() }),
  z.object({ type: z.literal('block_ack') }),
  z.object({
    type: z.literal('banned'),
    reason: z.string(),
    expiresAt: z.number().int().nullable(),
  }),
  z.object({
    type: z.literal('error'),
    code: ErrorCode,
    message: z.string(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
export type ServerMessageType = ServerMessage['type'];

export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;
export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { type: T }>;

export function parseClientMessage(raw: unknown): z.ZodSafeParseResult<ClientMessage> {
  return ClientMessage.safeParse(raw);
}
export function parseServerMessage(raw: unknown): z.ZodSafeParseResult<ServerMessage> {
  return ServerMessage.safeParse(raw);
}

/** Normalise and de-duplicate a user-typed interest list. Invalid entries are dropped. */
export function normaliseInterests(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const candidate of input) {
    const parsed = Interest.safeParse(candidate);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}
