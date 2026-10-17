'use strict';

const { decodeUTF8: decodeUTF8Bytes } = require('./wasm-strings.js');

function decodeULEB128(buffer, offset, bitWidth = 32, options = {}) {
  if (offset < 0 || offset >= buffer.length) {
    throw new Error(`ULEB128 read out of bounds at offset ${offset}`);
  }

  const maxBytes = Math.ceil(bitWidth / 7);
  const maxValue = (1n << BigInt(bitWidth)) - 1n;
  let result = 0n;
  let shift = 0n;
  let byte;
  let bytesRead = 0;
  
  do {
    if (offset + bytesRead >= buffer.length) {
      throw new Error(`Truncated ULEB128 at offset ${offset}`);
    }
    byte = buffer[offset + bytesRead];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    bytesRead++;
    if (bytesRead > maxBytes) {
      throw new Error(`ULEB128 too large at offset ${offset}`);
    }
  } while (byte & 0x80);

  if (result > maxValue) {
    throw new Error(`ULEB128 value out of range for u${bitWidth} at offset ${offset}`);
  }

  if (options.asBigInt) return { value: result, bytesRead };
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`ULEB128 value exceeds Number safe range at offset ${offset}`);
  }
  
  return { value: Number(result), bytesRead };
}

function decodeSLEB128(buffer, offset, bitWidth = 64, options = {}) {
  if (offset < 0 || offset >= buffer.length) {
    throw new Error(`SLEB128 read out of bounds at offset ${offset}`);
  }

  const { asBigInt = false } = options;
  const maxBytes = Math.ceil(bitWidth / 7);
  const minValue = -(1n << BigInt(bitWidth - 1));
  const maxValue = (1n << BigInt(bitWidth - 1)) - 1n;

  let result = 0n;
  let shift = 0n;
  let byte;
  let bytesRead = 0;
  
  do {
    if (offset + bytesRead >= buffer.length) {
      throw new Error(`Truncated SLEB128 at offset ${offset}`);
    }
    byte = buffer[offset + bytesRead];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    bytesRead++;
    if (bytesRead > maxBytes) {
      throw new Error(`SLEB128 too large at offset ${offset}`);
    }
  } while (byte & 0x80);
  
  // Sign extend if negative
  if (byte & 0x40) {
    result |= (-1n) << shift;
  }

  if (result < minValue || result > maxValue) {
    throw new Error(`SLEB128 value out of range for s${bitWidth} at offset ${offset}`);
  }

  if (asBigInt) {
    return { value: result, bytesRead };
  }

  if (result < BigInt(Number.MIN_SAFE_INTEGER) || result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`SLEB128 value exceeds Number safe range at offset ${offset}`);
  }
  
  return { value: Number(result), bytesRead };
}

function decodeUTF8(buffer, offset, length) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`UTF8 read out of bounds at offset ${offset} (length=${length})`);
  }
  return decodeUTF8Bytes(buffer.subarray(offset, offset + length), `binary offset ${offset}`);
}

function decodeF32(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new Error(`f32 read out of bounds at offset ${offset}`);
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat32(offset, true);
}

