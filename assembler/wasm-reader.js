'use strict';

const { decodeULEB128, decodeSLEB128, decodeValueType, decodeUTF8 } = require('./wasm-binary.js');

class BinaryReader {
  constructor(bytes, { start = 0, end = bytes?.length, baseOffset = 0, context = 'instruction immediate' } = {}) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('BinaryReader requires a Uint8Array');
    if (![start, end, baseOffset].every(Number.isSafeInteger) || start < 0 ||
        end < start || end > bytes.length || baseOffset < 0 || !Number.isSafeInteger(baseOffset + end)) {
      throw new RangeError('Invalid binary reader bounds');
    }
    this.bytes = bytes;
    this.offset = start;
    this.end = end;
    this.baseOffset = baseOffset;
    this.context = context;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, end);
  }

  ensure(count, context) {
    if (!Number.isSafeInteger(count) || count < 0 || count > this.end - this.offset) {
      throw new Error(`Truncated ${this.context} (${context}) at offset ${this.baseOffset + this.offset} (out of bounds, end=${this.baseOffset + this.end})`);
    }
  }

  readByte(context) {
    this.ensure(1, context);
    return this.bytes[this.offset++];
  }

  readBytes(count, context) {
    this.ensure(count, context);
    const start = this.offset;
    this.offset += count;
    return this.bytes.subarray(start, this.offset);
  }

  readULEB(context, width = 32, options) {
    this.ensure(1, `${context} ULEB128`);
    const result = decodeULEB128(this.bytes.subarray(0, this.end), this.offset, width, options);
    this.offset += result.bytesRead;
    return result.value;
  }

  readSLEB(context, width, options) {
    this.ensure(1, `${context} SLEB128`);
    const result = decodeSLEB128(this.bytes.subarray(0, this.end), this.offset, width, options);
    this.offset += result.bytesRead;
    return result.value;
  }

  readValueType(context, referenceOnly = false) {
    this.ensure(1, context);
    const result = decodeValueType(this.bytes.subarray(0, this.end), this.offset, referenceOnly, true);
    this.offset += result.bytesRead;
    return result.value;
  }

  readFloatBits(width) {
    if (width !== 32 && width !== 64) throw new Error(`Unsupported float width ${width}`);
    this.ensure(width / 8, `f${width} immediate`);
    const bits = width === 32 ? this.view.getUint32(this.offset, true) : this.view.getBigUint64(this.offset, true);
    this.offset += width / 8;
    return bits;
  }

  readCount(context, minimumEntryBytes = 1) {
    const count = this.readULEB(context);
    this.ensure(count * minimumEntryBytes, `${context} entries`);
    return count;
  }

  readUTF8String(context) {
    const length = this.readULEB(`${context} length`);
    this.ensure(length, `${context} bytes`);
    const text = decodeUTF8(this.bytes, this.offset, length);
    this.offset += length;
    return text;
  }
}

module.exports = { BinaryReader };
