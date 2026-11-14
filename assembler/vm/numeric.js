'use strict';

const { Trap } = require('./errors.js');

const scratchBuffer = new ArrayBuffer(16);
const scratchView = new DataView(scratchBuffer);

const F32_CANON_NAN_BITS = 0x7fc00000;
const F64_CANON_NAN_BITS = 0x7ff8000000000000n;

class F32Box {
  constructor(bits) {
    this.bits = bits >>> 0;
  }
  valueOf() {
    return f32BitsToNumber(this.bits);
  }
}

class F64Box {
  constructor(bits) {
    this.bits = BigInt.asUintN(64, bits);
  }
  valueOf() {
    return f64BitsToNumber(this.bits);
  }
}

function isF32NaNBits(bits) {
  const u = bits >>> 0;
  return (u & 0x7f800000) === 0x7f800000 && (u & 0x007fffff) !== 0;
}

function isF64NaNBits(bits) {
  const u = BigInt.asUintN(64, bits);
  return (u & 0x7ff0000000000000n) === 0x7ff0000000000000n && (u & 0x000fffffffffffffn) !== 0n;
}

function f32BitsToNumber(bits) {
  scratchView.setUint32(0, bits >>> 0, true);
  return scratchView.getFloat32(0, true);
}

function f64BitsToNumber(bits) {
  scratchView.setBigUint64(0, BigInt.asUintN(64, bits), true);
  return scratchView.getFloat64(0, true);
}

function f32FromBits(bits) {
  const u = bits >>> 0;
  if (isF32NaNBits(u)) return new F32Box(u);
  return f32BitsToNumber(u);
}

function f64FromBits(bits) {
  const u = BigInt.asUintN(64, bits);
  if (isF64NaNBits(u)) return new F64Box(u);
  return f64BitsToNumber(u);
}

function f32ToBits(val) {
  if (val instanceof F32Box) return val.bits;
  if (val instanceof F64Box) {
    return F32_CANON_NAN_BITS;
  }
  const n = Number(val);
  if (Number.isNaN(n)) return F32_CANON_NAN_BITS;
  scratchView.setFloat32(0, n, true);
  return scratchView.getUint32(0, true);
}

function f64ToBits(val) {
  if (val instanceof F64Box) return val.bits;
  if (val instanceof F32Box) {
    return F64_CANON_NAN_BITS;
  }
  const n = Number(val);
  if (Number.isNaN(n)) return F64_CANON_NAN_BITS;
  scratchView.setFloat64(0, n, true);
  return scratchView.getBigUint64(0, true);
}

function unboxFloat(val) {
  if (val instanceof F32Box || val instanceof F64Box) return NaN;
  return Number(val);
}

function canonF32(val) {
  if (val instanceof F32Box) return val;
  const n = Number(val);
  if (Number.isNaN(n)) return new F32Box(F32_CANON_NAN_BITS);
  return Math.fround(n);
}

function canonF64(val) {
  if (val instanceof F64Box) return val;
  const n = Number(val);
  if (Number.isNaN(n)) return new F64Box(F64_CANON_NAN_BITS);
  return n;
}

