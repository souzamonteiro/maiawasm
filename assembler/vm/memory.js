'use strict';

const { Trap, ResourceLimitError } = require('./errors.js');
const { f32FromBits, f64FromBits, f32ToBits, f64ToBits } = require('./numeric.js');

const PAGE_SIZE = 65536;
const MAX_WASM32_PAGES = 65536;

class WasmMemory {
  constructor(descriptor = {}, limits = {}) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmMemory descriptor must be an object');
    }
    const minRaw = descriptor.initial !== undefined ? descriptor.initial : descriptor.minimum;
    if (!Number.isInteger(minRaw) || minRaw < 0 || minRaw > MAX_WASM32_PAGES) {
      throw new RangeError(`Invalid WasmMemory initial/minimum pages: ${minRaw}`);
    }
    const maxRaw = descriptor.maximum !== undefined ? descriptor.maximum : descriptor.max;
    if (maxRaw !== undefined) {
      if (!Number.isInteger(maxRaw) || maxRaw < 0 || maxRaw > MAX_WASM32_PAGES || maxRaw < minRaw) {
        throw new RangeError(`Invalid WasmMemory maximum pages: ${maxRaw}`);
      }
    }
    const maxPagesLimit = limits.maxMemoryPages !== undefined ? limits.maxMemoryPages : MAX_WASM32_PAGES;
    if (minRaw > maxPagesLimit) {
      throw new ResourceLimitError(`Initial memory pages (${minRaw}) exceed configured limit (${maxPagesLimit})`);
    }
    this.minimum = minRaw;
    this.maximum = maxRaw;
    this.maxPagesLimit = maxPagesLimit;
    this._buffer = new ArrayBuffer(minRaw * PAGE_SIZE);
    this._bytes = new Uint8Array(this._buffer);
    this._view = new DataView(this._buffer);
  }

  get buffer() {
    return this._buffer;
  }

  get bytes() {
    return this._bytes;
  }

  get view() {
    return this._view;
  }

  get pages() {
    return this._bytes.byteLength / PAGE_SIZE;
  }

  effectiveAddress(addr, offset, byteWidth) {
    const base = BigInt(addr >>> 0);
    const off = typeof offset === 'bigint' ? offset : BigInt(offset >>> 0);
    const ea = base + off;
    const end = ea + BigInt(byteWidth);
    if (ea < 0n || end > BigInt(this._bytes.byteLength)) {
      throw new Trap('out of bounds memory access');
    }
    return Number(ea);
  }

  grow(delta) {
    const d = delta >>> 0;
    const oldPages = this.pages;
    const newPages = oldPages + d;
    if (newPages > MAX_WASM32_PAGES) return -1;
    if (this.maximum !== undefined && newPages > this.maximum) return -1;
    if (this.maxPagesLimit !== undefined && newPages > this.maxPagesLimit) return -1;
    if (d === 0) return oldPages;
    try {
      const nextBuffer = new ArrayBuffer(newPages * PAGE_SIZE);
      const nextBytes = new Uint8Array(nextBuffer);
      nextBytes.set(this._bytes);
      this._buffer = nextBuffer;
      this._bytes = nextBytes;
      this._view = new DataView(nextBuffer);
      return oldPages;
    } catch (_) {
      return -1;
    }
  }

  fill(dst, value, length) {
    const d = BigInt(dst >>> 0);
    const n = BigInt(length >>> 0);
    if (d + n > BigInt(this._bytes.byteLength)) {
      throw new Trap('out of bounds memory access');
    }
    if (n > 0n) {
      this._bytes.fill(value & 0xff, Number(d), Number(d + n));
    }
  }

  copyTo(dstMemory, dst, src, length) {
    const d = BigInt(dst >>> 0);
    const s = BigInt(src >>> 0);
    const n = BigInt(length >>> 0);
    if (d + n > BigInt(dstMemory._bytes.byteLength) || s + n > BigInt(this._bytes.byteLength)) {
      throw new Trap('out of bounds memory access');
    }
    if (n === 0n) return;
    if (dstMemory === this) {
      this._bytes.copyWithin(Number(d), Number(s), Number(s + n));
    } else {
      dstMemory._bytes.set(this._bytes.subarray(Number(s), Number(s + n)), Number(d));
    }
  }

  initFromSegment(segment, dst, srcOffset, length) {
    const d = BigInt(dst >>> 0);
    const s = BigInt(srcOffset >>> 0);
    const n = BigInt(length >>> 0);
    const segLen = segment.dropped ? 0n : BigInt(segment.bytes.byteLength);
    if (d + n > BigInt(this._bytes.byteLength) || s + n > segLen) {
      throw new Trap('out of bounds memory access');
    }
    if (n > 0n) {
      this._bytes.set(segment.bytes.subarray(Number(s), Number(s + n)), Number(d));
    }
  }
}

