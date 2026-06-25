/**
 * Hand-rolled protobuf wire primitives + Connect-RPC envelope framing for the
 * Cursor AgentService transport.
 *
 * Cursor's `agent.v1.AgentService` protos are not published, so we encode and
 * decode the wire format directly. Only the small subset of protobuf needed by
 * the AgentService messages is implemented:
 *   - wire type 0 (varint)         — int32/int64/bool/enum
 *   - wire type 1 (fixed 64-bit)   — double (used by google.protobuf.Value)
 *   - wire type 2 (length-delimited) — string/bytes/nested message
 *   - wire type 5 (fixed 32-bit)   — skipped on decode
 *
 * Everything here is deterministic and network-free so it can be unit-tested in
 * isolation.
 */

/** A protobuf wire field parsed out of a message body. */
export interface ProtoField {
  field: number;
  wireType: number;
  /** Length-delimited payload (wt 2), fixed bytes (wt 1/5), or a varint value (wt 0). */
  value: Uint8Array | bigint;
}

/** Connect-RPC envelope flag: this frame is the trailing EndStream frame. */
export const CONNECT_FLAG_END_STREAM = 0x02;
/** gRPC-style trailer frame flag (carries grpc-status / grpc-message). */
export const CONNECT_FLAG_TRAILER = 0x80;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ── Varint ──────────────────────────────────────────────────────────────────

/** Encode an unsigned varint (LEB128). Accepts number or bigint for 64-bit values. */
export function encodeVarint(value: number | bigint): Uint8Array {
  let v = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  if (v < 0n) {
    // Two's-complement 64-bit representation for negative ints (protobuf int32/64).
    v += 1n << 64n;
  }
  const bytes: number[] = [];
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Uint8Array.from(bytes);
}

/** Decode an unsigned varint at `offset`. Returns the value and bytes consumed. */
export function decodeVarint(
  buf: Uint8Array,
  offset: number
): { value: bigint; bytesRead: number } {
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;
  while (offset + bytesRead < buf.length) {
    const byte = buf[offset + bytesRead];
    if (byte === undefined) break;
    result |= BigInt(byte & 0x7f) << shift;
    bytesRead += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return { value: result, bytesRead };
}

// ── Field tag + scalar encoders ──────────────────────────────────────────────

function fieldTag(field: number, wireType: number): Uint8Array {
  return encodeVarint((field << 3) | wireType);
}

/** Concatenate byte chunks into one Uint8Array. */
export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Encode a length-delimited field (wire type 2) for raw bytes / nested messages.
 * Always emitted, even for empty payloads — Cursor relies on field presence
 * (e.g. the empty conversation-state blob on the first turn).
 */
export function encodeBytesField(field: number, data: Uint8Array): Uint8Array {
  return concatBytes(fieldTag(field, 2), encodeVarint(data.length), data);
}

/** Encode a UTF-8 string field. Empty strings are omitted (proto3 default). */
export function encodeStringField(field: number, value: string): Uint8Array {
  if (!value) return new Uint8Array(0);
  return encodeBytesField(field, textEncoder.encode(value));
}

/** Encode a varint scalar field (int32/int64/enum). Zero is omitted (proto3 default). */
export function encodeVarintField(field: number, value: number | bigint): Uint8Array {
  const isZero = typeof value === 'bigint' ? value === 0n : value === 0;
  if (isZero) return new Uint8Array(0);
  return concatBytes(fieldTag(field, 0), encodeVarint(value));
}

/** Encode a boolean field. `false` is omitted (proto3 default). */
export function encodeBoolField(field: number, value: boolean): Uint8Array {
  if (!value) return new Uint8Array(0);
  return concatBytes(fieldTag(field, 0), encodeVarint(1));
}

/** Encode a double field (wire type 1, little-endian IEEE-754). */
export function encodeDoubleField(field: number, value: number): Uint8Array {
  const tag = fieldTag(field, 1);
  const out = new Uint8Array(tag.length + 8);
  out.set(tag, 0);
  new DataView(out.buffer).setFloat64(tag.length, value, true);
  return out;
}

// ── Message parsing ──────────────────────────────────────────────────────────

/** Parse a protobuf message body into a flat list of fields (non-recursive). */
export function parseProtoFields(buf: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const tag = decodeVarint(buf, offset);
    if (tag.bytesRead === 0) break;
    offset += tag.bytesRead;
    const field = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x7n);

    if (wireType === 2) {
      const len = decodeVarint(buf, offset);
      offset += len.bytesRead;
      const end = offset + Number(len.value);
      if (end > buf.length) break;
      fields.push({ field, wireType, value: buf.slice(offset, end) });
      offset = end;
    } else if (wireType === 0) {
      const v = decodeVarint(buf, offset);
      offset += v.bytesRead;
      fields.push({ field, wireType, value: v.value });
    } else if (wireType === 1) {
      const end = offset + 8;
      if (end > buf.length) break;
      fields.push({ field, wireType, value: buf.slice(offset, end) });
      offset = end;
    } else if (wireType === 5) {
      const end = offset + 4;
      if (end > buf.length) break;
      fields.push({ field, wireType, value: buf.slice(offset, end) });
      offset = end;
    } else {
      // Unknown/unsupported wire type (3,4 groups) — stop to avoid misalignment.
      break;
    }
  }
  return fields;
}

/** Find the first length-delimited field with the given number. */
export function findBytesField(fields: ProtoField[], field: number): Uint8Array | undefined {
  for (const f of fields) {
    if (f.field === field && f.value instanceof Uint8Array) return f.value;
  }
  return undefined;
}

