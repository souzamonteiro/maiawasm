'use strict';

const {
  F32_CANON_NAN_BITS,
  F64_CANON_NAN_BITS,
  f32FromBits,
  f64FromBits,
  f32ToBits,
  f64ToBits,
  popcnt32,
  nearestFloat,
  floatMin,
  floatMax,
  truncToInt
} = require('./numeric.js');

function createV128() {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer, bytes.byteOffset, 16);
  return { bytes, view };
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, 16);
}

function clampS8(x) { return x < -128 ? -128 : x > 127 ? 127 : x; }
function clampU8(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }
function clampS16(x) { return x < -32768 ? -32768 : x > 32767 ? 32767 : x; }
function clampU16(x) { return x < 0 ? 0 : x > 65535 ? 65535 : x; }

function readF32Lane(v, i) {
  return v.getFloat32(i * 4, true);
}

function writeF32Lane(v, i, x) {
  if (Number.isNaN(x)) {
    v.setUint32(i * 4, F32_CANON_NAN_BITS, true);
  } else {
    v.setFloat32(i * 4, Math.fround(x), true);
  }
}

function readF64Lane(v, i) {
  return v.getFloat64(i * 8, true);
}

function writeF64Lane(v, i, x) {
  if (Number.isNaN(x)) {
    v.setBigUint64(i * 8, F64_CANON_NAN_BITS, true);
  } else {
    v.setFloat64(i * 8, x, true);
  }
}

function unaryI8x16(stack, fn) {
  const a = stack.pop();
  const av = viewOf(a);
  const { bytes, view } = createV128();
  for (let i = 0; i < 16; i++) view.setInt8(i, fn(av.getInt8(i), av.getUint8(i)));
  stack.push(bytes);
}

function binaryI8x16(stack, fn) {
  const b = stack.pop(), a = stack.pop();
  const av = viewOf(a), bv = viewOf(b);
  const { bytes, view } = createV128();
  for (let i = 0; i < 16; i++) {
    view.setInt8(i, fn(av.getInt8(i), bv.getInt8(i), av.getUint8(i), bv.getUint8(i)));
  }
  stack.push(bytes);
}

function unaryI16x8(stack, fn) {
  const a = stack.pop();
  const av = viewOf(a);
  const { bytes, view } = createV128();
  for (let i = 0; i < 8; i++) view.setInt16(i * 2, fn(av.getInt16(i * 2, true), av.getUint16(i * 2, true)), true);
  stack.push(bytes);
}

function binaryI16x8(stack, fn) {
  const b = stack.pop(), a = stack.pop();
  const av = viewOf(a), bv = viewOf(b);
  const { bytes, view } = createV128();
  for (let i = 0; i < 8; i++) {
    view.setInt16(
      i * 2,
      fn(av.getInt16(i * 2, true), bv.getInt16(i * 2, true), av.getUint16(i * 2, true), bv.getUint16(i * 2, true)),
      true
    );
  }
  stack.push(bytes);
}

function unaryI32x4(stack, fn) {
  const a = stack.pop();
  const av = viewOf(a);
  const { bytes, view } = createV128();
  for (let i = 0; i < 4; i++) view.setInt32(i * 4, fn(av.getInt32(i * 4, true), av.getUint32(i * 4, true)), true);
  stack.push(bytes);
}

function binaryI32x4(stack, fn) {
  const b = stack.pop(), a = stack.pop();
  const av = viewOf(a), bv = viewOf(b);
  const { bytes, view } = createV128();
  for (let i = 0; i < 4; i++) {
    view.setInt32(
      i * 4,
      fn(av.getInt32(i * 4, true), bv.getInt32(i * 4, true), av.getUint32(i * 4, true), bv.getUint32(i * 4, true)),
      true
    );
  }
  stack.push(bytes);
}

function unaryI64x2(stack, fn) {
  const a = stack.pop();
  const av = viewOf(a);
  const { bytes, view } = createV128();
  for (let i = 0; i < 2; i++) view.setBigInt64(i * 8, BigInt.asIntN(64, fn(av.getBigInt64(i * 8, true), av.getBigUint64(i * 8, true))), true);
  stack.push(bytes);
}

function binaryI64x2(stack, fn) {
  const b = stack.pop(), a = stack.pop();
  const av = viewOf(a), bv = viewOf(b);
  const { bytes, view } = createV128();
  for (let i = 0; i < 2; i++) {
    view.setBigInt64(
      i * 8,
      BigInt.asIntN(64, fn(av.getBigInt64(i * 8, true), bv.getBigInt64(i * 8, true), av.getBigUint64(i * 8, true), bv.getBigUint64(i * 8, true))),
      true
    );
  }
  stack.push(bytes);
}

function unaryF32x4(stack, fn) {
  const a = stack.pop();
  const av = viewOf(a);
  const { bytes, view } = createV128();
  for (let i = 0; i < 4; i++) writeF32Lane(view, i, fn(readF32Lane(av, i)));
  stack.push(bytes);
}

function binaryF32x4(stack, fn) {
  const b = stack.pop(), a = stack.pop();
  const av = viewOf(a), bv = viewOf(b);
  const { bytes, view } = createV128();
  for (let i = 0; i < 4; i++) writeF32Lane(view, i, fn(readF32Lane(av, i), readF32Lane(bv, i)));
  stack.push(bytes);
}

function unaryF64x2(stack, fn) {
  const a = stack.pop();
  const av = viewOf(a);
  const { bytes, view } = createV128();
  for (let i = 0; i < 2; i++) writeF64Lane(view, i, fn(readF64Lane(av, i)));
  stack.push(bytes);
}

