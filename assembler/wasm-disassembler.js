/**
 * WASM to WAT Disassembler
 * Converts WebAssembly binary to WAT text format
 * Compatible with WebAssembly 3.0 and the wat-assembler.js format
 */
'use strict';

// ============================================================================
// DECODING HELPERS
// ============================================================================

function decodeULEB128(buffer, offset, bitWidth = 32) {
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
  return buffer.toString('utf8', offset, offset + length);
}

function decodeF32(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new Error(`f32 read out of bounds at offset ${offset}`);
  }
  return buffer.readFloatLE(offset);
}

function decodeF64(buffer, offset) {
  if (offset < 0 || offset + 8 > buffer.length) {
    throw new Error(`f64 read out of bounds at offset ${offset}`);
  }
  return buffer.readDoubleLE(offset);
}

function normalizeSignedByteCode(value) {
  // Heap types encoded as one-byte signed LEB use range [-64..-1]
  // for canonical byte values [0x40..0x7f].
  if (value >= -64 && value < 0) {
    return value + 0x80;
  }
  return value;
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
  0x70: 'func', 0x6f: 'extern', 0x68: 'exn', 0x6e: 'any', 0x6d: 'eq',
  0x6c: 'i31', 0x6b: 'struct', 0x6a: 'array', 0x71: 'none', 0x73: 'nofunc',
  0x74: 'noexn', 0x72: 'noextern'
};

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
  'ref.test': 0x14, 'ref.cast': 0x15,
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

// ============================================================================
// SECTION DECODING
// ============================================================================

