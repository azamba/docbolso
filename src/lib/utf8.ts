// UTF-8 helpers that don't depend on TextEncoder/TextDecoder being available in Hermes.

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) {
      cp = b;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** One char per UTF-8 byte, the form byte-oriented encoders (e.g. QR) expect. */
export function utf8BinaryString(text: string): string {
  let out = '';
  for (const b of utf8Encode(text)) out += String.fromCharCode(b);
  return out;
}