function binaryF64x2(stack, fn) {
  const b = stack.pop(), a = stack.pop();
  const av = viewOf(a), bv = viewOf(b);
  const { bytes, view } = createV128();
  for (let i = 0; i < 2; i++) writeF64Lane(view, i, fn(readF64Lane(av, i), readF64Lane(bv, i)));
  stack.push(bytes);
}

function execSIMD(name, immediates, stack, memories) {
  const memarg = immediates.memarg;
  const mem = memarg ? memories[memarg.memoryIndex] : null;

  switch (name) {
    // 1. Memory loads & stores
    case 'v128.load': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 16);
      stack.push(Uint8Array.from(mem._bytes.subarray(ea, ea + 16)));
      return true;
    }
    case 'v128.load8x8_s':
    case 'v128.load8x8_u': {
      const signed = name.endsWith('_s');
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) {
        const val = signed ? mem._view.getInt8(ea + i) : mem._view.getUint8(ea + i);
        view.setInt16(i * 2, val, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'v128.load16x4_s':
    case 'v128.load16x4_u': {
      const signed = name.endsWith('_s');
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const val = signed ? mem._view.getInt16(ea + i * 2, true) : mem._view.getUint16(ea + i * 2, true);
        view.setInt32(i * 4, val, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'v128.load32x2_s':
    case 'v128.load32x2_u': {
      const signed = name.endsWith('_s');
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const val = signed ? BigInt(mem._view.getInt32(ea + i * 4, true)) : BigInt(mem._view.getUint32(ea + i * 4, true));
        view.setBigInt64(i * 8, val, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'v128.load8_splat': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      const { bytes } = createV128();
      bytes.fill(mem._bytes[ea]);
      stack.push(bytes);
      return true;
    }
    case 'v128.load16_splat': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      const val = mem._view.getUint16(ea, true);
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) view.setUint16(i * 2, val, true);
      stack.push(bytes);
      return true;
    }
    case 'v128.load32_splat': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      const val = mem._view.getUint32(ea, true);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) view.setUint32(i * 4, val, true);
      stack.push(bytes);
      return true;
    }
    case 'v128.load64_splat': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      const val = mem._view.getBigUint64(ea, true);
      const { bytes, view } = createV128();
      view.setBigUint64(0, val, true);
      view.setBigUint64(8, val, true);
      stack.push(bytes);
      return true;
    }
    case 'v128.load32_zero': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      const { bytes, view } = createV128();
      view.setUint32(0, mem._view.getUint32(ea, true), true);
      stack.push(bytes);
      return true;
    }
    case 'v128.load64_zero': {
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      const { bytes, view } = createV128();
      view.setBigUint64(0, mem._view.getBigUint64(ea, true), true);
      stack.push(bytes);
      return true;
    }
    case 'v128.load8_lane': {
      const vec = Uint8Array.from(stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      vec[immediates.lane] = mem._bytes[ea];
      stack.push(vec);
      return true;
    }
    case 'v128.load16_lane': {
      const vec = Uint8Array.from(stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      viewOf(vec).setUint16(immediates.lane * 2, mem._view.getUint16(ea, true), true);
      stack.push(vec);
      return true;
    }
    case 'v128.load32_lane': {
      const vec = Uint8Array.from(stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      viewOf(vec).setUint32(immediates.lane * 4, mem._view.getUint32(ea, true), true);
      stack.push(vec);
      return true;
    }
    case 'v128.load64_lane': {
      const vec = Uint8Array.from(stack.pop());
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      viewOf(vec).setBigUint64(immediates.lane * 8, mem._view.getBigUint64(ea, true), true);
      stack.push(vec);
      return true;
    }
    case 'v128.store': {
      const vec = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 16);
      mem._bytes.set(vec, ea);
      return true;
    }
    case 'v128.store8_lane': {
      const vec = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 1);
      mem._bytes[ea] = vec[immediates.lane];
      return true;
    }
    case 'v128.store16_lane': {
      const vec = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 2);
      mem._view.setUint16(ea, viewOf(vec).getUint16(immediates.lane * 2, true), true);
      return true;
    }
    case 'v128.store32_lane': {
      const vec = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 4);
      mem._view.setUint32(ea, viewOf(vec).getUint32(immediates.lane * 4, true), true);
      return true;
    }
    case 'v128.store64_lane': {
      const vec = stack.pop();
      const addr = stack.pop() | 0;
      const ea = mem.effectiveAddress(addr, memarg.offset, 8);
      mem._view.setBigUint64(ea, viewOf(vec).getBigUint64(immediates.lane * 8, true), true);
      return true;
    }

    // 2. Const, shuffle, swizzle, splat, extract/replace lane
    case 'v128.const': {
      stack.push(Uint8Array.from(immediates.bytes));
      return true;
    }
    case 'i8x16.shuffle': {
      const b = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      const lanes = immediates.lanes;
      for (let i = 0; i < 16; i++) {
        const idx = lanes[i];
        out[i] = idx < 16 ? a[idx] : b[idx - 16];
      }
      stack.push(out);
      return true;
    }
    case 'i8x16.swizzle': {
      const s = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        const idx = s[i];
        out[i] = idx < 16 ? a[idx] : 0;
      }
      stack.push(out);
      return true;
    }
    case 'i8x16.splat': {
      const v = stack.pop() & 0xff;
      const out = new Uint8Array(16);
      out.fill(v);
      stack.push(out);
      return true;
    }
    case 'i16x8.splat': {
      const v = stack.pop() & 0xffff;
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) view.setUint16(i * 2, v, true);
      stack.push(bytes);
      return true;
    }
    case 'i32x4.splat': {
      const v = stack.pop() | 0;
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) view.setInt32(i * 4, v, true);
      stack.push(bytes);
      return true;
    }
    case 'i64x2.splat': {
      const v = BigInt.asIntN(64, stack.pop());
      const { bytes, view } = createV128();
      view.setBigInt64(0, v, true);
      view.setBigInt64(8, v, true);
      stack.push(bytes);
      return true;
    }
    case 'f32x4.splat': {
      const bits = f32ToBits(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) view.setUint32(i * 4, bits, true);
      stack.push(bytes);
      return true;
    }
    case 'f64x2.splat': {
      const bits = f64ToBits(stack.pop());
      const { bytes, view } = createV128();
      view.setBigUint64(0, bits, true);
      view.setBigUint64(8, bits, true);
      stack.push(bytes);
      return true;
    }
    case 'i8x16.extract_lane_s': {
      const vec = stack.pop();
      stack.push(viewOf(vec).getInt8(immediates.lane));
      return true;
    }
    case 'i8x16.extract_lane_u': {
      const vec = stack.pop();
      stack.push(vec[immediates.lane]);
      return true;
    }
    case 'i8x16.replace_lane': {
      const val = stack.pop() & 0xff;
      const vec = Uint8Array.from(stack.pop());
      vec[immediates.lane] = val;
      stack.push(vec);
      return true;
    }
    case 'i16x8.extract_lane_s': {
      const vec = stack.pop();
      stack.push(viewOf(vec).getInt16(immediates.lane * 2, true));
      return true;
    }
    case 'i16x8.extract_lane_u': {
      const vec = stack.pop();
      stack.push(viewOf(vec).getUint16(immediates.lane * 2, true));
      return true;
    }
    case 'i16x8.replace_lane': {
      const val = stack.pop() & 0xffff;
      const vec = Uint8Array.from(stack.pop());
      viewOf(vec).setUint16(immediates.lane * 2, val, true);
      stack.push(vec);
      return true;
    }
    case 'i32x4.extract_lane': {
      const vec = stack.pop();
      stack.push(viewOf(vec).getInt32(immediates.lane * 4, true));
      return true;
    }
    case 'i32x4.replace_lane': {
      const val = stack.pop() | 0;
      const vec = Uint8Array.from(stack.pop());
      viewOf(vec).setInt32(immediates.lane * 4, val, true);
      stack.push(vec);
      return true;
    }
    case 'i64x2.extract_lane': {
      const vec = stack.pop();
      stack.push(viewOf(vec).getBigInt64(immediates.lane * 8, true));
      return true;
    }
    case 'i64x2.replace_lane': {
      const val = BigInt.asIntN(64, stack.pop());
      const vec = Uint8Array.from(stack.pop());
      viewOf(vec).setBigInt64(immediates.lane * 8, val, true);
      stack.push(vec);
      return true;
    }
    case 'f32x4.extract_lane': {
      const vec = stack.pop();
      stack.push(f32FromBits(viewOf(vec).getUint32(immediates.lane * 4, true)));
      return true;
    }
    case 'f32x4.replace_lane': {
      const bits = f32ToBits(stack.pop());
      const vec = Uint8Array.from(stack.pop());
      viewOf(vec).setUint32(immediates.lane * 4, bits, true);
      stack.push(vec);
      return true;
    }
    case 'f64x2.extract_lane': {
      const vec = stack.pop();
      stack.push(f64FromBits(viewOf(vec).getBigUint64(immediates.lane * 8, true)));
      return true;
    }
    case 'f64x2.replace_lane': {
      const bits = f64ToBits(stack.pop());
      const vec = Uint8Array.from(stack.pop());
      viewOf(vec).setBigUint64(immediates.lane * 8, bits, true);
      stack.push(vec);
      return true;
    }

    // 3. Bitwise & predicates
    case 'v128.not': {
      const a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = (~a[i]) & 0xff;
      stack.push(out);
      return true;
    }
    case 'v128.and': {
      const b = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = a[i] & b[i];
      stack.push(out);
      return true;
    }
    case 'v128.andnot': {
      const b = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = a[i] & (~b[i]);
      stack.push(out);
      return true;
    }
    case 'v128.or': {
      const b = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = a[i] | b[i];
      stack.push(out);
      return true;
    }
    case 'v128.xor': {
      const b = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i];
      stack.push(out);
      return true;
    }
    case 'v128.bitselect': {
      const c = stack.pop(), b = stack.pop(), a = stack.pop();
      const out = new Uint8Array(16);
      for (let i = 0; i < 16; i++) out[i] = (a[i] & c[i]) | (b[i] & (~c[i]));
      stack.push(out);
      return true;
    }
    case 'v128.any_true': {
      const a = stack.pop();
      let any = 0;
      for (let i = 0; i < 16; i++) {
        if (a[i] !== 0) { any = 1; break; }
      }
      stack.push(any);
      return true;
    }
    case 'i8x16.all_true': {
      const a = stack.pop();
      let all = 1;
      for (let i = 0; i < 16; i++) {
        if (a[i] === 0) { all = 0; break; }
      }
      stack.push(all);
      return true;
    }
    case 'i16x8.all_true': {
      const av = viewOf(stack.pop());
      let all = 1;
      for (let i = 0; i < 8; i++) {
        if (av.getUint16(i * 2, true) === 0) { all = 0; break; }
      }
      stack.push(all);
      return true;
    }
    case 'i32x4.all_true': {
      const av = viewOf(stack.pop());
      let all = 1;
      for (let i = 0; i < 4; i++) {
        if (av.getUint32(i * 4, true) === 0) { all = 0; break; }
      }
      stack.push(all);
      return true;
    }
    case 'i64x2.all_true': {
      const av = viewOf(stack.pop());
      const all = (av.getBigUint64(0, true) !== 0n && av.getBigUint64(8, true) !== 0n) ? 1 : 0;
      stack.push(all);
      return true;
    }
    case 'i8x16.bitmask': {
      const a = stack.pop();
      let mask = 0;
      for (let i = 0; i < 16; i++) {
        if (a[i] & 0x80) mask |= (1 << i);
      }
      stack.push(mask);
      return true;
    }
    case 'i16x8.bitmask': {
      const av = viewOf(stack.pop());
      let mask = 0;
      for (let i = 0; i < 8; i++) {
        if (av.getInt16(i * 2, true) < 0) mask |= (1 << i);
      }
      stack.push(mask);
      return true;
    }
    case 'i32x4.bitmask': {
      const av = viewOf(stack.pop());
      let mask = 0;
      for (let i = 0; i < 4; i++) {
        if (av.getInt32(i * 4, true) < 0) mask |= (1 << i);
      }
      stack.push(mask);
      return true;
    }
    case 'i64x2.bitmask': {
      const av = viewOf(stack.pop());
      let mask = 0;
      if (av.getBigInt64(0, true) < 0n) mask |= 1;
      if (av.getBigInt64(8, true) < 0n) mask |= 2;
      stack.push(mask);
      return true;
    }

    // 4. Comparisons
    case 'i8x16.eq': binaryI8x16(stack, (a, b) => a === b ? -1 : 0); return true;
    case 'i8x16.ne': binaryI8x16(stack, (a, b) => a !== b ? -1 : 0); return true;
    case 'i8x16.lt_s': binaryI8x16(stack, (a, b) => a < b ? -1 : 0); return true;
    case 'i8x16.lt_u': binaryI8x16(stack, (_a, _b, ua, ub) => ua < ub ? -1 : 0); return true;
    case 'i8x16.gt_s': binaryI8x16(stack, (a, b) => a > b ? -1 : 0); return true;
    case 'i8x16.gt_u': binaryI8x16(stack, (_a, _b, ua, ub) => ua > ub ? -1 : 0); return true;
    case 'i8x16.le_s': binaryI8x16(stack, (a, b) => a <= b ? -1 : 0); return true;
    case 'i8x16.le_u': binaryI8x16(stack, (_a, _b, ua, ub) => ua <= ub ? -1 : 0); return true;
    case 'i8x16.ge_s': binaryI8x16(stack, (a, b) => a >= b ? -1 : 0); return true;
    case 'i8x16.ge_u': binaryI8x16(stack, (_a, _b, ua, ub) => ua >= ub ? -1 : 0); return true;

    case 'i16x8.eq': binaryI16x8(stack, (a, b) => a === b ? -1 : 0); return true;
    case 'i16x8.ne': binaryI16x8(stack, (a, b) => a !== b ? -1 : 0); return true;
    case 'i16x8.lt_s': binaryI16x8(stack, (a, b) => a < b ? -1 : 0); return true;
    case 'i16x8.lt_u': binaryI16x8(stack, (_a, _b, ua, ub) => ua < ub ? -1 : 0); return true;
    case 'i16x8.gt_s': binaryI16x8(stack, (a, b) => a > b ? -1 : 0); return true;
    case 'i16x8.gt_u': binaryI16x8(stack, (_a, _b, ua, ub) => ua > ub ? -1 : 0); return true;
    case 'i16x8.le_s': binaryI16x8(stack, (a, b) => a <= b ? -1 : 0); return true;
    case 'i16x8.le_u': binaryI16x8(stack, (_a, _b, ua, ub) => ua <= ub ? -1 : 0); return true;
    case 'i16x8.ge_s': binaryI16x8(stack, (a, b) => a >= b ? -1 : 0); return true;
    case 'i16x8.ge_u': binaryI16x8(stack, (_a, _b, ua, ub) => ua >= ub ? -1 : 0); return true;

    case 'i32x4.eq': binaryI32x4(stack, (a, b) => a === b ? -1 : 0); return true;
    case 'i32x4.ne': binaryI32x4(stack, (a, b) => a !== b ? -1 : 0); return true;
    case 'i32x4.lt_s': binaryI32x4(stack, (a, b) => a < b ? -1 : 0); return true;
    case 'i32x4.lt_u': binaryI32x4(stack, (_a, _b, ua, ub) => ua < ub ? -1 : 0); return true;
    case 'i32x4.gt_s': binaryI32x4(stack, (a, b) => a > b ? -1 : 0); return true;
    case 'i32x4.gt_u': binaryI32x4(stack, (_a, _b, ua, ub) => ua > ub ? -1 : 0); return true;
    case 'i32x4.le_s': binaryI32x4(stack, (a, b) => a <= b ? -1 : 0); return true;
    case 'i32x4.le_u': binaryI32x4(stack, (_a, _b, ua, ub) => ua <= ub ? -1 : 0); return true;
    case 'i32x4.ge_s': binaryI32x4(stack, (a, b) => a >= b ? -1 : 0); return true;
    case 'i32x4.ge_u': binaryI32x4(stack, (_a, _b, ua, ub) => ua >= ub ? -1 : 0); return true;

    case 'i64x2.eq': binaryI64x2(stack, (a, b) => a === b ? -1n : 0n); return true;
    case 'i64x2.ne': binaryI64x2(stack, (a, b) => a !== b ? -1n : 0n); return true;
    case 'i64x2.lt_s': binaryI64x2(stack, (a, b) => a < b ? -1n : 0n); return true;
    case 'i64x2.gt_s': binaryI64x2(stack, (a, b) => a > b ? -1n : 0n); return true;
    case 'i64x2.le_s': binaryI64x2(stack, (a, b) => a <= b ? -1n : 0n); return true;
    case 'i64x2.ge_s': binaryI64x2(stack, (a, b) => a >= b ? -1n : 0n); return true;

    case 'f32x4.eq':
    case 'f32x4.ne':
    case 'f32x4.lt':
    case 'f32x4.gt':
    case 'f32x4.le':
    case 'f32x4.ge': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const fa = readF32Lane(av, i), fb = readF32Lane(bv, i);
        let cond = false;
        if (name === 'f32x4.eq') cond = fa === fb;
        else if (name === 'f32x4.ne') cond = fa !== fb;
        else if (name === 'f32x4.lt') cond = fa < fb;
        else if (name === 'f32x4.gt') cond = fa > fb;
        else if (name === 'f32x4.le') cond = fa <= fb;
        else if (name === 'f32x4.ge') cond = fa >= fb;
        view.setInt32(i * 4, cond ? -1 : 0, true);
      }
      stack.push(bytes);
      return true;
    }

    case 'f64x2.eq':
    case 'f64x2.ne':
    case 'f64x2.lt':
    case 'f64x2.gt':
    case 'f64x2.le':
    case 'f64x2.ge': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const fa = readF64Lane(av, i), fb = readF64Lane(bv, i);
        let cond = false;
        if (name === 'f64x2.eq') cond = fa === fb;
        else if (name === 'f64x2.ne') cond = fa !== fb;
        else if (name === 'f64x2.lt') cond = fa < fb;
        else if (name === 'f64x2.gt') cond = fa > fb;
        else if (name === 'f64x2.le') cond = fa <= fb;
        else if (name === 'f64x2.ge') cond = fa >= fb;
        view.setBigInt64(i * 8, cond ? -1n : 0n, true);
      }
      stack.push(bytes);
      return true;
    }

    // 5. i8x16 operations
    case 'i8x16.abs': unaryI8x16(stack, a => Math.abs(a)); return true;
    case 'i8x16.neg': unaryI8x16(stack, a => -a); return true;
    case 'i8x16.popcnt': unaryI8x16(stack, (_a, ua) => popcnt32(ua)); return true;
    case 'i8x16.narrow_i16x8_s':
    case 'i8x16.narrow_i16x8_u': {
      const signed = name.endsWith('_s');
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) {
        const va = av.getInt16(i * 2, true);
        const vb = bv.getInt16(i * 2, true);
        if (signed) {
          view.setInt8(i, clampS8(va));
          view.setInt8(i + 8, clampS8(vb));
        } else {
          view.setUint8(i, clampU8(va));
          view.setUint8(i + 8, clampU8(vb));
        }
      }
      stack.push(bytes);
      return true;
    }
    case 'i8x16.shl': {
      const shift = stack.pop() & 7;
      unaryI8x16(stack, a => a << shift);
      return true;
    }
    case 'i8x16.shr_s': {
      const shift = stack.pop() & 7;
      unaryI8x16(stack, a => a >> shift);
      return true;
    }
    case 'i8x16.shr_u': {
      const shift = stack.pop() & 7;
      unaryI8x16(stack, (_a, ua) => ua >>> shift);
      return true;
    }
    case 'i8x16.add': binaryI8x16(stack, (a, b) => a + b); return true;
    case 'i8x16.add_sat_s': binaryI8x16(stack, (a, b) => clampS8(a + b)); return true;
    case 'i8x16.add_sat_u': binaryI8x16(stack, (_a, _b, ua, ub) => clampU8(ua + ub)); return true;
    case 'i8x16.sub': binaryI8x16(stack, (a, b) => a - b); return true;
    case 'i8x16.sub_sat_s': binaryI8x16(stack, (a, b) => clampS8(a - b)); return true;
    case 'i8x16.sub_sat_u': binaryI8x16(stack, (_a, _b, ua, ub) => clampU8(ua - ub)); return true;
    case 'i8x16.min_s': binaryI8x16(stack, (a, b) => a < b ? a : b); return true;
    case 'i8x16.min_u': binaryI8x16(stack, (_a, _b, ua, ub) => ua < ub ? ua : ub); return true;
    case 'i8x16.max_s': binaryI8x16(stack, (a, b) => a > b ? a : b); return true;
    case 'i8x16.max_u': binaryI8x16(stack, (_a, _b, ua, ub) => ua > ub ? ua : ub); return true;
    case 'i8x16.avgr_u': binaryI8x16(stack, (_a, _b, ua, ub) => (ua + ub + 1) >>> 1); return true;

    // 6. i16x8 operations
    case 'i16x8.extadd_pairwise_i8x16_s':
    case 'i16x8.extadd_pairwise_i8x16_u': {
      const signed = name.endsWith('_s');
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) {
        const x = signed ? av.getInt8(i * 2) : av.getUint8(i * 2);
        const y = signed ? av.getInt8(i * 2 + 1) : av.getUint8(i * 2 + 1);
        view.setInt16(i * 2, x + y, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'i16x8.abs': unaryI16x8(stack, a => Math.abs(a)); return true;
    case 'i16x8.neg': unaryI16x8(stack, a => -a); return true;
    case 'i16x8.q15mulr_sat_s': binaryI16x8(stack, (a, b) => clampS16((a * b + 0x4000) >> 15)); return true;
    case 'i16x8.narrow_i32x4_s':
    case 'i16x8.narrow_i32x4_u': {
      const signed = name.endsWith('_s');
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const va = av.getInt32(i * 4, true);
        const vb = bv.getInt32(i * 4, true);
        if (signed) {
          view.setInt16(i * 2, clampS16(va), true);
          view.setInt16((i + 4) * 2, clampS16(vb), true);
        } else {
          view.setUint16(i * 2, clampU16(va), true);
          view.setUint16((i + 4) * 2, clampU16(vb), true);
        }
      }
      stack.push(bytes);
      return true;
    }
    case 'i16x8.extend_low_i8x16_s':
    case 'i16x8.extend_high_i8x16_s':
    case 'i16x8.extend_low_i8x16_u':
    case 'i16x8.extend_high_i8x16_u': {
      const signed = name.endsWith('_s');
      const base = name.includes('_high_') ? 8 : 0;
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) {
        const v = signed ? av.getInt8(base + i) : av.getUint8(base + i);
        view.setInt16(i * 2, v, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'i16x8.shl': {
      const shift = stack.pop() & 15;
      unaryI16x8(stack, a => a << shift);
      return true;
    }
    case 'i16x8.shr_s': {
      const shift = stack.pop() & 15;
      unaryI16x8(stack, a => a >> shift);
      return true;
    }
    case 'i16x8.shr_u': {
      const shift = stack.pop() & 15;
      unaryI16x8(stack, (_a, ua) => ua >>> shift);
      return true;
    }
    case 'i16x8.add': binaryI16x8(stack, (a, b) => a + b); return true;
    case 'i16x8.add_sat_s': binaryI16x8(stack, (a, b) => clampS16(a + b)); return true;
    case 'i16x8.add_sat_u': binaryI16x8(stack, (_a, _b, ua, ub) => clampU16(ua + ub)); return true;
    case 'i16x8.sub': binaryI16x8(stack, (a, b) => a - b); return true;
    case 'i16x8.sub_sat_s': binaryI16x8(stack, (a, b) => clampS16(a - b)); return true;
    case 'i16x8.sub_sat_u': binaryI16x8(stack, (_a, _b, ua, ub) => clampU16(ua - ub)); return true;
    case 'i16x8.mul': binaryI16x8(stack, (a, b) => Math.imul(a, b)); return true;
    case 'i16x8.min_s': binaryI16x8(stack, (a, b) => a < b ? a : b); return true;
    case 'i16x8.min_u': binaryI16x8(stack, (_a, _b, ua, ub) => ua < ub ? ua : ub); return true;
    case 'i16x8.max_s': binaryI16x8(stack, (a, b) => a > b ? a : b); return true;
    case 'i16x8.max_u': binaryI16x8(stack, (_a, _b, ua, ub) => ua > ub ? ua : ub); return true;
    case 'i16x8.avgr_u': binaryI16x8(stack, (_a, _b, ua, ub) => (ua + ub + 1) >>> 1); return true;
    case 'i16x8.extmul_low_i8x16_s':
    case 'i16x8.extmul_high_i8x16_s':
    case 'i16x8.extmul_low_i8x16_u':
    case 'i16x8.extmul_high_i8x16_u': {
      const signed = name.endsWith('_s');
      const base = name.includes('_high_') ? 8 : 0;
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 8; i++) {
        const va = signed ? av.getInt8(base + i) : av.getUint8(base + i);
        const vb = signed ? bv.getInt8(base + i) : bv.getUint8(base + i);
        view.setInt16(i * 2, va * vb, true);
      }
      stack.push(bytes);
      return true;
    }

    // 7. i32x4 operations
    case 'i32x4.extadd_pairwise_i16x8_s':
    case 'i32x4.extadd_pairwise_i16x8_u': {
      const signed = name.endsWith('_s');
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const x = signed ? av.getInt16((i * 2) * 2, true) : av.getUint16((i * 2) * 2, true);
        const y = signed ? av.getInt16((i * 2 + 1) * 2, true) : av.getUint16((i * 2 + 1) * 2, true);
        view.setInt32(i * 4, (x + y) | 0, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'i32x4.abs': unaryI32x4(stack, a => Math.abs(a) | 0); return true;
    case 'i32x4.neg': unaryI32x4(stack, a => (-a) | 0); return true;
    case 'i32x4.extend_low_i16x8_s':
    case 'i32x4.extend_high_i16x8_s':
    case 'i32x4.extend_low_i16x8_u':
    case 'i32x4.extend_high_i16x8_u': {
      const signed = name.endsWith('_s');
      const base = name.includes('_high_') ? 4 : 0;
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const v = signed ? av.getInt16((base + i) * 2, true) : av.getUint16((base + i) * 2, true);
        view.setInt32(i * 4, v, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'i32x4.shl': {
      const shift = stack.pop() & 31;
      unaryI32x4(stack, a => a << shift);
      return true;
    }
    case 'i32x4.shr_s': {
      const shift = stack.pop() & 31;
      unaryI32x4(stack, a => a >> shift);
      return true;
    }
    case 'i32x4.shr_u': {
      const shift = stack.pop() & 31;
      unaryI32x4(stack, (_a, ua) => (ua >>> shift) | 0);
      return true;
    }
    case 'i32x4.add': binaryI32x4(stack, (a, b) => (a + b) | 0); return true;
    case 'i32x4.sub': binaryI32x4(stack, (a, b) => (a - b) | 0); return true;
    case 'i32x4.mul': binaryI32x4(stack, (a, b) => Math.imul(a, b)); return true;
    case 'i32x4.min_s': binaryI32x4(stack, (a, b) => a < b ? a : b); return true;
    case 'i32x4.min_u': binaryI32x4(stack, (_a, _b, ua, ub) => (ua < ub ? ua : ub) | 0); return true;
    case 'i32x4.max_s': binaryI32x4(stack, (a, b) => a > b ? a : b); return true;
    case 'i32x4.max_u': binaryI32x4(stack, (_a, _b, ua, ub) => (ua > ub ? ua : ub) | 0); return true;
    case 'i32x4.dot_i16x8_s': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const a0 = av.getInt16((i * 2) * 2, true);
        const a1 = av.getInt16((i * 2 + 1) * 2, true);
        const b0 = bv.getInt16((i * 2) * 2, true);
        const b1 = bv.getInt16((i * 2 + 1) * 2, true);
        view.setInt32(i * 4, (Math.imul(a0, b0) + Math.imul(a1, b1)) | 0, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'i32x4.extmul_low_i16x8_s':
    case 'i32x4.extmul_high_i16x8_s':
    case 'i32x4.extmul_low_i16x8_u':
    case 'i32x4.extmul_high_i16x8_u': {
      const signed = name.endsWith('_s');
      const base = name.includes('_high_') ? 4 : 0;
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const va = signed ? av.getInt16((base + i) * 2, true) : av.getUint16((base + i) * 2, true);
        const vb = signed ? bv.getInt16((base + i) * 2, true) : bv.getUint16((base + i) * 2, true);
        view.setInt32(i * 4, Math.imul(va, vb), true);
      }
      stack.push(bytes);
      return true;
    }

    // 8. i64x2 operations
    case 'i64x2.abs': unaryI64x2(stack, a => a < 0n ? -a : a); return true;
    case 'i64x2.neg': unaryI64x2(stack, a => -a); return true;
    case 'i64x2.extend_low_i32x4_s':
    case 'i64x2.extend_high_i32x4_s':
    case 'i64x2.extend_low_i32x4_u':
    case 'i64x2.extend_high_i32x4_u': {
      const signed = name.endsWith('_s');
      const base = name.includes('_high_') ? 2 : 0;
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const v = signed ? BigInt(av.getInt32((base + i) * 4, true)) : BigInt(av.getUint32((base + i) * 4, true));
        view.setBigInt64(i * 8, v, true);
      }
      stack.push(bytes);
      return true;
    }
    case 'i64x2.shl': {
      const shift = BigInt(stack.pop() & 63);
      unaryI64x2(stack, a => a << shift);
      return true;
    }
    case 'i64x2.shr_s': {
      const shift = BigInt(stack.pop() & 63);
      unaryI64x2(stack, a => a >> shift);
      return true;
    }
    case 'i64x2.shr_u': {
      const shift = BigInt(stack.pop() & 63);
      unaryI64x2(stack, (_a, ua) => ua >> shift);
      return true;
    }
    case 'i64x2.add': binaryI64x2(stack, (a, b) => a + b); return true;
    case 'i64x2.sub': binaryI64x2(stack, (a, b) => a - b); return true;
    case 'i64x2.mul': binaryI64x2(stack, (a, b) => a * b); return true;
    case 'i64x2.extmul_low_i32x4_s':
    case 'i64x2.extmul_high_i32x4_s':
    case 'i64x2.extmul_low_i32x4_u':
    case 'i64x2.extmul_high_i32x4_u': {
      const signed = name.endsWith('_s');
      const base = name.includes('_high_') ? 2 : 0;
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const va = signed ? BigInt(av.getInt32((base + i) * 4, true)) : BigInt(av.getUint32((base + i) * 4, true));
        const vb = signed ? BigInt(bv.getInt32((base + i) * 4, true)) : BigInt(bv.getUint32((base + i) * 4, true));
        view.setBigInt64(i * 8, BigInt.asIntN(64, va * vb), true);
      }
      stack.push(bytes);
      return true;
    }

    // 9. f32x4 & f64x2 operations
    case 'f32x4.abs': {
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) view.setUint32(i * 4, av.getUint32(i * 4, true) & 0x7fffffff, true);
      stack.push(bytes);
      return true;
    }
    case 'f32x4.neg': {
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) view.setUint32(i * 4, (av.getUint32(i * 4, true) ^ 0x80000000) >>> 0, true);
      stack.push(bytes);
      return true;
    }
    case 'f32x4.sqrt': unaryF32x4(stack, a => Math.sqrt(a)); return true;
    case 'f32x4.ceil': unaryF32x4(stack, a => Math.ceil(a)); return true;
    case 'f32x4.floor': unaryF32x4(stack, a => Math.floor(a)); return true;
    case 'f32x4.trunc': unaryF32x4(stack, a => Math.trunc(a)); return true;
    case 'f32x4.nearest': unaryF32x4(stack, a => nearestFloat(a)); return true;
    case 'f32x4.add': binaryF32x4(stack, (a, b) => a + b); return true;
    case 'f32x4.sub': binaryF32x4(stack, (a, b) => a - b); return true;
    case 'f32x4.mul': binaryF32x4(stack, (a, b) => a * b); return true;
    case 'f32x4.div': binaryF32x4(stack, (a, b) => a / b); return true;
    case 'f32x4.min': binaryF32x4(stack, (a, b) => floatMin(a, b)); return true;
    case 'f32x4.max': binaryF32x4(stack, (a, b) => floatMax(a, b)); return true;
    case 'f32x4.pmin': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const fa = readF32Lane(av, i), fb = readF32Lane(bv, i);
        view.setUint32(i * 4, (fb < fa ? bv : av).getUint32(i * 4, true), true);
      }
      stack.push(bytes);
      return true;
    }
    case 'f32x4.pmax': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const fa = readF32Lane(av, i), fb = readF32Lane(bv, i);
        view.setUint32(i * 4, (fa < fb ? bv : av).getUint32(i * 4, true), true);
      }
      stack.push(bytes);
      return true;
    }

    case 'f64x2.abs': {
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) view.setBigUint64(i * 8, av.getBigUint64(i * 8, true) & 0x7fffffffffffffffn, true);
      stack.push(bytes);
      return true;
    }
    case 'f64x2.neg': {
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) view.setBigUint64(i * 8, av.getBigUint64(i * 8, true) ^ 0x8000000000000000n, true);
      stack.push(bytes);
      return true;
    }
    case 'f64x2.sqrt': unaryF64x2(stack, a => Math.sqrt(a)); return true;
    case 'f64x2.ceil': unaryF64x2(stack, a => Math.ceil(a)); return true;
    case 'f64x2.floor': unaryF64x2(stack, a => Math.floor(a)); return true;
    case 'f64x2.trunc': unaryF64x2(stack, a => Math.trunc(a)); return true;
    case 'f64x2.nearest': unaryF64x2(stack, a => nearestFloat(a)); return true;
    case 'f64x2.add': binaryF64x2(stack, (a, b) => a + b); return true;
    case 'f64x2.sub': binaryF64x2(stack, (a, b) => a - b); return true;
    case 'f64x2.mul': binaryF64x2(stack, (a, b) => a * b); return true;
    case 'f64x2.div': binaryF64x2(stack, (a, b) => a / b); return true;
    case 'f64x2.min': binaryF64x2(stack, (a, b) => floatMin(a, b)); return true;
    case 'f64x2.max': binaryF64x2(stack, (a, b) => floatMax(a, b)); return true;
    case 'f64x2.pmin': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const fa = readF64Lane(av, i), fb = readF64Lane(bv, i);
        view.setBigUint64(i * 8, (fb < fa ? bv : av).getBigUint64(i * 8, true), true);
      }
      stack.push(bytes);
      return true;
    }
    case 'f64x2.pmax': {
      const b = stack.pop(), a = stack.pop();
      const av = viewOf(a), bv = viewOf(b);
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const fa = readF64Lane(av, i), fb = readF64Lane(bv, i);
        view.setBigUint64(i * 8, (fa < fb ? bv : av).getBigUint64(i * 8, true), true);
      }
      stack.push(bytes);
      return true;
    }

    // 10. Conversions
    case 'f32x4.demote_f64x2_zero': {
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      writeF32Lane(view, 0, readF64Lane(av, 0));
      writeF32Lane(view, 1, readF64Lane(av, 1));
      stack.push(bytes);
      return true;
    }
    case 'f64x2.promote_low_f32x4': {
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      writeF64Lane(view, 0, readF32Lane(av, 0));
      writeF64Lane(view, 1, readF32Lane(av, 1));
      stack.push(bytes);
      return true;
    }
    case 'i32x4.trunc_sat_f32x4_s':
    case 'i32x4.trunc_sat_f32x4_u': {
      const signed = name.endsWith('_s');
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        view.setInt32(i * 4, truncToInt(readF32Lane(av, i), signed, 32, true), true);
      }
      stack.push(bytes);
      return true;
    }
    case 'f32x4.convert_i32x4_s':
    case 'f32x4.convert_i32x4_u': {
      const signed = name.endsWith('_s');
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 4; i++) {
        const iv = signed ? av.getInt32(i * 4, true) : av.getUint32(i * 4, true);
        writeF32Lane(view, i, Math.fround(iv));
      }
      stack.push(bytes);
      return true;
    }
    case 'i32x4.trunc_sat_f64x2_s_zero':
    case 'i32x4.trunc_sat_f64x2_u_zero': {
      const signed = name.includes('_s_');
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      view.setInt32(0, truncToInt(readF64Lane(av, 0), signed, 32, true), true);
      view.setInt32(4, truncToInt(readF64Lane(av, 1), signed, 32, true), true);
      stack.push(bytes);
      return true;
    }
    case 'f64x2.convert_low_i32x4_s':
    case 'f64x2.convert_low_i32x4_u': {
      const signed = name.endsWith('_s');
      const av = viewOf(stack.pop());
      const { bytes, view } = createV128();
      for (let i = 0; i < 2; i++) {
        const iv = signed ? av.getInt32(i * 4, true) : av.getUint32(i * 4, true);
        writeF64Lane(view, i, Number(iv));
      }
      stack.push(bytes);
      return true;
    }
    default:
      return false;
  }
}

module.exports = {
  createV128,
  execSIMD
};