class WasmDisassembler {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
    this.output = [];
    this.typeSection = [];
    this.importSection = [];
    this.functionSection = [];
    this.tableSection = [];
    this.memorySection = [];
    this.globalSection = [];
    this.exportSection = [];
    this.startSection = null;
    this.elementSection = [];
    this.codeSection = [];
    this.dataSection = [];
    this.tagSection = [];
    this.dataCountSection = null;
    this.customSections = [];
    this.nameSection = {
      moduleName: null,
      functionNames: new Map(),
      localNames: new Map(),
    };
    this.sectionEnd = null;
  }

  ensureAvailable(length, context, absoluteOffset = this.offset) {
    const end = this.sectionEnd !== null && this.sectionEnd !== undefined ? this.sectionEnd : this.buffer.length;
    if (absoluteOffset < 0 || length < 0 || absoluteOffset + length > end) {
      throw new Error(`Out-of-bounds read (${context}) at offset ${absoluteOffset}, length ${length}, end ${end}`);
    }
  }

  readByte(context) {
    this.ensureAvailable(1, context);
    return this.buffer[this.offset++];
  }

  readULEB(context) {
    const result = decodeULEB128(this.buffer, this.offset);
    this.ensureAvailable(result.bytesRead, `${context} (uleb)`);
    this.offset += result.bytesRead;
    return result.value;
  }

  readUTF8String(context) {
    const length = this.readULEB(`${context} length`);
    this.ensureAvailable(length, `${context} bytes`);
    const text = decodeUTF8(this.buffer, this.offset, length);
    this.offset += length;
    return text;
  }

  disassemble() {
    this.output = ['(module'];

    if (!Buffer.isBuffer(this.buffer) || this.buffer.length < 8) {
      throw new Error('Input is not a valid WASM buffer (too small)');
    }
    
    // Check magic number and version
    if (this.buffer.readUInt32LE(0) !== 0x6d736100 || this.buffer.readUInt32LE(4) !== 0x1) {
      throw new Error('Invalid WASM magic number or version');
    }
    
    this.offset = 8; // Skip magic and version
    
    // Parse all sections
    while (this.offset < this.buffer.length) {
      this.parseSection();
    }
    
    // Generate output from parsed sections
    this.generateTypeSection();
    this.generateImportSection();
    this.generateFunctionSection();
    this.generateTableSection();
    this.generateMemorySection();
    this.generateGlobalSection();
    this.generateExportSection();
    this.generateStartSection();
    this.generateElementSection();
    this.generateDataCountSection();
    this.generateCodeSection();
    this.generateDataSection();
    this.generateTagSection();
    
    this.output.push(')');
    return this.output.join('\n');
  }

  parseSection() {
    this.ensureAvailable(1, 'section id');
    const sectionId = this.buffer[this.offset++];
    const lengthResult = decodeULEB128(this.buffer, this.offset);
    this.offset += lengthResult.bytesRead;
    const sectionLength = lengthResult.value;
    const sectionEnd = this.offset + sectionLength;
    if (sectionEnd > this.buffer.length) {
      throw new Error(`Section ${sectionId} exceeds buffer bounds (offset=${this.offset}, length=${sectionLength})`);
    }
    const previousSectionEnd = this.sectionEnd;
    this.sectionEnd = sectionEnd;
    
    switch (sectionId) {
      case 0x00: this.parseCustomSection(); break;
      case 0x01: this.parseTypeSection(); break;
      case 0x02: this.parseImportSection(); break;
      case 0x03: this.parseFunctionSection(); break;
      case 0x04: this.parseTableSection(); break;
      case 0x05: this.parseMemorySection(); break;
      case 0x06: this.parseGlobalSection(); break;
      case 0x07: this.parseExportSection(); break;
      case 0x08: this.parseStartSection(); break;
      case 0x09: this.parseElementSection(); break;
      case 0x0a: this.parseCodeSection(); break;
      case 0x0b: this.parseDataSection(); break;
      case 0x0c: this.parseDataCountSection(); break;
      case 0x0d: this.parseTagSection(); break;
      default:
        // Skip unknown sections
        this.offset = sectionEnd;
    }

    if (this.offset < sectionEnd) {
      this.offset = sectionEnd;
    } else if (this.offset > sectionEnd) {
      throw new Error(`Section ${sectionId} parser overread at offset ${this.offset}`);
    }

    this.sectionEnd = previousSectionEnd;
  }

  parseCustomSection() {
    const sectionStart = this.offset;
    const name = this.readUTF8String('custom section name');
    const payloadStart = this.offset;

    this.customSections.push({
      name,
      offset: sectionStart,
      payloadOffset: payloadStart,
      payloadLength: this.sectionEnd - payloadStart,
    });

    if (name !== 'name') {
      this.offset = this.sectionEnd;
      return;
    }

    while (this.offset < this.sectionEnd) {
      const subsectionId = this.readByte('name subsection id');
      const subsectionSize = this.readULEB('name subsection size');
      const subsectionEnd = this.offset + subsectionSize;
      this.ensureAvailable(subsectionSize, `name subsection ${subsectionId}`);

      if (subsectionId === 0x00) {
        this.nameSection.moduleName = this.readUTF8String('module name');
      } else if (subsectionId === 0x01) {
        const count = this.readULEB('function name count');
        for (let i = 0; i < count; i++) {
          const functionIndex = this.readULEB('function name index');
          const functionName = this.readUTF8String('function name');
          this.nameSection.functionNames.set(functionIndex, functionName);
        }
      } else if (subsectionId === 0x02) {
        const functionCount = this.readULEB('local name function count');
        for (let i = 0; i < functionCount; i++) {
          const functionIndex = this.readULEB('local name function index');
          const localCount = this.readULEB('local name count');
          const localMap = new Map();
          for (let j = 0; j < localCount; j++) {
            const localIndex = this.readULEB('local name index');
            const localName = this.readUTF8String('local name');
            localMap.set(localIndex, localName);
          }
          this.nameSection.localNames.set(functionIndex, localMap);
        }
      }

      this.offset = subsectionEnd;
    }
  }

  parseTypeSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;
    const count = countResult.value;
    
    for (let i = 0; i < count; i++) {
      let typeByte = this.buffer[this.offset++];

      // Some encoders emit subtype wrappers before the underlying heap type.
      // Example seen in fixtures: 0x50 0x00 0x60 ... (subtype with 0 supertypes + functype).
      if (typeByte === 0x50 || typeByte === 0x4f) {
        const supertypeCountResult = decodeULEB128(this.buffer, this.offset);
        this.offset += supertypeCountResult.bytesRead;
        for (let s = 0; s < supertypeCountResult.value; s++) {
          const supertypeResult = decodeULEB128(this.buffer, this.offset);
          this.offset += supertypeResult.bytesRead;
        }
        typeByte = this.readByte('type byte after subtype wrapper');
      }

      let type = {};
      
      if (typeByte === 0x60) {
        // Function type
        const paramCountResult = decodeULEB128(this.buffer, this.offset);
        this.offset += paramCountResult.bytesRead;
        const params = [];
        for (let j = 0; j < paramCountResult.value; j++) {
          params.push(ValTypeName[this.readByte('function param type')] || 'i32');
        }
        
        const resultCountResult = decodeULEB128(this.buffer, this.offset);
        this.offset += resultCountResult.bytesRead;
        const results = [];
        for (let j = 0; j < resultCountResult.value; j++) {
          results.push(ValTypeName[this.readByte('function result type')] || 'i32');
        }
        
        type = { kind: 'func', params, results };
      } else if (typeByte === 0x5f) {
        // Struct type
        const fieldCountResult = decodeULEB128(this.buffer, this.offset);
        this.offset += fieldCountResult.bytesRead;
        const fields = [];
        for (let j = 0; j < fieldCountResult.value; j++) {
          const storageType = this.readByte('struct field storage type');
          const mutable = this.readByte('struct field mutability');
          fields.push({ storage: storageType, mutable: mutable === 1 });
        }
        type = { kind: 'struct', fields };
      } else if (typeByte === 0x5e) {
        // Array type
        const storageType = this.readByte('array field storage type');
        const mutable = this.readByte('array field mutability');
        type = { kind: 'array', field: { storage: storageType, mutable: mutable === 1 } };
      }
      
      this.typeSection.push(type);
    }
  }

  parseImportSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;
    const count = countResult.value;
    
    for (let i = 0; i < count; i++) {
      const moduleLenResult = decodeULEB128(this.buffer, this.offset);
      this.offset += moduleLenResult.bytesRead;
      const module = decodeUTF8(this.buffer, this.offset, moduleLenResult.value);
      this.offset += moduleLenResult.value;
      
      const nameLenResult = decodeULEB128(this.buffer, this.offset);
      this.offset += nameLenResult.bytesRead;
      const name = decodeUTF8(this.buffer, this.offset, nameLenResult.value);
      this.offset += nameLenResult.value;
      
      const kind = this.readByte('import kind');
      let importDesc = { module, name, kind };
      
      switch (kind) {
        case 0x00: // Function
          const typeIdxResult = decodeULEB128(this.buffer, this.offset);
          this.offset += typeIdxResult.bytesRead;
          importDesc.typeIdx = typeIdxResult.value;
          break;
        case 0x01: // Table
          importDesc.tableType = this.parseTableType();
          break;
        case 0x02: // Memory
          importDesc.memoryType = this.parseMemoryType();
          break;
        case 0x03: // Global
          importDesc.globalType = this.parseGlobalType();
          break;
        case 0x04: // Tag
          const tagType = this.readByte('import tag attribute'); // Should be 0x00
          const tagTypeIdxResult = decodeULEB128(this.buffer, this.offset);
          this.offset += tagTypeIdxResult.bytesRead;
          importDesc.typeIdx = tagTypeIdxResult.value;
          break;
      }
      
      this.importSection.push(importDesc);
    }
  }

  parseTableType() {
    const elemType = this.readByte('table element type');
    const limits = this.parseLimits();
    return { elemType, limits };
  }

  parseMemoryType() {
    return this.parseLimits();
  }

  parseGlobalType() {
    const valType = this.readByte('global value type');
    const mutable = this.readByte('global mutability');
    return { valType, mutable: mutable === 1 };
  }

  parseLimits() {
    const flags = this.readByte('limits flags');
    const minResult = decodeULEB128(this.buffer, this.offset);
    this.offset += minResult.bytesRead;
    
    if (flags === 0x01) {
      const maxResult = decodeULEB128(this.buffer, this.offset);
      this.offset += maxResult.bytesRead;
      return { min: minResult.value, max: maxResult.value };
    }
    return { min: minResult.value };
  }

  parseFunctionSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const typeIdxResult = decodeULEB128(this.buffer, this.offset);
      this.offset += typeIdxResult.bytesRead;
      this.functionSection.push(typeIdxResult.value);
    }
  }

  parseTableSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      this.tableSection.push(this.parseTableType());
    }
  }

  parseMemorySection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      this.memorySection.push(this.parseMemoryType());
    }
  }

  parseGlobalSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const globalType = this.parseGlobalType();
      const initExpr = this.parseExpressionBytes();
      this.globalSection.push({ globalType, initExpr });
    }
  }

  parseExportSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const nameLenResult = decodeULEB128(this.buffer, this.offset);
      this.offset += nameLenResult.bytesRead;
      const name = decodeUTF8(this.buffer, this.offset, nameLenResult.value);
      this.offset += nameLenResult.value;

      const kind = this.buffer[this.offset++];
      const indexResult = decodeULEB128(this.buffer, this.offset);
      this.offset += indexResult.bytesRead;
      this.exportSection.push({ name, kind, index: indexResult.value });
    }
  }

  parseStartSection() {
    const startResult = decodeULEB128(this.buffer, this.offset);
    this.offset += startResult.bytesRead;
    this.startSection = startResult.value;
  }

  parseElementSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const flagsResult = decodeULEB128(this.buffer, this.offset);
      this.offset += flagsResult.bytesRead;
      const flags = flagsResult.value;

      const entry = {
        flags,
        tableIndex: 0,
        mode: 'active',
        reftype: 0x70,
        initExpr: null,
        elements: [],
        useExpressions: (flags & 0x04) !== 0
      };

      if (flags & 0x01) {
        entry.mode = (flags & 0x02) ? 'declarative' : 'passive';
      }

      if ((flags & 0x02) && !(flags & 0x01)) {
        const tableIdxResult = decodeULEB128(this.buffer, this.offset);
        this.offset += tableIdxResult.bytesRead;
        entry.tableIndex = tableIdxResult.value;
      }

      if (!(flags & 0x01) || (flags & 0x02)) {
        entry.initExpr = this.parseExpressionBytes();
      }

      if (flags & 0x03) {
        entry.reftype = this.readByte('element reftype');
      }

      const itemCountResult = decodeULEB128(this.buffer, this.offset);
      this.offset += itemCountResult.bytesRead;

      for (let j = 0; j < itemCountResult.value; j++) {
        if (entry.useExpressions) {
          entry.elements.push(this.parseExpressionBytes());
        } else {
          const funcIdxResult = decodeULEB128(this.buffer, this.offset);
          this.offset += funcIdxResult.bytesRead;
          entry.elements.push(funcIdxResult.value);
        }
      }

      this.elementSection.push(entry);
    }
  }

  parseCodeSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const bodySizeResult = decodeULEB128(this.buffer, this.offset);
      this.offset += bodySizeResult.bytesRead;
      const bodyEnd = this.offset + bodySizeResult.value;
      if (bodyEnd > this.sectionEnd) {
        throw new Error(`Function body exceeds code section bounds at offset ${this.offset}`);
      }

      const localCountResult = decodeULEB128(this.buffer, this.offset);
      this.offset += localCountResult.bytesRead;
      const locals = [];

      for (let j = 0; j < localCountResult.value; j++) {
        const nResult = decodeULEB128(this.buffer, this.offset);
        this.offset += nResult.bytesRead;
        const valType = this.readByte('local valtype');
        locals.push({ count: nResult.value, valType });
      }

      const codeBytes = this.buffer.subarray(this.offset, bodyEnd);
      this.offset = bodyEnd;

      this.codeSection.push({ locals, code: codeBytes });
    }
  }

  parseDataSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const flagsResult = decodeULEB128(this.buffer, this.offset);
      this.offset += flagsResult.bytesRead;
      const flags = flagsResult.value;

      const dataEntry = {
        flags,
        mode: flags === 1 ? 'passive' : 'active',
        memoryIndex: 0,
        offsetExpr: null,
        bytes: Buffer.alloc(0)
      };

      if (flags === 0) {
        dataEntry.offsetExpr = this.parseExpressionBytes();
      } else if (flags === 2) {
        const memIdxResult = decodeULEB128(this.buffer, this.offset);
        this.offset += memIdxResult.bytesRead;
        dataEntry.memoryIndex = memIdxResult.value;
        dataEntry.offsetExpr = this.parseExpressionBytes();
      }

      const sizeResult = decodeULEB128(this.buffer, this.offset);
      this.offset += sizeResult.bytesRead;
      dataEntry.bytes = this.buffer.subarray(this.offset, this.offset + sizeResult.value);
      this.offset += sizeResult.value;

      this.dataSection.push(dataEntry);
    }
  }

  parseDataCountSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;
    this.dataCountSection = countResult.value;
  }

  parseTagSection() {
    const countResult = decodeULEB128(this.buffer, this.offset);
    this.offset += countResult.bytesRead;

    for (let i = 0; i < countResult.value; i++) {
      const attribute = this.readByte('tag attribute');
      const typeIdxResult = decodeULEB128(this.buffer, this.offset);
      this.offset += typeIdxResult.bytesRead;
      this.tagSection.push({ attribute, typeIdx: typeIdxResult.value });
    }
  }

  parseExpressionBytes() {
    const start = this.offset;
    while (this.offset < this.sectionEnd && this.buffer[this.offset] !== 0x0b) {
      const opcode = this.readByte('expression opcode');

      if (opcode === 0x41) {
        const valueResult = decodeSLEB128(this.buffer, this.offset, 32);
        this.offset += valueResult.bytesRead;
      } else if (opcode === 0x42) {
        const valueResult = decodeSLEB128(this.buffer, this.offset, 64, { asBigInt: true });
        this.offset += valueResult.bytesRead;
      } else if (opcode === 0x43) {
        this.offset += 4;
      } else if (opcode === 0x44) {
        this.offset += 8;
      } else if (opcode === 0x23 || opcode === 0xd2) {
        const idxResult = decodeULEB128(this.buffer, this.offset);
        this.offset += idxResult.bytesRead;
      } else if (opcode === 0xd0) {
        const heapTypeResult = decodeSLEB128(this.buffer, this.offset, 33);
        this.offset += heapTypeResult.bytesRead;
      }
    }

    if (this.offset >= this.sectionEnd || this.buffer[this.offset] !== 0x0b) {
      throw new Error('Unterminated expression in section');
    }

    this.offset += 1;
    return this.buffer.subarray(start, this.offset);
  }

  generateTypeSection() {
    if (this.typeSection.length === 0) return;
    
    this.output.push('');
    this.typeSection.forEach((type, i) => {
      if (type.kind === 'func') {
        this.output.push('  (type (func');
        if (type.params.length > 0) {
          this.output.push(`    (param ${type.params.join(' ')})`);
        }
        if (type.results.length > 0) {
          this.output.push(`    (result ${type.results.join(' ')})`);
        }
        this.output.push('  ))');
      }
      // Handle struct and array types similarly
    });
  }

  generateImportSection() {
    if (this.importSection.length === 0) return;
    
    this.output.push('');
    this.importSection.forEach(imp => {
      this.output.push(`  (import "${imp.module}" "${imp.name}"`);
      switch (imp.kind) {
        case 0x00: // Function
          this.output.push(`    (func (type ${imp.typeIdx})))`);
          break;
        case 0x01: // Table
          this.output.push(`    (table ${this.limitsToString(imp.tableType.limits)} ${ValTypeName[imp.tableType.elemType]}))`);
          break;
        case 0x02: // Memory
          this.output.push(`    (memory ${this.limitsToString(imp.memoryType)}))`);
          break;
        case 0x03: // Global
          this.output.push(`    (global ${imp.globalType.mutable ? '(mut ' : ''}${ValTypeName[imp.globalType.valType]}${imp.globalType.mutable ? ')' : ''}))`);
          break;
        case 0x04: // Tag
          this.output.push(`    (tag (type ${imp.typeIdx})))`);
          break;
      }
    });
  }

  limitsToString(limits) {
    if (limits.max !== undefined) {
      return `${limits.min} ${limits.max}`;
    }
    return `${limits.min}`;
  }

  decodeExpressionInstructions(code, localTypes) {
    const instructions = this.decodeInstructions(code, localTypes);
    if (instructions.length > 0 && instructions[instructions.length - 1] === 'end') {
      instructions.pop();
    }
    return instructions;
  }

  getImportedFunctionCount() {
    return this.importSection.filter(imp => imp.kind === 0x00).length;
  }

  generateFunctionSection() {
    // Functions are emitted together with code bodies in generateCodeSection.
  }

  generateTableSection() {
    if (this.tableSection.length === 0) return;

    this.output.push('');
    this.tableSection.forEach(table => {
      this.output.push(`  (table ${this.limitsToString(table.limits)} ${ValTypeName[table.elemType] || 'funcref'})`);
    });
  }

  generateMemorySection() {
    if (this.memorySection.length === 0) return;

    this.output.push('');
    this.memorySection.forEach(memory => {
      this.output.push(`  (memory ${this.limitsToString(memory)})`);
    });
  }

  generateGlobalSection() {
    if (this.globalSection.length === 0) return;

    this.output.push('');
    this.globalSection.forEach(global => {
      const typeName = ValTypeName[global.globalType.valType] || 'i32';
      const globalType = global.globalType.mutable ? `(mut ${typeName})` : typeName;
      const initInstr = this.decodeExpressionInstructions(global.initExpr, []).join(' ');
      this.output.push(`  (global ${globalType} (${initInstr}))`);
    });
  }

  generateExportSection() {
    if (this.exportSection.length === 0) return;

    this.output.push('');
    this.exportSection.forEach(exp => {
      const kindMap = {
        0x00: 'func',
        0x01: 'table',
        0x02: 'memory',
        0x03: 'global',
        0x04: 'tag'
      };
      const kind = kindMap[exp.kind] || 'unknown';
      this.output.push(`  (export "${exp.name}" (${kind} ${exp.index}))`);
    });
  }

  generateStartSection() {
    if (this.startSection === null) return;

    this.output.push('');
    this.output.push(`  (start ${this.startSection})`);
  }

  generateElementSection() {
    if (this.elementSection.length === 0) return;

    this.output.push('');
    this.elementSection.forEach(elem => {
      if (elem.mode === 'active' && !elem.useExpressions) {
        const offset = elem.initExpr ? this.decodeExpressionInstructions(elem.initExpr, []).join(' ') : 'i32.const 0';
        if (elem.tableIndex === 0) {
          this.output.push(`  (elem (${offset}) func ${elem.elements.join(' ')})`);
        } else {
          this.output.push(`  (elem (table ${elem.tableIndex}) (offset (${offset})) func ${elem.elements.join(' ')})`);
        }
      }
    });
  }

  generateDataCountSection() {
    // Kept intentionally empty to avoid emitting non-standard/comment metadata.
  }

  generateCodeSection() {
    if (this.codeSection.length === 0) return;

    this.output.push('');
    const importedFuncCount = this.getImportedFunctionCount();

    this.codeSection.forEach((body, i) => {
      const funcIndex = importedFuncCount + i;
      const typeIdx = this.functionSection[i];
      const typeInfo = this.typeSection[typeIdx] || { kind: 'func', params: [], results: [] };

      const parts = ['  (func'];
      if (typeof typeIdx === 'number') {
        parts.push(`(type ${typeIdx})`);
      }
      if (typeInfo.kind === 'func' && typeInfo.params.length > 0) {
        parts.push(`(param ${typeInfo.params.join(' ')})`);
      }
      if (typeInfo.kind === 'func' && typeInfo.results.length > 0) {
        parts.push(`(result ${typeInfo.results.join(' ')})`);
      }

      this.output.push(parts.join(' '));

      body.locals.forEach(local => {
        const localType = ValTypeName[local.valType] || 'i32';
        const localTypes = [];
        for (let n = 0; n < local.count; n++) {
          localTypes.push(localType);
        }
        this.output.push(`    (local ${localTypes.join(' ')})`);
      });

      const instructions = this.decodeExpressionInstructions(body.code, body.locals);
      instructions.forEach(instr => {
        this.output.push(`    ${instr}`);
      });

      this.output.push('  )');
    });
  }

  generateDataSection() {
    if (this.dataSection.length === 0) return;

    this.output.push('');
    this.dataSection.forEach(data => {
      const escaped = Array.from(data.bytes).map(byte => `\\${byte.toString(16).padStart(2, '0')}`).join('');
      if (data.mode === 'passive') {
        this.output.push(`  (data "${escaped}")`);
      } else {
        const offset = data.offsetExpr ? this.decodeExpressionInstructions(data.offsetExpr, []).join(' ') : 'i32.const 0';
        if (data.memoryIndex === 0) {
          this.output.push(`  (data (${offset}) "${escaped}")`);
        } else {
          this.output.push(`  (data (memory ${data.memoryIndex}) (offset (${offset})) "${escaped}")`);
        }
      }
    });
  }

  generateTagSection() {
    if (this.tagSection.length === 0) return;

    this.output.push('');
    this.tagSection.forEach(tag => {
      this.output.push(`  (tag (type ${tag.typeIdx}))`);
    });
  }

  // Instruction decoding would be the most complex part
  decodeInstructions(code, localTypes) {
    const instructions = [];
    let offset = 0;

    const ensureCodeAvailable = (count, context) => {
      if (offset + count > code.length) {
        throw new Error(`Truncated instruction immediate (${context}) at offset ${offset}`);
      }
    };

    const decodeBlockTypeImmediate = () => {
      ensureCodeAvailable(1, 'blocktype');
      const blockTypeByte = code[offset];
      if (blockTypeByte === 0x40) {
        offset += 1;
        return '';
      }
      if (ValTypeName[blockTypeByte]) {
        offset += 1;
        return ` (result ${ValTypeName[blockTypeByte]})`;
      }
      const blockTypeResult = decodeSLEB128(code, offset, 33);
      offset += blockTypeResult.bytesRead;
      return ` (type ${blockTypeResult.value})`;
    };
    
    while (offset < code.length) {
      const opcode = code[offset++];
      let instruction = '';
      
      if (opcode === 0xfc || opcode === 0xfd || opcode === 0xfb) {
        // Prefixed instructions
        const subOpcodeResult = decodeULEB128(code, offset);
        offset += subOpcodeResult.bytesRead;
        const subOpcode = subOpcodeResult.value;
        
        let opname;
        if (opcode === 0xfc) opname = OPCODE_FC_NAME[subOpcode];
        else if (opcode === 0xfd) opname = OPCODE_FD_NAME[subOpcode];
        else if (opcode === 0xfb) opname = OPCODE_FB_NAME[subOpcode];
        
        instruction = opname || `unknown_${opcode}_${subOpcode}`;
        // Handle immediate values for prefixed instructions.
        if (opcode === 0xfc && opname) {
          if (opname === 'memory.init') {
            const dataIdxResult = decodeULEB128(code, offset);
            offset += dataIdxResult.bytesRead;
            const memIdxResult = decodeULEB128(code, offset);
            offset += memIdxResult.bytesRead;
            instruction += ` ${dataIdxResult.value}`;
            if (memIdxResult.value !== 0) {
              instruction += ` ${memIdxResult.value}`;
            }
          } else if (opname === 'data.drop' || opname === 'elem.drop') {
            const idxResult = decodeULEB128(code, offset);
            offset += idxResult.bytesRead;
            instruction += ` ${idxResult.value}`;
          } else if (opname === 'memory.copy') {
            const dstMemIdxResult = decodeULEB128(code, offset);
            offset += dstMemIdxResult.bytesRead;
            const srcMemIdxResult = decodeULEB128(code, offset);
            offset += srcMemIdxResult.bytesRead;
            if (dstMemIdxResult.value !== 0 || srcMemIdxResult.value !== 0) {
              instruction += ` ${dstMemIdxResult.value} ${srcMemIdxResult.value}`;
            }
          } else if (opname === 'memory.fill') {
            const memIdxResult = decodeULEB128(code, offset);
            offset += memIdxResult.bytesRead;
            if (memIdxResult.value !== 0) {
              instruction += ` ${memIdxResult.value}`;
            }
          } else if (opname === 'table.init' || opname === 'table.copy') {
            const firstIdxResult = decodeULEB128(code, offset);
            offset += firstIdxResult.bytesRead;
            const secondIdxResult = decodeULEB128(code, offset);
            offset += secondIdxResult.bytesRead;
            instruction += ` ${firstIdxResult.value} ${secondIdxResult.value}`;
          } else if (opname === 'table.grow' || opname === 'table.size' || opname === 'table.fill') {
            const tableIdxResult = decodeULEB128(code, offset);
            offset += tableIdxResult.bytesRead;
            instruction += ` ${tableIdxResult.value}`;
          }
        } else if (opcode === 0xfb && opname) {
          if (opname === 'ref.test' || opname === 'ref.cast') {
            ensureCodeAvailable(1, `${opname} nullability flags`);
            const nullableFlag = code[offset++]; // ref type nullable flags byte
            const heapTypeResult = decodeSLEB128(code, offset, 33);
            offset += heapTypeResult.bytesRead;
            const heapTypeCode = normalizeSignedByteCode(heapTypeResult.value);
            const heapType = HeapTypeName[heapTypeCode] || heapTypeResult.value;
            instruction += ` ${(nullableFlag & 0x01) ? 'null ' : ''}${heapType}`;
          } else if (opname === 'br_on_cast' || opname === 'br_on_cast_fail') {
            const labelResult = decodeULEB128(code, offset);
            offset += labelResult.bytesRead;
            ensureCodeAvailable(1, `${opname} flags`);
            const flags = code[offset++];
            const srcHeapTypeResult = decodeSLEB128(code, offset, 33);
            offset += srcHeapTypeResult.bytesRead;
            const dstHeapTypeResult = decodeSLEB128(code, offset, 33);
            offset += dstHeapTypeResult.bytesRead;
            const srcHeapTypeCode = normalizeSignedByteCode(srcHeapTypeResult.value);
            const dstHeapTypeCode = normalizeSignedByteCode(dstHeapTypeResult.value);
            const srcHeapType = HeapTypeName[srcHeapTypeCode] || srcHeapTypeResult.value;
            const dstHeapType = HeapTypeName[dstHeapTypeCode] || dstHeapTypeResult.value;
            const srcPrefix = (flags & 0x01) ? 'null ' : '';
            const dstPrefix = (flags & 0x02) ? 'null ' : '';
            instruction += ` ${labelResult.value} ${srcPrefix}${srcHeapType} ${dstPrefix}${dstHeapType}`;
          } else if (opname.startsWith('struct.get') || opname === 'struct.set') {
            const typeIdxResult = decodeULEB128(code, offset);
            offset += typeIdxResult.bytesRead;
            const fieldIdxResult = decodeULEB128(code, offset);
            offset += fieldIdxResult.bytesRead;
            instruction += ` ${typeIdxResult.value} ${fieldIdxResult.value}`;
          } else if (
            opname === 'struct.new' || opname === 'struct.new_default' ||
            opname === 'array.new' || opname === 'array.new_default' ||
            opname === 'array.get' || opname === 'array.get_s' ||
            opname === 'array.get_u' || opname === 'array.set' ||
            opname === 'array.fill' || opname === 'array.len'
          ) {
            const typeIdxResult = decodeULEB128(code, offset);
            offset += typeIdxResult.bytesRead;
            instruction += ` ${typeIdxResult.value}`;
          } else if (opname === 'array.new_fixed') {
            const typeIdxResult = decodeULEB128(code, offset);
            offset += typeIdxResult.bytesRead;
            const countResult = decodeULEB128(code, offset);
            offset += countResult.bytesRead;
            instruction += ` ${typeIdxResult.value} ${countResult.value}`;
          } else if (opname === 'array.new_data' || opname === 'array.init_data' || opname === 'array.new_elem' || opname === 'array.init_elem') {
            const typeIdxResult = decodeULEB128(code, offset);
            offset += typeIdxResult.bytesRead;
            const idxResult = decodeULEB128(code, offset);
            offset += idxResult.bytesRead;
            instruction += ` ${typeIdxResult.value} ${idxResult.value}`;
          } else if (opname === 'array.copy') {
            const dstTypeIdxResult = decodeULEB128(code, offset);
            offset += dstTypeIdxResult.bytesRead;
            const srcTypeIdxResult = decodeULEB128(code, offset);
            offset += srcTypeIdxResult.bytesRead;
            instruction += ` ${dstTypeIdxResult.value} ${srcTypeIdxResult.value}`;
          }
        } else if (opcode === 0xfd && opname) {
          if (opname === 'v128.const') {
            const bytes = [];
            for (let i = 0; i < 16; i++) {
              bytes.push(code[offset++]);
            }
            instruction += ` i8x16 ${bytes.join(' ')}`;
          } else if (opname === 'i8x16.shuffle') {
            const lanes = [];
            for (let i = 0; i < 16; i++) {
              lanes.push(code[offset++]);
            }
            instruction += ` ${lanes.join(' ')}`;
          } else {
            const hasMemarg = opname.startsWith('v128.load') || opname.startsWith('v128.store');
            if (hasMemarg) {
              const alignResult = decodeULEB128(code, offset);
              offset += alignResult.bytesRead;
              const memOffsetResult = decodeULEB128(code, offset);
              offset += memOffsetResult.bytesRead;
              instruction += ` offset=${memOffsetResult.value} align=${2 ** alignResult.value}`;
            }

            const hasLane = opname.includes('extract_lane') || opname.includes('replace_lane') || opname.includes('load8_lane') ||
              opname.includes('load16_lane') || opname.includes('load32_lane') || opname.includes('load64_lane') ||
              opname.includes('store8_lane') || opname.includes('store16_lane') || opname.includes('store32_lane') ||
              opname.includes('store64_lane');

            if (hasLane) {
              const lane = code[offset++];
              instruction += ` ${lane}`;
            }
          }
        }
      } else {
        // Regular instructions
        instruction = OPCODE_NAME[opcode] || `unknown_${opcode}`;
        
        // Handle immediate values
        switch (instruction) {
          case 'block':
          case 'loop':
          case 'if':
            instruction += decodeBlockTypeImmediate();
            break;
          case 'try':
            instruction += decodeBlockTypeImmediate();
            break;
          case 'try_table': {
            instruction += decodeBlockTypeImmediate();
            const catchCountResult = decodeULEB128(code, offset);
            offset += catchCountResult.bytesRead;
            for (let i = 0; i < catchCountResult.value; i++) {
              ensureCodeAvailable(1, 'try_table catch kind');
              const catchKind = code[offset++];
              const labelResult = decodeULEB128(code, offset);
              offset += labelResult.bytesRead;
              if (catchKind === 0x00 || catchKind === 0x01) {
                const tagResult = decodeULEB128(code, offset);
                offset += tagResult.bytesRead;
              }
            }
            break;
          }
          case 'br':
          case 'br_if':
          case 'call':
          case 'return_call':
          case 'call_ref':
          case 'return_call_ref':
          case 'throw':
          case 'rethrow':
          case 'br_on_null':
          case 'br_on_non_null':
          case 'catch':
          case 'ref.func':
          case 'global.get':
          case 'global.set':
          case 'local.get':
          case 'local.set':
          case 'local.tee':
          case 'table.get':
          case 'table.set': {
            const idxResult = decodeULEB128(code, offset);
            offset += idxResult.bytesRead;
            instruction += ` ${idxResult.value}`;
            break;
          }
          case 'catch_all':
          case 'else':
          case 'end':
          case 'throw_ref':
            break;
          case 'call_indirect': {
            const typeIdxResult = decodeULEB128(code, offset);
            offset += typeIdxResult.bytesRead;
            const tableIdxResult = decodeULEB128(code, offset);
            offset += tableIdxResult.bytesRead;
            if (tableIdxResult.value === 0) {
              instruction += ` (type ${typeIdxResult.value})`;
            } else {
              instruction += ` ${tableIdxResult.value} (type ${typeIdxResult.value})`;
            }
            break;
          }
          case 'select_t': {
            const typeCountResult = decodeULEB128(code, offset);
            offset += typeCountResult.bytesRead;
            const types = [];
            for (let i = 0; i < typeCountResult.value; i++) {
              if (offset >= code.length) {
                throw new Error('Truncated select_t type vector immediate');
              }
              const vt = code[offset++];
              types.push(ValTypeName[vt] || `type_${vt}`);
            }
            if (types.length > 0) {
              instruction = 'select';
              instruction += ` (result ${types.join(' ')})`;
            }
            break;
          }
          case 'return_call_indirect': {
            const typeIdxResult = decodeULEB128(code, offset);
            offset += typeIdxResult.bytesRead;
            const tableIdxResult = decodeULEB128(code, offset);
            offset += tableIdxResult.bytesRead;
            if (tableIdxResult.value === 0) {
              instruction += ` (type ${typeIdxResult.value})`;
            } else {
              instruction += ` ${tableIdxResult.value} (type ${typeIdxResult.value})`;
            }
            break;
          }
          case 'br_table': {
            const targetCountResult = decodeULEB128(code, offset);
            offset += targetCountResult.bytesRead;
            const targets = [];
            for (let i = 0; i < targetCountResult.value; i++) {
              const t = decodeULEB128(code, offset);
              offset += t.bytesRead;
              targets.push(t.value);
            }
            const defaultTarget = decodeULEB128(code, offset);
            offset += defaultTarget.bytesRead;
            instruction += ` ${targets.join(' ')} ${defaultTarget.value}`;
            break;
          }
          case 'memory.size':
          case 'memory.grow':
            if (offset >= code.length) {
              throw new Error(`Truncated ${instruction} memory immediate`);
            }
            offset += 1; // reserved memory immediate
            break;
          case 'i32.load':
          case 'i64.load':
          case 'f32.load':
          case 'f64.load':
          case 'i32.load8_s':
          case 'i32.load8_u':
          case 'i32.load16_s':
          case 'i32.load16_u':
          case 'i64.load8_s':
          case 'i64.load8_u':
          case 'i64.load16_s':
          case 'i64.load16_u':
          case 'i64.load32_s':
          case 'i64.load32_u':
          case 'i32.store':
          case 'i64.store':
          case 'f32.store':
          case 'f64.store':
          case 'i32.store8':
          case 'i32.store16':
          case 'i64.store8':
          case 'i64.store16':
          case 'i64.store32': {
            const alignResult = decodeULEB128(code, offset);
            offset += alignResult.bytesRead;
            const memOffsetResult = decodeULEB128(code, offset);
            offset += memOffsetResult.bytesRead;
            instruction += ` offset=${memOffsetResult.value} align=${2 ** alignResult.value}`;
            break;
          }
          case 'i32.const':
            const i32Result = decodeSLEB128(code, offset, 32);
            offset += i32Result.bytesRead;
            instruction += ` ${i32Result.value}`;
            break;
          case 'i64.const':
            const i64Result = decodeSLEB128(code, offset, 64, { asBigInt: true });
            offset += i64Result.bytesRead;
            instruction += ` ${i64Result.value.toString()}`;
            break;
          case 'f32.const':
            const f32 = decodeF32(code, offset);
            offset += 4;
            instruction += ` ${f32}`;
            break;
          case 'f64.const':
            const f64 = decodeF64(code, offset);
            offset += 8;
            instruction += ` ${f64}`;
            break;
          case 'ref.null': {
            const heapTypeResult = decodeSLEB128(code, offset, 33);
            offset += heapTypeResult.bytesRead;
            const heapTypeCode = normalizeSignedByteCode(heapTypeResult.value);
            const heapType = HeapTypeName[heapTypeCode] || heapTypeResult.value;
            instruction += ` ${heapType}`;
            break;
          }
          case 'local.get':
          case 'local.set':
          case 'local.tee':
            break;
          // Handle other instructions with immediates...
        }
      }
      
      instructions.push(instruction);
    }
    
    return instructions;
  }
}

// ============================================================================
// MAIN DISASSEMBLER
// ============================================================================

function disassembleWASM(buffer) {
  const disassembler = new WasmDisassembler(buffer);
  return disassembler.disassemble();
}

module.exports = { WasmDisassembler, disassembleWASM };
module.exports.__test = {
  decodeULEB128,
  decodeSLEB128,
  decodeUTF8,
  decodeF32,
  decodeF64,
};

if (require.main === module) {
  // Simple test if run directly
  const fs = require('fs');
  const path = require('path');
  
  const wasmFile = process.argv[2];
  if (wasmFile) {
    const buffer = fs.readFileSync(wasmFile);
    try {
      const wat = disassembleWASM(buffer);
      console.log(wat);
    } catch (e) {
      console.error(`Disassembly failed: ${e.message}`);
    }
  } else {
    console.log('Usage: node wasm-disassembler.js <file.wasm>');
  }
}
