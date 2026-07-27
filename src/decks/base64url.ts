/**
 * base64url, not base64.
 *
 * The export payload travels in a URL — `deckhead://deck?d=<payload>` — and
 * standard base64's `+` and `/` are not URL-safe. `+` decodes as a space when a
 * link is parsed as a query string, which silently corrupts the deck. `=`
 * padding is dropped for the same reason and restored on decode.
 *
 * Implemented here rather than pulled in, because the alphabet is 64 characters
 * and the app has no other need for a Buffer polyfill.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const LOOKUP = (() => {
  const table = new Uint8Array(128).fill(255);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  // Accept standard base64 too, so a payload pasted from somewhere else still
  // decodes rather than failing on two characters.
  table['+'.charCodeAt(0)] = 62;
  table['/'.charCodeAt(0)] = 63;
  return table;
})();

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;

    out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;

    out += ALPHABET[c & 63];
  }

  return out;
}

/** Returns null on anything that is not valid base64url. */
export function decodeBase64Url(text: string): Uint8Array | null {
  const clean = text.trim().replace(/=+$/, '');
  if (clean.length % 4 === 1) return null;

  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let position = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code]! : 255;
    if (value === 255) return null;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[position] = (buffer >> bits) & 0xff;
      position += 1;
    }
  }

  return bytes.subarray(0, position);
}

/** UTF-8 encode without depending on TextEncoder being present. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }

  return new Uint8Array(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i]!;
    let code: number;
    let size: number;

    if (byte < 0x80) {
      code = byte;
      size = 1;
    } else if ((byte & 0xe0) === 0xc0) {
      code = byte & 31;
      size = 2;
    } else if ((byte & 0xf0) === 0xe0) {
      code = byte & 15;
      size = 3;
    } else {
      code = byte & 7;
      size = 4;
    }

    for (let j = 1; j < size; j += 1) {
      code = (code << 6) | (bytes[i + j]! & 63);
    }

    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023));
    } else {
      out += String.fromCharCode(code);
    }

    i += size;
  }

  return out;
}