/** Decode a length-delimited field as UTF-8 text. */
export function decodeString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/** Read the first varint field with the given number as a number. */
export function findVarintField(fields: ProtoField[], field: number): number | undefined {
  for (const f of fields) {
    if (f.field === field && typeof f.value === 'bigint') return Number(f.value);
  }
  return undefined;
}

// ── google.protobuf.Value (dynamic JSON, used for tool input schemas) ─────────

/**
 * Encode an arbitrary JSON-serialisable value as a google.protobuf.Value.
 * oneof: 1=null, 2=number(double), 3=string, 4=bool, 5=Struct, 6=ListValue.
 */
export function encodeProtoValue(value: unknown): Uint8Array {
  if (value === null || value === undefined) {
    // NullValue enum is 0; emit explicit field so the value is non-empty.
    return concatBytes(fieldTag(1, 0), encodeVarint(0));
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? encodeDoubleField(2, value)
      : encodeStringField(3, String(value));
  }
  if (typeof value === 'string') return encodeStringField(3, value);
  if (typeof value === 'boolean') {
    // Value.bool_value is a present oneof member, so emit it even when false.
    return concatBytes(fieldTag(4, 0), encodeVarint(value ? 1 : 0));
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => encodeBytesField(1, encodeProtoValue(item)));
    return encodeBytesField(6, concatBytes(...items));
  }
  if (typeof value === 'object') {
    const entries: Uint8Array[] = [];
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const entry = concatBytes(
        encodeStringField(1, key),
        encodeBytesField(2, encodeProtoValue(val))
      );
      entries.push(encodeBytesField(1, entry));
    }
    return encodeBytesField(5, concatBytes(...entries));
  }
  return encodeStringField(3, String(value));
}

/** Decode a google.protobuf.Value back into a JSON value. */
export function decodeProtoValue(buf: Uint8Array): unknown {
  for (const f of parseProtoFields(buf)) {
    if (f.field === 1 && typeof f.value === 'bigint') return null;
    if (f.field === 2 && f.value instanceof Uint8Array && f.value.length === 8) {
      return new DataView(f.value.buffer, f.value.byteOffset, 8).getFloat64(0, true);
    }
    if (f.field === 3 && f.value instanceof Uint8Array) return decodeString(f.value);
    if (f.field === 4 && typeof f.value === 'bigint') return f.value === 1n;
    if (f.field === 5 && f.value instanceof Uint8Array) return decodeProtoStruct(f.value);
    if (f.field === 6 && f.value instanceof Uint8Array) return decodeProtoList(f.value);
  }
  return undefined;
}

function decodeProtoStruct(buf: Uint8Array): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of parseProtoFields(buf)) {
    if (f.field !== 1 || !(f.value instanceof Uint8Array)) continue;
    const entry = parseProtoFields(f.value);
    const keyBytes = findBytesField(entry, 1);
    const valBytes = findBytesField(entry, 2);
    if (keyBytes) out[decodeString(keyBytes)] = valBytes ? decodeProtoValue(valBytes) : undefined;
  }
  return out;
}

function decodeProtoList(buf: Uint8Array): unknown[] {
  const out: unknown[] = [];
  for (const f of parseProtoFields(buf)) {
    if (f.field === 1 && f.value instanceof Uint8Array) out.push(decodeProtoValue(f.value));
  }
  return out;
}

// ── Connect-RPC envelope framing ──────────────────────────────────────────────

/**
 * Wrap a message in a Connect envelope: `[1B flags][4B big-endian length][payload]`.
 * The same framing is used in both directions for `application/connect+proto`.
 */
export function encodeConnectFrame(payload: Uint8Array, flags = 0): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = flags & 0xff;
  const len = payload.length;
  out[1] = (len >>> 24) & 0xff;
  out[2] = (len >>> 16) & 0xff;
  out[3] = (len >>> 8) & 0xff;
  out[4] = len & 0xff;
  out.set(payload, 5);
  return out;
}

export interface ConnectFrame {
  flags: number;
  payload: Uint8Array;
}

export interface ConnectFrameParseResult {
  frames: ConnectFrame[];
  /** Bytes consumed from the front of `buf`; the caller keeps the remainder. */
  consumed: number;
}

/**
 * Parse as many complete Connect envelopes as possible from the front of `buf`.
 * Returns the decoded frames and the number of bytes consumed; any trailing
 * partial frame is left for the next read.
 */
export function parseConnectFrames(buf: Uint8Array): ConnectFrameParseResult {
  const frames: ConnectFrame[] = [];
  let offset = 0;
  while (offset + 5 <= buf.length) {
    const flags = buf[offset] ?? 0;
    const length =
      ((buf[offset + 1] ?? 0) << 24) |
      ((buf[offset + 2] ?? 0) << 16) |
      ((buf[offset + 3] ?? 0) << 8) |
      (buf[offset + 4] ?? 0);
    const frameEnd = offset + 5 + length;
    if (frameEnd > buf.length) break;
    frames.push({ flags, payload: buf.slice(offset + 5, frameEnd) });
    offset = frameEnd;
  }
  return { frames, consumed: offset };
}

/** Parse a Connect/gRPC trailer frame body (`key: value` lines) into a map. */
export function parseConnectTrailer(payload: Uint8Array): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const rawLine of decodeString(payload).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    if (key) meta[key] = line.slice(idx + 1).trim();
  }
  return meta;
}

/** Extract a human-readable error message from a Connect EndStream JSON frame. */
export function parseEndStreamError(payload: Uint8Array): string | undefined {
  const text = decodeString(payload).trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
    const message = parsed.error?.message;
    if (message) return parsed.error?.code ? `${message} (${parsed.error.code})` : message;
  } catch {
    // Non-JSON EndStream payloads carry no actionable error here.
  }
  return undefined;
}
