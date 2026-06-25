import { describe, expect, it } from 'vitest';
import {
  CONNECT_FLAG_END_STREAM,
  CONNECT_FLAG_TRAILER,
  concatBytes,
  decodeProtoValue,
  decodeString,
  decodeVarint,
  encodeBoolField,
  encodeBytesField,
  encodeConnectFrame,
  encodeProtoValue,
  encodeStringField,
  encodeVarint,
  encodeVarintField,
  findBytesField,
  findVarintField,
  parseConnectFrames,
  parseConnectTrailer,
  parseEndStreamError,
  parseProtoFields,
} from '../cursor-agent/proto';

describe('cursor proto: varint', () => {
  it('round-trips small and large varints', () => {
    for (const value of [0, 1, 127, 128, 300, 16384, 2_000_000]) {
      const encoded = encodeVarint(value);
      const decoded = decodeVarint(encoded, 0);
      expect(Number(decoded.value)).toBe(value);
      expect(decoded.bytesRead).toBe(encoded.length);
    }
  });

  it('round-trips 64-bit values as bigint', () => {
    const value = 1234567890123n;
    const decoded = decodeVarint(encodeVarint(value), 0);
    expect(decoded.value).toBe(value);
  });
});

describe('cursor proto: scalar fields', () => {
  it('encodes and parses a string field', () => {
    const bytes = encodeStringField(1, 'hello cursor');
    const fields = parseProtoFields(bytes);
    expect(fields).toHaveLength(1);
    const value = findBytesField(fields, 1);
    expect(value).toBeDefined();
    expect(decodeString(value!)).toBe('hello cursor');
  });

  it('omits empty strings (proto3 default)', () => {
    expect(encodeStringField(1, '')).toHaveLength(0);
  });

  it('omits zero varints and false bools (proto3 defaults)', () => {
    expect(encodeVarintField(4, 0)).toHaveLength(0);
    expect(encodeBoolField(39, false)).toHaveLength(0);
  });

  it('encodes a non-zero varint field readable as a number', () => {
    const bytes = encodeVarintField(4, 1);
    const fields = parseProtoFields(bytes);
    expect(findVarintField(fields, 4)).toBe(1);
  });

  it('encodes a true bool as varint 1', () => {
    const fields = parseProtoFields(encodeBoolField(39, true));
    expect(findVarintField(fields, 39)).toBe(1);
  });

  it('preserves UTF-8 multibyte content', () => {
    const text = 'café — 日本語 — 🚀';
    const value = findBytesField(parseProtoFields(encodeStringField(2, text)), 2);
    expect(decodeString(value!)).toBe(text);
  });
});

describe('cursor proto: nested messages', () => {
  it('parses multiple fields preserving field numbers', () => {
    const message = concatBytes(
      encodeStringField(1, 'model-x'),
      encodeVarintField(4, 1),
      encodeBytesField(2, encodeStringField(1, 'nested'))
    );
    const fields = parseProtoFields(message);
    expect(decodeString(findBytesField(fields, 1)!)).toBe('model-x');
    expect(findVarintField(fields, 4)).toBe(1);
    const nested = parseProtoFields(findBytesField(fields, 2)!);
    expect(decodeString(findBytesField(nested, 1)!)).toBe('nested');
  });

  it('encodes empty length-delimited fields (field presence preserved)', () => {
    const bytes = encodeBytesField(1, new Uint8Array(0));
    const fields = parseProtoFields(bytes);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.field).toBe(1);
    expect((fields[0]?.value as Uint8Array).length).toBe(0);
  });
});

describe('cursor proto: google.protobuf.Value', () => {
  it('round-trips a JSON tool schema', () => {
    const schema = {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'file path' },
        count: { type: 'number' },
        recursive: { type: 'boolean' },
        tags: { type: 'array' },
      },
      required: ['path'],
    };
    const decoded = decodeProtoValue(encodeProtoValue(schema));
    expect(decoded).toEqual(schema);
  });

  it('round-trips primitives including false and null', () => {
    expect(decodeProtoValue(encodeProtoValue('s'))).toBe('s');
    expect(decodeProtoValue(encodeProtoValue(42))).toBe(42);
    expect(decodeProtoValue(encodeProtoValue(true))).toBe(true);
    expect(decodeProtoValue(encodeProtoValue(false))).toBe(false);
    expect(decodeProtoValue(encodeProtoValue(null))).toBeNull();
  });

  it('round-trips nested arrays and objects', () => {
    const value = { a: [1, 2, { b: 'x' }], c: { d: [true, false] } };
    expect(decodeProtoValue(encodeProtoValue(value))).toEqual(value);
  });
});

describe('cursor proto: connect envelope framing', () => {
  it('frames and reparses a payload', () => {
    const payload = encodeStringField(1, 'frame-body');
    const framed = encodeConnectFrame(payload);
    expect(framed[0]).toBe(0);
    const { frames, consumed } = parseConnectFrames(framed);
    expect(consumed).toBe(framed.length);
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0]!.payload)).toEqual(Array.from(payload));
  });

  it('encodes the 4-byte big-endian length', () => {
    const payload = new Uint8Array(300).fill(7);
    const framed = encodeConnectFrame(payload);
    const length = (framed[1]! << 24) | (framed[2]! << 16) | (framed[3]! << 8) | framed[4]!;
    expect(length).toBe(300);
  });

  it('splits multiple concatenated frames', () => {
    const a = encodeConnectFrame(encodeStringField(1, 'a'));
    const b = encodeConnectFrame(encodeStringField(1, 'bb'));
    const { frames, consumed } = parseConnectFrames(concatBytes(a, b));
    expect(frames).toHaveLength(2);
    expect(consumed).toBe(a.length + b.length);
  });

  it('leaves a trailing partial frame unconsumed', () => {
    const full = encodeConnectFrame(encodeStringField(1, 'complete'));
    const partial = full.slice(0, full.length - 2);
    const buffer = concatBytes(full, partial);
    const { frames, consumed } = parseConnectFrames(buffer);
    expect(frames).toHaveLength(1);
    expect(consumed).toBe(full.length);
    // remaining bytes equal the partial frame
    expect(buffer.length - consumed).toBe(partial.length);
  });

  it('preserves flags on framed messages', () => {
    const end = encodeConnectFrame(new Uint8Array(0), CONNECT_FLAG_END_STREAM);
    const trailer = encodeConnectFrame(new Uint8Array(0), CONNECT_FLAG_TRAILER);
    expect(parseConnectFrames(end).frames[0]?.flags).toBe(CONNECT_FLAG_END_STREAM);
    expect(parseConnectFrames(trailer).frames[0]?.flags).toBe(CONNECT_FLAG_TRAILER);
  });
});

describe('cursor proto: trailer + end-stream parsing', () => {
  it('parses grpc trailer metadata', () => {
    const trailer = new TextEncoder().encode('grpc-status: 8\r\ngrpc-message: usage%20limit\r\n');
    const meta = parseConnectTrailer(trailer);
    expect(meta['grpc-status']).toBe('8');
    expect(meta['grpc-message']).toBe('usage%20limit');
  });

  it('extracts an error message from an end-stream JSON frame', () => {
    const json = new TextEncoder().encode(
      JSON.stringify({ error: { code: 'resource_exhausted', message: 'limit reached' } })
    );
    expect(parseEndStreamError(json)).toBe('limit reached (resource_exhausted)');
  });

  it('returns undefined for an empty end-stream frame', () => {
    expect(parseEndStreamError(new Uint8Array(0))).toBeUndefined();
  });
});
