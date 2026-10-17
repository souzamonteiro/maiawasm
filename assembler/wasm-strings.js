'use strict';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function decodeUTF8(bytes, context = 'string') {
  try {
    return utf8Decoder.decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error(`Invalid UTF-8 (${context})`, { cause: error });
  }
}

function quoteWatBytes(bytes) {
  let text = '"';
  for (const byte of bytes) {
    text += byte >= 0x20 && byte <= 0x7e && byte !== 0x22 && byte !== 0x5c ?
      String.fromCharCode(byte) : `\\${byte.toString(16).padStart(2, '0')}`;
  }
  return `${text}"`;
}

function quoteWatName(name) {
  return quoteWatBytes(Buffer.from(name, 'utf8'));
}

function decodeWatString(raw) {
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') throw new Error('Invalid WAT string delimiters');
  const text = raw.slice(1, -1);
  const bytes = [];
  const appendScalar = value => {
    if (value < 0x80) bytes.push(value);
    else for (const byte of Buffer.from(String.fromCodePoint(value), 'utf8')) bytes.push(byte);
  };
  const escapes = { n: 10, t: 9, r: 13, '"': 34, "'": 39, '\\': 92 };
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\') {
      const escape = text[i + 1];
      if (Object.prototype.hasOwnProperty.call(escapes, escape)) {
        bytes.push(escapes[escape]);
        i += 2;
      } else if (/^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) {
        bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
        i += 3;
      } else if (escape === 'u') {
        const match = /^\\u\{([0-9a-fA-F](?:_?[0-9a-fA-F])*)\}/.exec(text.slice(i));
        if (!match) throw new Error(`Invalid WAT Unicode escape at string offset ${i}`);
        const value = Number.parseInt(match[1].replace(/_/g, ''), 16);
        if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
          throw new Error(`Invalid Unicode scalar in WAT string at offset ${i}`);
        }
        appendScalar(value);
        i += match[0].length;
      } else {
        throw new Error(`Invalid WAT string escape at offset ${i}`);
      }
    } else {
      const value = text.codePointAt(i);
      if (value < 0x20 || value === 0x7f || (value >= 0xd800 && value <= 0xdfff) || value === 0x22) {
        throw new Error(`Invalid character in WAT string at offset ${i}`);
      }
      appendScalar(value);
      i += value > 0xffff ? 2 : 1;
    }
  }
  return Buffer.from(bytes);
}

module.exports = { decodeUTF8, quoteWatBytes, quoteWatName, decodeWatString };