function execScalarMemory(name, immediates, stack, memories) {
  const memarg = immediates.memarg;
  const mem = memories[memarg ? memarg.memoryIndex : (immediates.memoryIndex || 0)];
  switch (name) {
    case 'memory.size': {
      stack.push(mem.pages | 0);
      return true;
    }
    case 'memory.grow': {
      const delta = stack.pop() | 0;
      stack.push(mem.grow(delta) | 0);
      return true;
    }
    case 'i32.load': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      stack.push(mem._view.getInt32(ea, true));
      return true;
    }
    case 'i64.load': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      stack.push(mem._view.getBigInt64(ea, true));
      return true;
    }
    case 'f32.load': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      stack.push(f32FromBits(mem._view.getUint32(ea, true)));
      return true;
    }
    case 'f64.load': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      stack.push(f64FromBits(mem._view.getBigUint64(ea, true)));
      return true;
    }
    case 'i32.load8_s': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      stack.push(mem._view.getInt8(ea));
      return true;
    }
    case 'i32.load8_u': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      stack.push(mem._view.getUint8(ea));
      return true;
    }
    case 'i32.load16_s': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      stack.push(mem._view.getInt16(ea, true));
      return true;
    }
    case 'i32.load16_u': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      stack.push(mem._view.getUint16(ea, true));
      return true;
    }
    case 'i64.load8_s': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      stack.push(BigInt(mem._view.getInt8(ea)));
      return true;
    }
    case 'i64.load8_u': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      stack.push(BigInt(mem._view.getUint8(ea)));
      return true;
    }
    case 'i64.load16_s': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      stack.push(BigInt(mem._view.getInt16(ea, true)));
      return true;
    }
    case 'i64.load16_u': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      stack.push(BigInt(mem._view.getUint16(ea, true)));
      return true;
    }
    case 'i64.load32_s': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      stack.push(BigInt(mem._view.getInt32(ea, true)));
      return true;
    }
    case 'i64.load32_u': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      stack.push(BigInt(mem._view.getUint32(ea, true)));
      return true;
    }
    case 'i32.store': {
      const val = stack.pop() | 0;
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      mem._view.setInt32(ea, val, true);
      return true;
    }
    case 'i64.store': {
      const val = BigInt.asIntN(64, stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      mem._view.setBigInt64(ea, val, true);
      return true;
    }
    case 'f32.store': {
      const val = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      mem._view.setUint32(ea, f32ToBits(val), true);
      return true;
    }
    case 'f64.store': {
      const val = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      mem._view.setBigUint64(ea, f64ToBits(val), true);
      return true;
    }
    case 'i32.store8': {
      const val = stack.pop() | 0;
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      mem._view.setUint8(ea, val & 0xff);
      return true;
    }
    case 'i32.store16': {
      const val = stack.pop() | 0;
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      mem._view.setUint16(ea, val & 0xffff, true);
      return true;
    }
    case 'i64.store8': {
      const val = BigInt.asUintN(64, stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      mem._view.setUint8(ea, Number(val & 0xffn));
      return true;
    }
    case 'i64.store16': {
      const val = BigInt.asUintN(64, stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      mem._view.setUint16(ea, Number(val & 0xffffn), true);
      return true;
    }
    case 'i64.store32': {
      const val = BigInt.asUintN(64, stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      mem._view.setUint32(ea, Number(val & 0xffffffffn), true);
      return true;
    }
    default:
      return false;
  }
}

module.exports = {
  PAGE_SIZE,
  MAX_WASM32_PAGES,
  WasmMemory,
  execScalarMemory
};