function popcnt32(v) {
  let x = v >>> 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function ctz32(v) {
  const x = v | 0;
  return x === 0 ? 32 : 31 - Math.clz32(x & -x);
}

function clz64(v) {
  const u = BigInt.asUintN(64, v);
  const hi = Number(u >> 32n);
  if (hi !== 0) return BigInt(Math.clz32(hi));
  const lo = Number(u & 0xffffffffn);
  return BigInt(32 + Math.clz32(lo));
}

function ctz64(v) {
  const u = BigInt.asUintN(64, v);
  const lo = Number(u & 0xffffffffn);
  if (lo !== 0) return BigInt(ctz32(lo));
  const hi = Number(u >> 32n);
  return BigInt(32 + ctz32(hi));
}

function popcnt64(v) {
  const u = BigInt.asUintN(64, v);
  const lo = Number(u & 0xffffffffn);
  const hi = Number(u >> 32n);
  return BigInt(popcnt32(lo) + popcnt32(hi));
}

function nearestFloat(x) {
  if (Number.isNaN(x) || !Number.isFinite(x) || x === 0) return x;
  const floor = Math.floor(x);
  const diff = x - floor;
  let r;
  if (diff < 0.5) {
    r = floor;
  } else if (diff > 0.5) {
    r = floor + 1;
  } else {
    r = (floor % 2 === 0) ? floor : floor + 1;
  }
  if (r === 0 && x < 0) return -0;
  return r;
}

function floatMin(a, b) {
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (a === 0 && b === 0) {
    return (Object.is(a, -0) || Object.is(b, -0)) ? -0 : 0;
  }
  return a < b ? a : b;
}

function floatMax(a, b) {
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (a === 0 && b === 0) {
    return (Object.is(a, -0) && Object.is(b, -0)) ? -0 : 0;
  }
  return a > b ? a : b;
}

function bigintToF32(bi) {
  if (bi === 0n) return 0;
  const neg = bi < 0n;
  let u = neg ? -bi : bi;
  // Count bit length
  let bitLen = 0;
  let tmp = u;
  while (tmp > 0n) {
    tmp >>= 1n;
    bitLen++;
  }
  if (bitLen <= 24) {
    const res = Number(u);
    return Math.fround(neg ? -res : res);
  }
  // Sticky-bit collapse into 26 bits so Number() -> Math.fround() does not double-round
  const shift = BigInt(bitLen - 26);
  if (shift > 0n) {
    const mask = (1n << shift) - 1n;
    const sticky = (u & mask) !== 0n ? 1n : 0n;
    u = ((u >> shift) | sticky) << shift;
  }
  const res = Number(u);
  return Math.fround(neg ? -res : res);
}

function truncToInt(val, signed, bits, saturating) {
  const x = unboxFloat(val);
  if (Number.isNaN(x)) {
    if (saturating) return bits === 64 ? 0n : 0;
    throw new Trap('invalid conversion to integer');
  }
  const minVal = signed ? -(1n << BigInt(bits - 1)) : 0n;
  const maxVal = signed ? (1n << BigInt(bits - 1)) - 1n : (1n << BigInt(bits)) - 1n;
  const minFloat = Number(minVal);
  // Note: maxVal + 1n is an exact power of two (2^31, 2^32, 2^63, 2^64)
  const upperExclusiveFloat = Number(maxVal + 1n);

  if (!Number.isFinite(x)) {
    if (saturating) {
      const sat = x < 0 ? minVal : maxVal;
      return bits === 64 ? BigInt.asIntN(64, sat) : (Number(sat) | 0);
    }
    throw new Trap('integer overflow');
  }

  const t = Math.trunc(x);
  if (t < minFloat || t >= upperExclusiveFloat) {
    if (saturating) {
      const sat = t < minFloat ? minVal : maxVal;
      return bits === 64 ? BigInt.asIntN(64, sat) : (Number(sat) | 0);
    }
    throw new Trap('integer overflow');
  }

  if (bits === 32) {
    return (t | 0);
  }
  return BigInt.asIntN(64, BigInt(t));
}

function execScalarNumeric(name, stack) {
  switch (name) {
    // i32 comparisons
    case 'i32.eqz': {
      const a = stack.pop() | 0;
      stack.push(a === 0 ? 1 : 0);
      return true;
    }
    case 'i32.eq': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a === b ? 1 : 0); return true; }
    case 'i32.ne': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a !== b ? 1 : 0); return true; }
    case 'i32.lt_s': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a < b ? 1 : 0); return true; }
    case 'i32.lt_u': { const b = stack.pop() >>> 0, a = stack.pop() >>> 0; stack.push(a < b ? 1 : 0); return true; }
    case 'i32.gt_s': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a > b ? 1 : 0); return true; }
    case 'i32.gt_u': { const b = stack.pop() >>> 0, a = stack.pop() >>> 0; stack.push(a > b ? 1 : 0); return true; }
    case 'i32.le_s': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a <= b ? 1 : 0); return true; }
    case 'i32.le_u': { const b = stack.pop() >>> 0, a = stack.pop() >>> 0; stack.push(a <= b ? 1 : 0); return true; }
    case 'i32.ge_s': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a >= b ? 1 : 0); return true; }
    case 'i32.ge_u': { const b = stack.pop() >>> 0, a = stack.pop() >>> 0; stack.push(a >= b ? 1 : 0); return true; }

    // i64 comparisons
    case 'i64.eqz': {
      const a = BigInt.asIntN(64, stack.pop());
      stack.push(a === 0n ? 1 : 0);
      return true;
    }
    case 'i64.eq': { const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop()); stack.push(a === b ? 1 : 0); return true; }
    case 'i64.ne': { const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop()); stack.push(a !== b ? 1 : 0); return true; }
    case 'i64.lt_s': { const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop()); stack.push(a < b ? 1 : 0); return true; }
    case 'i64.lt_u': { const b = BigInt.asUintN(64, stack.pop()), a = BigInt.asUintN(64, stack.pop()); stack.push(a < b ? 1 : 0); return true; }
    case 'i64.gt_s': { const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop()); stack.push(a > b ? 1 : 0); return true; }
    case 'i64.gt_u': { const b = BigInt.asUintN(64, stack.pop()), a = BigInt.asUintN(64, stack.pop()); stack.push(a > b ? 1 : 0); return true; }
    case 'i64.le_s': { const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop()); stack.push(a <= b ? 1 : 0); return true; }
    case 'i64.le_u': { const b = BigInt.asUintN(64, stack.pop()), a = BigInt.asUintN(64, stack.pop()); stack.push(a <= b ? 1 : 0); return true; }
    case 'i64.ge_s': { const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop()); stack.push(a >= b ? 1 : 0); return true; }
    case 'i64.ge_u': { const b = BigInt.asUintN(64, stack.pop()), a = BigInt.asUintN(64, stack.pop()); stack.push(a >= b ? 1 : 0); return true; }

    // f32 comparisons
    case 'f32.eq': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a === b ? 1 : 0); return true; }
    case 'f32.ne': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a !== b ? 1 : 0); return true; }
    case 'f32.lt': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a < b ? 1 : 0); return true; }
    case 'f32.gt': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a > b ? 1 : 0); return true; }
    case 'f32.le': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a <= b ? 1 : 0); return true; }
    case 'f32.ge': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a >= b ? 1 : 0); return true; }

    // f64 comparisons
    case 'f64.eq': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a === b ? 1 : 0); return true; }
    case 'f64.ne': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a !== b ? 1 : 0); return true; }
    case 'f64.lt': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a < b ? 1 : 0); return true; }
    case 'f64.gt': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a > b ? 1 : 0); return true; }
    case 'f64.le': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a <= b ? 1 : 0); return true; }
    case 'f64.ge': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(a >= b ? 1 : 0); return true; }

    // i32 arithmetic & bitwise
    case 'i32.clz': { stack.push(Math.clz32(stack.pop() | 0)); return true; }
    case 'i32.ctz': { stack.push(ctz32(stack.pop() | 0)); return true; }
    case 'i32.popcnt': { stack.push(popcnt32(stack.pop() | 0)); return true; }
    case 'i32.add': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push((a + b) | 0); return true; }
    case 'i32.sub': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push((a - b) | 0); return true; }
    case 'i32.mul': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(Math.imul(a, b)); return true; }
    case 'i32.div_s': {
      const b = stack.pop() | 0, a = stack.pop() | 0;
      if (b === 0) throw new Trap('integer divide by zero');
      if (a === -2147483648 && b === -1) throw new Trap('integer overflow');
      stack.push((a / b) | 0);
      return true;
    }
    case 'i32.div_u': {
      const b = stack.pop() >>> 0, a = stack.pop() >>> 0;
      if (b === 0) throw new Trap('integer divide by zero');
      stack.push(Math.floor(a / b) | 0);
      return true;
    }
    case 'i32.rem_s': {
      const b = stack.pop() | 0, a = stack.pop() | 0;
      if (b === 0) throw new Trap('integer divide by zero');
      if (a === -2147483648 && b === -1) { stack.push(0); return true; }
      stack.push((a % b) | 0);
      return true;
    }
    case 'i32.rem_u': {
      const b = stack.pop() >>> 0, a = stack.pop() >>> 0;
      if (b === 0) throw new Trap('integer divide by zero');
      stack.push((a % b) | 0);
      return true;
    }
    case 'i32.and': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a & b); return true; }
    case 'i32.or': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a | b); return true; }
    case 'i32.xor': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a ^ b); return true; }
    case 'i32.shl': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a << (b & 31)); return true; }
    case 'i32.shr_s': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push(a >> (b & 31)); return true; }
    case 'i32.shr_u': { const b = stack.pop() | 0, a = stack.pop() | 0; stack.push((a >>> (b & 31)) | 0); return true; }
    case 'i32.rotl': {
      const b = stack.pop() | 0, a = stack.pop() | 0;
      const k = b & 31;
      stack.push(k === 0 ? a : ((a << k) | (a >>> (32 - k))) | 0);
      return true;
    }
    case 'i32.rotr': {
      const b = stack.pop() | 0, a = stack.pop() | 0;
      const k = b & 31;
      stack.push(k === 0 ? a : ((a >>> k) | (a << (32 - k))) | 0);
      return true;
    }

    // i64 arithmetic & bitwise
    case 'i64.clz': { stack.push(clz64(stack.pop())); return true; }
    case 'i64.ctz': { stack.push(ctz64(stack.pop())); return true; }
    case 'i64.popcnt': { stack.push(popcnt64(stack.pop())); return true; }
    case 'i64.add': { const b = stack.pop(), a = stack.pop(); stack.push(BigInt.asIntN(64, a + b)); return true; }
    case 'i64.sub': { const b = stack.pop(), a = stack.pop(); stack.push(BigInt.asIntN(64, a - b)); return true; }
    case 'i64.mul': { const b = stack.pop(), a = stack.pop(); stack.push(BigInt.asIntN(64, a * b)); return true; }
    case 'i64.div_s': {
      const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop());
      if (b === 0n) throw new Trap('integer divide by zero');
      if (a === -9223372036854775808n && b === -1n) throw new Trap('integer overflow');
      stack.push(BigInt.asIntN(64, a / b));
      return true;
    }
    case 'i64.div_u': {
      const b = BigInt.asUintN(64, stack.pop()), a = BigInt.asUintN(64, stack.pop());
      if (b === 0n) throw new Trap('integer divide by zero');
      stack.push(BigInt.asIntN(64, a / b));
      return true;
    }
    case 'i64.rem_s': {
      const b = BigInt.asIntN(64, stack.pop()), a = BigInt.asIntN(64, stack.pop());
      if (b === 0n) throw new Trap('integer divide by zero');
      stack.push(BigInt.asIntN(64, a % b));
      return true;
    }
    case 'i64.rem_u': {
      const b = BigInt.asUintN(64, stack.pop()), a = BigInt.asUintN(64, stack.pop());
      if (b === 0n) throw new Trap('integer divide by zero');
      stack.push(BigInt.asIntN(64, a % b));
      return true;
    }
    case 'i64.and': { const b = stack.pop(), a = stack.pop(); stack.push(BigInt.asIntN(64, a & b)); return true; }
    case 'i64.or': { const b = stack.pop(), a = stack.pop(); stack.push(BigInt.asIntN(64, a | b)); return true; }
    case 'i64.xor': { const b = stack.pop(), a = stack.pop(); stack.push(BigInt.asIntN(64, a ^ b)); return true; }
    case 'i64.shl': {
      const b = BigInt.asUintN(64, stack.pop()) & 63n, a = stack.pop();
      stack.push(BigInt.asIntN(64, a << b));
      return true;
    }
    case 'i64.shr_s': {
      const b = BigInt.asUintN(64, stack.pop()) & 63n, a = BigInt.asIntN(64, stack.pop());
      stack.push(BigInt.asIntN(64, a >> b));
      return true;
    }
    case 'i64.shr_u': {
      const b = BigInt.asUintN(64, stack.pop()) & 63n, a = BigInt.asUintN(64, stack.pop());
      stack.push(BigInt.asIntN(64, a >> b));
      return true;
    }
    case 'i64.rotl': {
      const k = BigInt.asUintN(64, stack.pop()) & 63n;
      const a = BigInt.asIntN(64, stack.pop());
      if (k === 0n) { stack.push(a); return true; }
      const u = BigInt.asUintN(64, a);
      stack.push(BigInt.asIntN(64, (u << k) | (u >> (64n - k))));
      return true;
    }
    case 'i64.rotr': {
      const k = BigInt.asUintN(64, stack.pop()) & 63n;
      const a = BigInt.asIntN(64, stack.pop());
      if (k === 0n) { stack.push(a); return true; }
      const u = BigInt.asUintN(64, a);
      stack.push(BigInt.asIntN(64, (u >> k) | (u << (64n - k))));
      return true;
    }

    // f32 operations
    case 'f32.abs': {
      const bits = f32ToBits(stack.pop()) & 0x7fffffff;
      stack.push(f32FromBits(bits));
      return true;
    }
    case 'f32.neg': {
      const bits = (f32ToBits(stack.pop()) ^ 0x80000000) >>> 0;
      stack.push(f32FromBits(bits));
      return true;
    }
    case 'f32.ceil': { stack.push(canonF32(Math.ceil(unboxFloat(stack.pop())))); return true; }
    case 'f32.floor': { stack.push(canonF32(Math.floor(unboxFloat(stack.pop())))); return true; }
    case 'f32.trunc': { stack.push(canonF32(Math.trunc(unboxFloat(stack.pop())))); return true; }
    case 'f32.nearest': { stack.push(canonF32(nearestFloat(unboxFloat(stack.pop())))); return true; }
    case 'f32.sqrt': { stack.push(canonF32(Math.sqrt(unboxFloat(stack.pop())))); return true; }
    case 'f32.add': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF32(a + b)); return true; }
    case 'f32.sub': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF32(a - b)); return true; }
    case 'f32.mul': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF32(a * b)); return true; }
    case 'f32.div': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF32(a / b)); return true; }
    case 'f32.min': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF32(floatMin(a, b))); return true; }
    case 'f32.max': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF32(floatMax(a, b))); return true; }
    case 'f32.copysign': {
      const bBits = f32ToBits(stack.pop());
      const aBits = f32ToBits(stack.pop());
      stack.push(f32FromBits(((aBits & 0x7fffffff) | (bBits & 0x80000000)) >>> 0));
      return true;
    }

    // f64 operations
    case 'f64.abs': {
      const bits = f64ToBits(stack.pop()) & 0x7fffffffffffffffn;
      stack.push(f64FromBits(bits));
      return true;
    }
    case 'f64.neg': {
      const bits = f64ToBits(stack.pop()) ^ 0x8000000000000000n;
      stack.push(f64FromBits(bits));
      return true;
    }
    case 'f64.ceil': { stack.push(canonF64(Math.ceil(unboxFloat(stack.pop())))); return true; }
    case 'f64.floor': { stack.push(canonF64(Math.floor(unboxFloat(stack.pop())))); return true; }
    case 'f64.trunc': { stack.push(canonF64(Math.trunc(unboxFloat(stack.pop())))); return true; }
    case 'f64.nearest': { stack.push(canonF64(nearestFloat(unboxFloat(stack.pop())))); return true; }
    case 'f64.sqrt': { stack.push(canonF64(Math.sqrt(unboxFloat(stack.pop())))); return true; }
    case 'f64.add': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF64(a + b)); return true; }
    case 'f64.sub': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF64(a - b)); return true; }
    case 'f64.mul': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF64(a * b)); return true; }
    case 'f64.div': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF64(a / b)); return true; }
    case 'f64.min': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF64(floatMin(a, b))); return true; }
    case 'f64.max': { const b = unboxFloat(stack.pop()), a = unboxFloat(stack.pop()); stack.push(canonF64(floatMax(a, b))); return true; }
    case 'f64.copysign': {
      const bBits = f64ToBits(stack.pop());
      const aBits = f64ToBits(stack.pop());
      stack.push(f64FromBits((aBits & 0x7fffffffffffffffn) | (bBits & 0x8000000000000000n)));
      return true;
    }

    // Conversions & reinterpretations & sign extensions
    case 'i32.wrap_i64': {
      const a = BigInt.asIntN(64, stack.pop());
      stack.push(Number(BigInt.asIntN(32, a)) | 0);
      return true;
    }
    case 'i32.trunc_f32_s': { stack.push(truncToInt(stack.pop(), true, 32, false)); return true; }
    case 'i32.trunc_f32_u': { stack.push(truncToInt(stack.pop(), false, 32, false)); return true; }
    case 'i32.trunc_f64_s': { stack.push(truncToInt(stack.pop(), true, 32, false)); return true; }
    case 'i32.trunc_f64_u': { stack.push(truncToInt(stack.pop(), false, 32, false)); return true; }
    case 'i64.extend_i32_s': { stack.push(BigInt(stack.pop() | 0)); return true; }
    case 'i64.extend_i32_u': { stack.push(BigInt(stack.pop() >>> 0)); return true; }
    case 'i64.trunc_f32_s': { stack.push(truncToInt(stack.pop(), true, 64, false)); return true; }
    case 'i64.trunc_f32_u': { stack.push(truncToInt(stack.pop(), false, 64, false)); return true; }
    case 'i64.trunc_f64_s': { stack.push(truncToInt(stack.pop(), true, 64, false)); return true; }
    case 'i64.trunc_f64_u': { stack.push(truncToInt(stack.pop(), false, 64, false)); return true; }
    case 'i32.trunc_sat_f32_s': { stack.push(truncToInt(stack.pop(), true, 32, true)); return true; }
    case 'i32.trunc_sat_f32_u': { stack.push(truncToInt(stack.pop(), false, 32, true)); return true; }
    case 'i32.trunc_sat_f64_s': { stack.push(truncToInt(stack.pop(), true, 32, true)); return true; }
    case 'i32.trunc_sat_f64_u': { stack.push(truncToInt(stack.pop(), false, 32, true)); return true; }
    case 'i64.trunc_sat_f32_s': { stack.push(truncToInt(stack.pop(), true, 64, true)); return true; }
    case 'i64.trunc_sat_f32_u': { stack.push(truncToInt(stack.pop(), false, 64, true)); return true; }
    case 'i64.trunc_sat_f64_s': { stack.push(truncToInt(stack.pop(), true, 64, true)); return true; }
    case 'i64.trunc_sat_f64_u': { stack.push(truncToInt(stack.pop(), false, 64, true)); return true; }
    case 'f32.convert_i32_s': { stack.push(Math.fround(stack.pop() | 0)); return true; }
    case 'f32.convert_i32_u': { stack.push(Math.fround(stack.pop() >>> 0)); return true; }
    case 'f32.convert_i64_s': { stack.push(bigintToF32(BigInt.asIntN(64, stack.pop()))); return true; }
    case 'f32.convert_i64_u': { stack.push(bigintToF32(BigInt.asUintN(64, stack.pop()))); return true; }
    case 'f32.demote_f64': { stack.push(canonF32(unboxFloat(stack.pop()))); return true; }
    case 'f64.convert_i32_s': { stack.push(Number(stack.pop() | 0)); return true; }
    case 'f64.convert_i32_u': { stack.push(Number(stack.pop() >>> 0)); return true; }
    case 'f64.convert_i64_s': { stack.push(Number(BigInt.asIntN(64, stack.pop()))); return true; }
    case 'f64.convert_i64_u': { stack.push(Number(BigInt.asUintN(64, stack.pop()))); return true; }
    case 'f64.promote_f32': { stack.push(canonF64(unboxFloat(stack.pop()))); return true; }
    case 'i32.reinterpret_f32': { stack.push(f32ToBits(stack.pop()) | 0); return true; }
    case 'i64.reinterpret_f64': { stack.push(BigInt.asIntN(64, f64ToBits(stack.pop()))); return true; }
    case 'f32.reinterpret_i32': { stack.push(f32FromBits(stack.pop() >>> 0)); return true; }
    case 'f64.reinterpret_i64': { stack.push(f64FromBits(BigInt.asUintN(64, stack.pop()))); return true; }
    case 'i32.extend8_s': { const a = stack.pop() | 0; stack.push((a << 24) >> 24); return true; }
    case 'i32.extend16_s': { const a = stack.pop() | 0; stack.push((a << 16) >> 16); return true; }
    case 'i64.extend8_s': { stack.push(BigInt.asIntN(8, stack.pop())); return true; }
    case 'i64.extend16_s': { stack.push(BigInt.asIntN(16, stack.pop())); return true; }
    case 'i64.extend32_s': { stack.push(BigInt.asIntN(32, stack.pop())); return true; }
    default:
      return false;
  }
}

module.exports = {
  F32Box,
  F64Box,
  F32_CANON_NAN_BITS,
  F64_CANON_NAN_BITS,
  f32FromBits,
  f64FromBits,
  f32ToBits,
  f64ToBits,
  unboxFloat,
  canonF32,
  canonF64,
  popcnt32,
  ctz32,
  clz64,
  ctz64,
  popcnt64,
  nearestFloat,
  floatMin,
  floatMax,
  bigintToF32,
  truncToInt,
  execScalarNumeric
};