function decodeF64(buffer, offset) {
  if (offset < 0 || offset + 8 > buffer.length) {
    throw new Error(`f64 read out of bounds at offset ${offset}`);
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getFloat64(offset, true);
}

function heapTypeToString(value) {
  if (value >= 0) return `${value}`;
  const name = HeapTypeName[value + 0x80];
  if (name === undefined) throw new Error(`Invalid abstract heap type ${value}`);
  return name;
}

// ============================================================================
// VALUE TYPE CODES (reverse mapping)
// ============================================================================

const ValTypeName = {
  0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128',
  0x70: 'funcref', 0x6f: 'externref', 0x69: 'exnref'
};

const PackedTypeName = {
  0x78: 'i8', 0x77: 'i16'
};

const HeapTypeName = {
  0x70: 'func', 0x6f: 'extern', 0x69: 'exn', 0x6e: 'any', 0x6d: 'eq',
  0x6c: 'i31', 0x6b: 'struct', 0x6a: 'array', 0x71: 'none', 0x73: 'nofunc',
  0x74: 'noexn', 0x72: 'noextern'
};

function decodeValueType(buffer, offset, referenceOnly = false, structured = false) {
  if (offset >= buffer.length) throw new Error(`Value type read out of bounds at offset ${offset}`);
  const code = buffer[offset];
  if (code === 0x63 || code === 0x64) {
    const heap = decodeSLEB128(buffer, offset + 1, 33);
    heapTypeToString(heap.value);
    return {
      value: structured
        ? { kind: 'ref', nullable: code === 0x63, heapType: heap.value }
        : `(ref ${code === 0x63 ? 'null ' : ''}${heapTypeToString(heap.value)})`,
      bytesRead: 1 + heap.bytesRead
    };
  }
  if (HeapTypeName[code] || (!referenceOnly && code >= 0x7b && code <= 0x7f)) {
    return { value: code, bytesRead: 1 };
  }
  throw new Error(`Invalid ${referenceOnly ? 'reference' : 'value'} type 0x${code.toString(16)} at offset ${offset}`);
}

// ============================================================================
// OPCODE TABLES (reverse mapping)
// ============================================================================

const OPCODE_NAME = {};
Object.entries({
  'unreachable': 0x00, 'nop': 0x01,
  'block': 0x02, 'loop': 0x03, 'if': 0x04, 'else': 0x05, 'end': 0x0b,
  'br': 0x0c, 'br_if': 0x0d, 'br_table': 0x0e, 'return': 0x0f,
  'call': 0x10, 'call_indirect': 0x11, 'return_call': 0x12, 'return_call_indirect': 0x13,
  'call_ref': 0x14, 'return_call_ref': 0x15,
  'throw': 0x08, 'throw_ref': 0x0a, 'rethrow': 0x09,
  'try': 0x06, 'catch': 0x07, 'catch_all': 0x19,
  'br_on_null': 0xd5, 'br_on_non_null': 0xd6,
  'ref.null': 0xd0, 'ref.is_null': 0xd1, 'ref.func': 0xd2,
  'ref.as_non_null': 0xd4, 'ref.eq': 0xd3,
  'drop': 0x1a, 'select': 0x1b, 'select_t': 0x1c, 'try_table': 0x1f,
  'local.get': 0x20, 'local.set': 0x21, 'local.tee': 0x22,
  'global.get': 0x23, 'global.set': 0x24,
  'table.get': 0x25, 'table.set': 0x26,
  'i32.load': 0x28, 'i64.load': 0x29, 'f32.load': 0x2a, 'f64.load': 0x2b,
  'i32.load8_s': 0x2c, 'i32.load8_u': 0x2d, 'i32.load16_s': 0x2e, 'i32.load16_u': 0x2f,
  'i64.load8_s': 0x30, 'i64.load8_u': 0x31, 'i64.load16_s': 0x32, 'i64.load16_u': 0x33,
  'i64.load32_s': 0x34, 'i64.load32_u': 0x35,
  'i32.store': 0x36, 'i64.store': 0x37, 'f32.store': 0x38, 'f64.store': 0x39,
  'i32.store8': 0x3a, 'i32.store16': 0x3b, 'i64.store8': 0x3c, 'i64.store16': 0x3d, 'i64.store32': 0x3e,
  'memory.size': 0x3f, 'memory.grow': 0x40,
  'i32.const': 0x41, 'i64.const': 0x42, 'f32.const': 0x43, 'f64.const': 0x44,
  'i32.eqz': 0x45, 'i32.eq': 0x46, 'i32.ne': 0x47, 'i32.lt_s': 0x48, 'i32.lt_u': 0x49,
  'i32.gt_s': 0x4a, 'i32.gt_u': 0x4b, 'i32.le_s': 0x4c, 'i32.le_u': 0x4d,
  'i32.ge_s': 0x4e, 'i32.ge_u': 0x4f,
  'i64.eqz': 0x50, 'i64.eq': 0x51, 'i64.ne': 0x52, 'i64.lt_s': 0x53, 'i64.lt_u': 0x54,
  'i64.gt_s': 0x55, 'i64.gt_u': 0x56, 'i64.le_s': 0x57, 'i64.le_u': 0x58,
  'i64.ge_s': 0x59, 'i64.ge_u': 0x5a,
  'f32.eq': 0x5b, 'f32.ne': 0x5c, 'f32.lt': 0x5d, 'f32.gt': 0x5e, 'f32.le': 0x5f, 'f32.ge': 0x60,
  'f64.eq': 0x61, 'f64.ne': 0x62, 'f64.lt': 0x63, 'f64.gt': 0x64, 'f64.le': 0x65, 'f64.ge': 0x66,
  'i32.clz': 0x67, 'i32.ctz': 0x68, 'i32.popcnt': 0x69,
  'i32.add': 0x6a, 'i32.sub': 0x6b, 'i32.mul': 0x6c,
  'i32.div_s': 0x6d, 'i32.div_u': 0x6e, 'i32.rem_s': 0x6f, 'i32.rem_u': 0x70,
  'i32.and': 0x71, 'i32.or': 0x72, 'i32.xor': 0x73,
  'i32.shl': 0x74, 'i32.shr_s': 0x75, 'i32.shr_u': 0x76, 'i32.rotl': 0x77, 'i32.rotr': 0x78,
  'i64.clz': 0x79, 'i64.ctz': 0x7a, 'i64.popcnt': 0x7b,
  'i64.add': 0x7c, 'i64.sub': 0x7d, 'i64.mul': 0x7e,
  'i64.div_s': 0x7f, 'i64.div_u': 0x80, 'i64.rem_s': 0x81, 'i64.rem_u': 0x82,
  'i64.and': 0x83, 'i64.or': 0x84, 'i64.xor': 0x85,
  'i64.shl': 0x86, 'i64.shr_s': 0x87, 'i64.shr_u': 0x88, 'i64.rotl': 0x89, 'i64.rotr': 0x8a,
  'f32.abs': 0x8b, 'f32.neg': 0x8c, 'f32.ceil': 0x8d, 'f32.floor': 0x8e, 'f32.trunc': 0x8f,
  'f32.nearest': 0x90, 'f32.sqrt': 0x91,
  'f32.add': 0x92, 'f32.sub': 0x93, 'f32.mul': 0x94, 'f32.div': 0x95,
  'f32.min': 0x96, 'f32.max': 0x97, 'f32.copysign': 0x98,
  'f64.abs': 0x99, 'f64.neg': 0x9a, 'f64.ceil': 0x9b, 'f64.floor': 0x9c, 'f64.trunc': 0x9d,
  'f64.nearest': 0x9e, 'f64.sqrt': 0x9f,
  'f64.add': 0xa0, 'f64.sub': 0xa1, 'f64.mul': 0xa2, 'f64.div': 0xa3,
  'f64.min': 0xa4, 'f64.max': 0xa5, 'f64.copysign': 0xa6,
  'i32.wrap_i64': 0xa7,
  'i32.trunc_f32_s': 0xa8, 'i32.trunc_f32_u': 0xa9,
  'i32.trunc_f64_s': 0xaa, 'i32.trunc_f64_u': 0xab,
  'i64.extend_i32_s': 0xac, 'i64.extend_i32_u': 0xad,
  'i64.trunc_f32_s': 0xae, 'i64.trunc_f32_u': 0xaf,
  'i64.trunc_f64_s': 0xb0, 'i64.trunc_f64_u': 0xb1,
  'f32.convert_i32_s': 0xb2, 'f32.convert_i32_u': 0xb3,
  'f32.convert_i64_s': 0xb4, 'f32.convert_i64_u': 0xb5,
  'f32.demote_f64': 0xb6,
  'f64.convert_i32_s': 0xb7, 'f64.convert_i32_u': 0xb8,
  'f64.convert_i64_s': 0xb9, 'f64.convert_i64_u': 0xba,
  'f64.promote_f32': 0xbb,
  'i32.reinterpret_f32': 0xbc, 'i64.reinterpret_f64': 0xbd,
  'f32.reinterpret_i32': 0xbe, 'f64.reinterpret_i64': 0xbf,
  'i32.extend8_s': 0xc0, 'i32.extend16_s': 0xc1,
  'i64.extend8_s': 0xc2, 'i64.extend16_s': 0xc3, 'i64.extend32_s': 0xc4,
}).forEach(([name, code]) => {
  OPCODE_NAME[code] = name;
});

// Reverse mappings for prefixed opcodes
const OPCODE_FC_NAME = {};
Object.entries({
  'i32.trunc_sat_f32_s': 0, 'i32.trunc_sat_f32_u': 1,
  'i32.trunc_sat_f64_s': 2, 'i32.trunc_sat_f64_u': 3,
  'i64.trunc_sat_f32_s': 4, 'i64.trunc_sat_f32_u': 5,
  'i64.trunc_sat_f64_s': 6, 'i64.trunc_sat_f64_u': 7,
  'memory.init': 8, 'data.drop': 9, 'memory.copy': 10, 'memory.fill': 11,
  'table.init': 12, 'elem.drop': 13, 'table.copy': 14,
  'table.grow': 15, 'table.size': 16, 'table.fill': 17,
}).forEach(([name, code]) => {
  OPCODE_FC_NAME[code] = name;
});

const OPCODE_FB_NAME = {};
Object.entries({
  'struct.new': 0x00, 'struct.new_default': 0x01,
  'struct.get': 0x02, 'struct.get_s': 0x03, 'struct.get_u': 0x04, 'struct.set': 0x05,
  'array.new': 0x06, 'array.new_default': 0x07, 'array.new_fixed': 0x08,
  'array.new_data': 0x09, 'array.new_elem': 0x0a,
  'array.get': 0x0b, 'array.get_s': 0x0c, 'array.get_u': 0x0d, 'array.set': 0x0e,
  'array.len': 0x0f, 'array.fill': 0x10, 'array.copy': 0x11,
  'array.init_data': 0x12, 'array.init_elem': 0x13,
  'ref.test': 0x14, 'ref.test_null': 0x15, 'ref.cast': 0x16, 'ref.cast_null': 0x17,
  'br_on_cast': 0x18, 'br_on_cast_fail': 0x19,
  'any.convert_extern': 0x1a, 'extern.convert_any': 0x1b,
  'ref.i31': 0x1c, 'i31.get_s': 0x1d, 'i31.get_u': 0x1e,
}).forEach(([name, code]) => {
  OPCODE_FB_NAME[code] = name;
});

const OPCODE_FD_NAME = {};
Object.entries({
  'v128.load': 0, 'v128.load8x8_s': 1, 'v128.load8x8_u': 2,
  'v128.load16x4_s': 3, 'v128.load16x4_u': 4, 'v128.load32x2_s': 5, 'v128.load32x2_u': 6,
  'v128.load8_splat': 7, 'v128.load16_splat': 8, 'v128.load32_splat': 9, 'v128.load64_splat': 10,
  'v128.store': 11, 'v128.const': 12, 'i8x16.shuffle': 13, 'i8x16.swizzle': 14,
  'i8x16.splat': 15, 'i16x8.splat': 16, 'i32x4.splat': 17, 'i64x2.splat': 18,
  'f32x4.splat': 19, 'f64x2.splat': 20,
  'i8x16.extract_lane_s': 21, 'i8x16.extract_lane_u': 22, 'i8x16.replace_lane': 23,
  'i16x8.extract_lane_s': 24, 'i16x8.extract_lane_u': 25, 'i16x8.replace_lane': 26,
  'i32x4.extract_lane': 27, 'i32x4.replace_lane': 28,
  'i64x2.extract_lane': 29, 'i64x2.replace_lane': 30,
  'f32x4.extract_lane': 31, 'f32x4.replace_lane': 32,
  'f64x2.extract_lane': 33, 'f64x2.replace_lane': 34,
  'i8x16.eq': 35, 'i8x16.ne': 36, 'i8x16.lt_s': 37, 'i8x16.lt_u': 38,
  'i8x16.gt_s': 39, 'i8x16.gt_u': 40, 'i8x16.le_s': 41, 'i8x16.le_u': 42,
  'i8x16.ge_s': 43, 'i8x16.ge_u': 44,
  'i16x8.eq': 45, 'i16x8.ne': 46, 'i16x8.lt_s': 47, 'i16x8.lt_u': 48,
  'i16x8.gt_s': 49, 'i16x8.gt_u': 50, 'i16x8.le_s': 51, 'i16x8.le_u': 52,
  'i16x8.ge_s': 53, 'i16x8.ge_u': 54,
  'i32x4.eq': 55, 'i32x4.ne': 56, 'i32x4.lt_s': 57, 'i32x4.lt_u': 58,
  'i32x4.gt_s': 59, 'i32x4.gt_u': 60, 'i32x4.le_s': 61, 'i32x4.le_u': 62,
  'i32x4.ge_s': 63, 'i32x4.ge_u': 64,
  'i64x2.eq': 214, 'i64x2.ne': 215, 'i64x2.lt_s': 216, 'i64x2.gt_s': 217,
  'i64x2.le_s': 218, 'i64x2.ge_s': 219,
  'f32x4.eq': 65, 'f32x4.ne': 66, 'f32x4.lt': 67, 'f32x4.gt': 68, 'f32x4.le': 69, 'f32x4.ge': 70,
  'f64x2.eq': 71, 'f64x2.ne': 72, 'f64x2.lt': 73, 'f64x2.gt': 74, 'f64x2.le': 75, 'f64x2.ge': 76,
  'v128.not': 77, 'v128.and': 78, 'v128.andnot': 79, 'v128.or': 80, 'v128.xor': 81,
  'v128.bitselect': 82, 'v128.any_true': 83,
  'v128.load8_lane': 84, 'v128.load16_lane': 85, 'v128.load32_lane': 86, 'v128.load64_lane': 87,
  'v128.store8_lane': 88, 'v128.store16_lane': 89, 'v128.store32_lane': 90, 'v128.store64_lane': 91,
  'v128.load32_zero': 92, 'v128.load64_zero': 93,
  'f32x4.demote_f64x2_zero': 94, 'f64x2.promote_low_f32x4': 95,
  'i8x16.abs': 96, 'i8x16.neg': 97, 'i8x16.popcnt': 98, 'i8x16.all_true': 99,
  'i8x16.bitmask': 100, 'i8x16.narrow_i16x8_s': 101, 'i8x16.narrow_i16x8_u': 102,
  'f32x4.ceil': 103, 'f32x4.floor': 104, 'f32x4.trunc': 105, 'f32x4.nearest': 106,
  'i8x16.shl': 107, 'i8x16.shr_s': 108, 'i8x16.shr_u': 109,
  'i8x16.add': 110, 'i8x16.add_sat_s': 111, 'i8x16.add_sat_u': 112,
  'i8x16.sub': 113, 'i8x16.sub_sat_s': 114, 'i8x16.sub_sat_u': 115,
  'f64x2.ceil': 116, 'f64x2.floor': 117,
  'i8x16.min_s': 118, 'i8x16.min_u': 119, 'i8x16.max_s': 120, 'i8x16.max_u': 121,
  'f64x2.trunc': 122, 'i8x16.avgr_u': 123,
  'i16x8.extadd_pairwise_i8x16_s': 124, 'i16x8.extadd_pairwise_i8x16_u': 125,
  'i32x4.extadd_pairwise_i16x8_s': 126, 'i32x4.extadd_pairwise_i16x8_u': 127,
  'i16x8.abs': 128, 'i16x8.neg': 129, 'i16x8.q15mulr_sat_s': 130, 'i16x8.all_true': 131,
  'i16x8.bitmask': 132, 'i16x8.narrow_i32x4_s': 133, 'i16x8.narrow_i32x4_u': 134,
  'i16x8.extend_low_i8x16_s': 135, 'i16x8.extend_high_i8x16_s': 136,
  'i16x8.extend_low_i8x16_u': 137, 'i16x8.extend_high_i8x16_u': 138,
  'i16x8.shl': 139, 'i16x8.shr_s': 140, 'i16x8.shr_u': 141,
  'i16x8.add': 142, 'i16x8.add_sat_s': 143, 'i16x8.add_sat_u': 144,
  'i16x8.sub': 145, 'i16x8.sub_sat_s': 146, 'i16x8.sub_sat_u': 147,
  'f64x2.nearest': 148,
  'i16x8.mul': 149, 'i16x8.min_s': 150, 'i16x8.min_u': 151, 'i16x8.max_s': 152, 'i16x8.max_u': 153,
  'i16x8.avgr_u': 155, 'i16x8.extmul_low_i8x16_s': 156, 'i16x8.extmul_high_i8x16_s': 157,
  'i16x8.extmul_low_i8x16_u': 158, 'i16x8.extmul_high_i8x16_u': 159,
  'i32x4.abs': 160, 'i32x4.neg': 161, 'i32x4.all_true': 163, 'i32x4.bitmask': 164,
  'i32x4.extend_low_i16x8_s': 167, 'i32x4.extend_high_i16x8_s': 168,
  'i32x4.extend_low_i16x8_u': 169, 'i32x4.extend_high_i16x8_u': 170,
  'i32x4.shl': 171, 'i32x4.shr_s': 172, 'i32x4.shr_u': 173,
  'i32x4.add': 174, 'i32x4.sub': 177, 'i32x4.mul': 181,
  'i32x4.min_s': 182, 'i32x4.min_u': 183, 'i32x4.max_s': 184, 'i32x4.max_u': 185,
  'i32x4.dot_i16x8_s': 186,
  'i32x4.extmul_low_i16x8_s': 188, 'i32x4.extmul_high_i16x8_s': 189,
  'i32x4.extmul_low_i16x8_u': 190, 'i32x4.extmul_high_i16x8_u': 191,
  'i64x2.abs': 192, 'i64x2.neg': 193, 'i64x2.all_true': 195, 'i64x2.bitmask': 196,
  'i64x2.extend_low_i32x4_s': 199, 'i64x2.extend_high_i32x4_s': 200,
  'i64x2.extend_low_i32x4_u': 201, 'i64x2.extend_high_i32x4_u': 202,
  'i64x2.shl': 203, 'i64x2.shr_s': 204, 'i64x2.shr_u': 205,
  'i64x2.add': 206, 'i64x2.sub': 209, 'i64x2.mul': 213,
  'i64x2.extmul_low_i32x4_s': 220, 'i64x2.extmul_high_i32x4_s': 221,
  'i64x2.extmul_low_i32x4_u': 222, 'i64x2.extmul_high_i32x4_u': 223,
  'f32x4.abs': 224, 'f32x4.neg': 225, 'f32x4.sqrt': 227,
  'f32x4.add': 228, 'f32x4.sub': 229, 'f32x4.mul': 230, 'f32x4.div': 231,
  'f32x4.min': 232, 'f32x4.max': 233, 'f32x4.pmin': 234, 'f32x4.pmax': 235,
  'f64x2.abs': 236, 'f64x2.neg': 237, 'f64x2.sqrt': 239,
  'f64x2.add': 240, 'f64x2.sub': 241, 'f64x2.mul': 242, 'f64x2.div': 243,
  'f64x2.min': 244, 'f64x2.max': 245, 'f64x2.pmin': 246, 'f64x2.pmax': 247,
  'i32x4.trunc_sat_f32x4_s': 248, 'i32x4.trunc_sat_f32x4_u': 249,
  'f32x4.convert_i32x4_s': 250, 'f32x4.convert_i32x4_u': 251,
  'i32x4.trunc_sat_f64x2_s_zero': 252, 'i32x4.trunc_sat_f64x2_u_zero': 253,
  'f64x2.convert_low_i32x4_s': 254, 'f64x2.convert_low_i32x4_u': 255,
}).forEach(([name, code]) => {
  OPCODE_FD_NAME[code] = name;
});


module.exports = {
  decodeULEB128,
  decodeSLEB128,
  decodeUTF8,
  decodeF32,
  decodeF64,
  heapTypeToString,
  decodeValueType,
  ValTypeName,
  PackedTypeName,
  HeapTypeName,
  OPCODE_NAME,
  OPCODE_FC_NAME,
  OPCODE_FB_NAME,
  OPCODE_FD_NAME
};
