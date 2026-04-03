/**
 * WAT to WASM Assembler
 * Converts WebAssembly Text format to WASM binary
 */
'use strict';

const WATParser = require('./wat-parser-adapter.js');

// ============================================================================
// ENCODING HELPERS
// ============================================================================

function encodeULEB128(value) {
  value = value >>> 0;
  const bytes = [];
  do {
    let b = value & 0x7f;
    value >>>= 7;
    if (value !== 0) b |= 0x80;
    bytes.push(b);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function encodeSLEB128(value) {
  const bytes = [];
  let more = true;
  while (more) {
    let b = value & 0x7f;
    value >>= 7;
    if ((value === 0 && (b & 0x40) === 0) || (value === -1 && (b & 0x40) !== 0)) {
      more = false;
    } else {
      b |= 0x80;
    }
    bytes.push(b);
  }
  return Buffer.from(bytes);
}

// ============================================================================
// SECTION / TYPE ENCODING HELPERS
// ============================================================================

function encodeF32(v) {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(v, 0);
  return buf;
}

function encodeF64(v) {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(v, 0);
  return buf;
}

function encodeUTF8(s) { return Buffer.from(s, 'utf8'); }
function encodeVecU8(buf) { return Buffer.concat([encodeULEB128(buf.length), buf]); }
function encodeSection(id, content) {
  return Buffer.concat([Buffer.from([id]), encodeULEB128(content.length), content]);
}

// ============================================================================
// VALUE TYPE CODES
// ============================================================================

const ValTypeCode = {
  i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c, v128: 0x7b,
  funcref: 0x70, externref: 0x6f, exnref: 0x69,
};

const PackedTypeCode = {
  i8: 0x78,
  i16: 0x77,
};

const HeapTypeCode = {
  func: 0x70, extern: 0x6f, exn: 0x68, any: 0x6e, eq: 0x6d,
  i31: 0x6c, struct: 0x6b, array: 0x6a, none: 0x71, nofunc: 0x73,
  noexn: 0x74, noextern: 0x72, funcref: 0x70, externref: 0x6f, exnref: 0x69,
};

// ============================================================================
// OPCODE TABLES
// ============================================================================

const OPCODE = {
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
  'drop': 0x1a, 'select': 0x1b,
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
};

// 0xFC prefix (bulk memory, sat truncation, misc table ops)
const OPCODE_FC = {
  'i32.trunc_sat_f32_s': 0, 'i32.trunc_sat_f32_u': 1,
  'i32.trunc_sat_f64_s': 2, 'i32.trunc_sat_f64_u': 3,
  'i64.trunc_sat_f32_s': 4, 'i64.trunc_sat_f32_u': 5,
  'i64.trunc_sat_f64_s': 6, 'i64.trunc_sat_f64_u': 7,
  'memory.init': 8, 'data.drop': 9, 'memory.copy': 10, 'memory.fill': 11,
  'table.init': 12, 'elem.drop': 13, 'table.copy': 14,
  'table.grow': 15, 'table.size': 16, 'table.fill': 17,
};

// 0xFB prefix (GC)
const OPCODE_FB = {
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
};

// 0xFD prefix (SIMD)
const OPCODE_FD = {
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
};

// ============================================================================
// TREE HELPERS — walk the concrete parse tree from the adapter
// ============================================================================

function tChildren(node) { return (node && node.children) || []; }

function tChild(node, ...types) {
  return tChildren(node).find(c => types.includes(c.type));
}

function tChildrenOfType(node, ...types) {
  return tChildren(node).filter(c => types.includes(c.type));
}

function tAllTerminals(node) {
  const result = [];
  function walk(n) {
    if (n.text !== undefined) { result.push(n); return; }
    for (const c of tChildren(n)) walk(c);
  }
  walk(node);
  return result;
}

function tFindFirst(node, type) {
  if (!node) return null;
  if (node.type === type) return node;
  for (const c of tChildren(node)) {
    const found = tFindFirst(c, type);
    if (found) return found;
  }
  return null;
}

function tFindAll(node, type, out = []) {
  if (!node) return out;
  if (node.type === type) out.push(node);
  for (const c of tChildren(node)) tFindAll(c, type, out);
  return out;
}

function tNameOf(node) {
  const idNode = tChild(node, 'id');
  if (!idNode) return null;
  const t = tChildren(idNode).find(c => c.text && c.text.startsWith('$'));
  return t ? t.text : null;
}

function tResolveIdxNode(node, idMap) {
  if (!node) return 0;
  const terms = tAllTerminals(node);
  const idTerm = terms.find(t => t.text && t.text.startsWith('$'));
  if (idTerm && idMap && idMap.has(idTerm.text)) return idMap.get(idTerm.text);
  const natTerm = terms.find(t => t.type === 'nat' || (t.text && /^\d+$/.test(t.text)));
  if (natTerm) return parseInt(natTerm.text, 10);
  return 0;
}

function decodeString(raw) {
  const s = raw.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < s.length; ) {
    if (s[i] === '\\') {
      const c = s[i + 1];
      if (c === 'n') { bytes.push(0x0a); i += 2; }
      else if (c === 't') { bytes.push(0x09); i += 2; }
      else if (c === 'r') { bytes.push(0x0d); i += 2; }
      else if (c === '"') { bytes.push(0x22); i += 2; }
      else if (c === "'") { bytes.push(0x27); i += 2; }
      else if (c === '\\') { bytes.push(0x5c); i += 2; }
      else if (/[0-9a-fA-F]/.test(c) && i + 2 < s.length && /[0-9a-fA-F]/.test(s[i + 2])) {
        bytes.push(parseInt(s[i + 1] + s[i + 2], 16)); i += 3;
      } else { bytes.push(s.charCodeAt(i)); i++; }
    } else {
      // Handle multi-byte UTF-8 chars
      const cp = s.codePointAt(i);
      if (cp < 0x80) { bytes.push(cp); i++; }
      else if (cp < 0x800) { bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)); i++; }
      else { bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); i++; }
    }
  }
  return Buffer.from(bytes);
}

function parseNum(text) {
  if (!text) return 0;
  text = text.trim().replace(/_/g, '');
  if (text.startsWith('+')) text = text.slice(1);
  if (text === 'inf') return Infinity;
  if (text === '-inf') return -Infinity;
  if (text.startsWith('nan') || text.startsWith('-nan') || text.startsWith('+nan')) return NaN;
  if (text.startsWith('0x') || text.startsWith('0X')) return parseInt(text, 16);
  if (text.includes('.') || text.toLowerCase().includes('e')) return parseFloat(text);
  return parseInt(text, 10) || 0;
}

// ============================================================================
// MODULE CONTEXT — builds index spaces from parse tree
// ============================================================================

class ModuleContext {
  constructor(tree) {
    this.tree = tree;
    // Flattened subtype index space used by typeidx references.
    this.types = [];
    // Concrete rectype entries as they appear in the type section.
    this.typeEntries = [];
    this.funcs = [];
    this.tables = [];
    this.mems = [];
    this.globals = [];
    this.tags = [];
    this.exports = [];
    this.imports = [];
    this.elems = [];
    this.datas = [];
    this.start = null;
    this.funcDefs = [];
    this.globalDefs = [];
    this.typeIds = new Map();
    this.funcIds = new Map();
    this.tableIds = new Map();
    this.memIds = new Map();
    this.globalIds = new Map();
    this.tagIds = new Map();
    this.elemIds = new Map();
    this.dataIds = new Map();
  }
}

// ============================================================================
// PASS 1 — build symbol tables
// ============================================================================

function buildSymbolTables(ctx) {
  const moduleNode = tFindFirst(ctx.tree, 'module');
  if (!moduleNode) throw new Error('No module node in parse tree');
  for (const mf of tChildrenOfType(moduleNode, 'moduleField')) {
    const inner = tChildren(mf)[0];
    if (!inner) continue;
    if (inner.type === 'typeDef') processTypeDef(ctx, inner);
    else if (inner.type === 'importDef') processImportDef(ctx, inner);
    else if (inner.type === 'funcDef') processFuncDef(ctx, inner);
    else if (inner.type === 'globalDef') processGlobalDef(ctx, inner);
    else if (inner.type === 'memDef') processMemDef(ctx, inner);
    else if (inner.type === 'tableDef') processTableDef(ctx, inner);
    else if (inner.type === 'tagDef') processTagDef(ctx, inner);
    else if (inner.type === 'exportDef') processExportDef(ctx, inner);
    else if (inner.type === 'elemDef') {
      const ei = ctx.elems.length;
      const ename = tNameOf(inner);
      if (ename) ctx.elemIds.set(ename, ei);
      ctx.elems.push(inner);
    }
    else if (inner.type === 'dataDef') {
      const di = ctx.datas.length;
      const dname = tNameOf(inner);
      if (dname) ctx.dataIds.set(dname, di);
      ctx.datas.push(inner);
    }
    else if (inner.type === 'startDef') processStartDef(ctx, inner);
  }
}

function parseValueType(vtNode) {
  const terms = tAllTerminals(vtNode);
  for (const t of terms) {
    if (ValTypeCode[t.text] !== undefined) return t.text;
  }
  return 'i32';
}

function parseFuncTypeSig(funcTypeNode) {
  if (!funcTypeNode) return { kind: 'func', params: [], results: [] };
  const params = [];
  const results = [];
  for (const pd of tChildrenOfType(funcTypeNode, 'paramDecl')) {
    for (const vt of tChildrenOfType(pd, 'valueType')) params.push(parseValueType(vt));
  }
  for (const rd of tChildrenOfType(funcTypeNode, 'resultDecl')) {
    for (const vt of tChildrenOfType(rd, 'valueType')) results.push(parseValueType(vt));
  }
  return { kind: 'func', params, results };
}

function parseStorageType(stNode) {
  const pt = tFindFirst(stNode, 'packType');
  if (pt) {
    const terms = tAllTerminals(pt).map(t => t.text);
    if (terms.includes('i8')) return { kind: 'packed', code: PackedTypeCode.i8 };
    if (terms.includes('i16')) return { kind: 'packed', code: PackedTypeCode.i16 };
  }
  const vt = tFindFirst(stNode, 'valueType');
  if (vt) return { kind: 'val', code: ValTypeCode[parseValueType(vt)] || 0x7f };
  return { kind: 'val', code: 0x7f };
}

function parseFieldType(fieldDeclNode) {
  const st = tChild(fieldDeclNode, 'storagetype');
  const storage = parseStorageType(st);
  const mut = !!tFindFirst(fieldDeclNode, 'mutField');
  return { storage, mutable: mut };
}

function parseCompTypeDesc(compTypeNode) {
  const ft = tChild(compTypeNode, 'funcType');
  if (ft) return parseFuncTypeSig(ft);

  const st = tChild(compTypeNode, 'structType');
  if (st) {
    const fields = tChildrenOfType(st, 'fieldDecl').map(parseFieldType);
    return { kind: 'struct', fields };
  }

  const at = tChild(compTypeNode, 'arrayType');
  if (at) {
    const fd = tChild(at, 'fieldDecl');
    const field = fd ? parseFieldType(fd) : { storage: { kind: 'val', code: 0x7f }, mutable: false };
    return { kind: 'array', field };
  }

  return { kind: 'func', params: [], results: [] };
}

function parseSubtypeDesc(ctx, subtypeNode) {
  const isFinal = !!tFindFirst(subtypeNode, 'TOKEN_final');
  const supertypes = tChildrenOfType(subtypeNode, 'supertype').map((st) => {
    const tu = tFindFirst(st, 'typeuse') || st;
    return resolveTypeUse(ctx, tu);
  });
  const comp = tChild(subtypeNode, 'comptype');
  const desc = comp ? parseCompTypeDesc(comp) : { kind: 'func', params: [], results: [] };
  desc.subtype = { isFinal, supertypes };
  return desc;
}

function parseRectypeDesc(ctx, rectypeNode) {
  if (!rectypeNode) {
    const fallback = { kind: 'func', params: [], results: [] };
    return { entry: { kind: 'single', subtype: fallback }, flat: [fallback] };
  }

  const hasRec = !!tFindFirst(rectypeNode, 'TOKEN_rec');
  const subtypes = tChildrenOfType(rectypeNode, 'subtype').map(st => parseSubtypeDesc(ctx, st));

  if (hasRec && subtypes.length > 0) {
    return {
      entry: { kind: 'rec', subtypes },
      flat: subtypes,
    };
  }

  if (subtypes.length > 0) {
    return {
      entry: { kind: 'single', subtype: subtypes[0] },
      flat: [subtypes[0]],
    };
  }

  const compTypes = tChildrenOfType(rectypeNode, 'comptype').map(parseCompTypeDesc);
  if (compTypes.length > 0) {
    return {
      entry: { kind: 'single', subtype: compTypes[0] },
      flat: [compTypes[0]],
    };
  }

  const fallback = parseCompTypeDesc(rectypeNode);
  return { entry: { kind: 'single', subtype: fallback }, flat: [fallback] };
}

function addSingleTypeEntry(ctx, subtypeDesc) {
  ctx.types.push(subtypeDesc);
  ctx.typeEntries.push({ kind: 'single', subtype: subtypeDesc });
}

function findOrAddFuncType(ctx, sig) {
  if (!sig || sig.kind !== 'func') sig = { kind: 'func', params: [], results: [] };
  const sigKey = JSON.stringify({ kind: 'func', params: sig.params || [], results: sig.results || [] });
  const idx = ctx.types.findIndex(t => {
    if (!t || t.kind !== 'func') return false;
    return JSON.stringify({ kind: 'func', params: t.params || [], results: t.results || [] }) === sigKey;
  });
  if (idx !== -1) return idx;
  const newIdx = ctx.types.length;
  addSingleTypeEntry(ctx, sig);
  return newIdx;
}

function resolveTypeUse(ctx, tuNode) {
  if (!tuNode) return findOrAddFuncType(ctx, { kind: 'func', params: [], results: [] });
  // Explicit (type $id/idx)
  const tidxNode = tChild(tuNode, 'typeidx');
  if (tidxNode) {
    return tResolveIdxNode(tidxNode, ctx.typeIds);
  }
  // Inline params/results
  const sig = parseFuncTypeSig(tuNode);
  return findOrAddFuncType(ctx, sig);
}

function processTypeDef(ctx, node) {
  const firstIdx = ctx.types.length;
  const name = tNameOf(node);
  if (name) ctx.typeIds.set(name, firstIdx);

  const rectype = tChild(node, 'rectype');
  if (rectype) {
    const parsed = parseRectypeDesc(ctx, rectype);
    ctx.typeEntries.push(parsed.entry);
    for (const st of parsed.flat) ctx.types.push(st);
    return;
  }

  // Fallback for parsers that expose funcType directly.
  const funcType = tFindFirst(node, 'funcType');
  addSingleTypeEntry(ctx, parseFuncTypeSig(funcType));
}

function processImportDef(ctx, node) {
  const strTerms = tChildren(node).filter(c => c.type === 'string');
  const modName = strTerms[0] ? strTerms[0].text.slice(1, -1) : '';
  const fieldName = strTerms[1] ? strTerms[1].text.slice(1, -1) : '';
  const descNode = tChild(node, 'importDesc');
  if (!descNode) return;
  const kwds = tAllTerminals(descNode).map(t => t.text);
  const importedId = tNameOf(descNode) || tNameOf(node);

  if (kwds.includes('func')) {
    const idx = ctx.funcs.length;
    if (importedId) ctx.funcIds.set(importedId, idx);
    const typeIdx = resolveTypeUse(ctx, tChild(descNode, 'typeuse'));
    ctx.funcs.push({ typeIdx, imported: true });
    ctx.imports.push({ module: modName, name: fieldName, kind: 'func', idx: typeIdx });
  } else if (kwds.includes('table')) {
    const idx = ctx.tables.length;
    if (importedId) ctx.tableIds.set(importedId, idx);
    ctx.tables.push({ imported: true, node: descNode });
    ctx.imports.push({ module: modName, name: fieldName, kind: 'table', node: descNode });
  } else if (kwds.includes('memory')) {
    const idx = ctx.mems.length;
    if (importedId) ctx.memIds.set(importedId, idx);
    ctx.mems.push({ imported: true, node: descNode });
    ctx.imports.push({ module: modName, name: fieldName, kind: 'memory', node: descNode });
  } else if (kwds.includes('global')) {
    const idx = ctx.globals.length;
    if (importedId) ctx.globalIds.set(importedId, idx);
    ctx.globals.push({ imported: true });
    ctx.imports.push({ module: modName, name: fieldName, kind: 'global', node: descNode });
  } else if (kwds.includes('tag')) {
    const idx = ctx.tags.length;
    if (importedId) ctx.tagIds.set(importedId, idx);
    ctx.tags.push({ imported: true });
    const typeIdx = resolveTypeUse(ctx, tFindFirst(descNode, 'typeuse'));
    ctx.imports.push({ module: modName, name: fieldName, kind: 'tag', idx: typeIdx });
  }
}

function processFuncDef(ctx, node) {
  const idx = ctx.funcs.length;
  const name = tNameOf(node);
  if (name) ctx.funcIds.set(name, idx);
  const typeIdx = resolveTypeUse(ctx, tChild(node, 'typeuse'));
  ctx.funcs.push({ typeIdx, imported: false });
  ctx.funcDefs.push(node);
}

function processGlobalDef(ctx, node) {
  const idx = ctx.globals.length;
  const name = tNameOf(node);
  if (name) ctx.globalIds.set(name, idx);
  const gtNode = tChild(node, 'globalType');
  const mutable = gtNode ? !!tFindFirst(gtNode, 'TOKEN_mut') : false;
  const vt = tFindFirst(gtNode, 'valueType');
  ctx.globals.push({ type: vt ? parseValueType(vt) : 'i32', mutable, imported: false });
  ctx.globalDefs.push(node);
}

function processMemDef(ctx, node) {
  const idx = ctx.mems.length;
  const name = tNameOf(node);
  if (name) ctx.memIds.set(name, idx);
  ctx.mems.push({ imported: false, node });
}

function processTableDef(ctx, node) {
  const idx = ctx.tables.length;
  const name = tNameOf(node);
  if (name) ctx.tableIds.set(name, idx);
  ctx.tables.push({ imported: false, node });
}

function processTagDef(ctx, node) {
  const idx = ctx.tags.length;
  const name = tNameOf(node);
  if (name) ctx.tagIds.set(name, idx);
  const typeIdx = resolveTypeUse(ctx, tFindFirst(node, 'typeuse'));
  ctx.tags.push({ imported: false, typeIdx });
}

function processExportDef(ctx, node) {
  const strTerms = tChildren(node).filter(c => c.type === 'string');
  const name = strTerms[0] ? strTerms[0].text.slice(1, -1) : '';
  const descNode = tChild(node, 'exportDesc');
  if (!descNode) return;
  const kwds = tAllTerminals(descNode).map(t => t.text);
  const idxNode = tFindFirst(descNode, 'index');
  const idN = idxNode ? tChild(idxNode, 'id') : null;
  if (idN) {
    const t = tChildren(idN).find(c => c.text && c.text.startsWith('$'));
    if (t) { ctx.exports.push({ name, idName: t.text }); return; }
  }
  let idx = 0;
  if (idxNode) {
    const natN = tFindFirst(idxNode, 'nat');
    idx = natN ? parseInt(natN.text, 10) : 0;
  }
  const kind = kwds.includes('func') ? 0 : kwds.includes('table') ? 1
    : kwds.includes('memory') ? 2 : kwds.includes('global') ? 3
    : kwds.includes('tag') ? 4 : 0;
  ctx.exports.push({ name, kind, idx });
}

function processStartDef(ctx, node) {
  const terms = tAllTerminals(node);
  const idTerm = terms.find(t => t.text && t.text.startsWith('$'));
  if (idTerm) { ctx.start = { idName: idTerm.text }; return; }
  const natTerm = terms.find(t => t.type === 'nat' || (t.text && /^\d+$/.test(t.text)));
  ctx.start = { idx: natTerm ? parseInt(natTerm.text, 10) : 0 };
}

function resolveExportsAndStart(ctx) {
  for (const exp of ctx.exports) {
    if (!exp.idName) continue;
    const n = exp.idName;
    if (ctx.funcIds.has(n)) { exp.kind = 0; exp.idx = ctx.funcIds.get(n); }
    else if (ctx.tableIds.has(n)) { exp.kind = 1; exp.idx = ctx.tableIds.get(n); }
    else if (ctx.memIds.has(n)) { exp.kind = 2; exp.idx = ctx.memIds.get(n); }
    else if (ctx.globalIds.has(n)) { exp.kind = 3; exp.idx = ctx.globalIds.get(n); }
    else if (ctx.tagIds.has(n)) { exp.kind = 4; exp.idx = ctx.tagIds.get(n); }
    else { exp.kind = 0; exp.idx = 0; }
  }
  if (ctx.start && ctx.start.idName) {
    ctx.start.idx = ctx.funcIds.get(ctx.start.idName) || 0;
  }
}

// ============================================================================
// PASS 2 — emit WASM sections
// ============================================================================

function genTypeSection(ctx) {
  const entries = (ctx.typeEntries && ctx.typeEntries.length > 0)
    ? ctx.typeEntries
    : ctx.types.map(t => ({ kind: 'single', subtype: t }));
  if (!entries.length) return null;

  function emitCompType(desc) {
    if (!desc || desc.kind === 'func') {
      const params = desc && desc.params ? desc.params : [];
      const results = desc && desc.results ? desc.results : [];
      return Buffer.concat([
        Buffer.from([0x60]),
        encodeULEB128(params.length),
        ...params.map(p => Buffer.from([ValTypeCode[p] || 0x7f])),
        encodeULEB128(results.length),
        ...results.map(r => Buffer.from([ValTypeCode[r] || 0x7f])),
      ]);
    }

    if (desc.kind === 'struct') {
      const fields = desc.fields || [];
      return Buffer.concat([
        Buffer.from([0x5f]),
        encodeULEB128(fields.length),
        ...fields.flatMap(f => [Buffer.from([f.storage.code]), Buffer.from([f.mutable ? 1 : 0])]),
      ]);
    }

    if (desc.kind === 'array') {
      const f = desc.field || { storage: { code: 0x7f }, mutable: false };
      return Buffer.concat([Buffer.from([0x5e, f.storage.code, f.mutable ? 1 : 0])]);
    }

    return Buffer.concat([Buffer.from([0x60]), encodeULEB128(0), encodeULEB128(0)]);
  }

  function emitSubtype(desc) {
    const st = desc && desc.subtype ? desc.subtype : { isFinal: true, supertypes: [] };
    const sups = Array.isArray(st.supertypes) ? st.supertypes : [];
    const isFinal = st.isFinal !== false;
    const comp = emitCompType(desc);

    // Binary shorthand: subtype without supertypes that is final can be encoded as comptype.
    if (isFinal && sups.length === 0) return comp;

    const lead = Buffer.from([isFinal ? 0x4f : 0x50]);
    const supVec = Buffer.concat([encodeULEB128(sups.length), ...sups.map(x => encodeULEB128(x))]);
    return Buffer.concat([lead, supVec, comp]);
  }

  const bufs = [encodeULEB128(entries.length)];
  for (const e of entries) {
    if (e.kind === 'rec') {
      const subs = e.subtypes || [];
      bufs.push(Buffer.from([0x4e]));
      bufs.push(encodeULEB128(subs.length));
      for (const st of subs) bufs.push(emitSubtype(st));
      continue;
    }
    bufs.push(emitSubtype(e.subtype));
  }

  return encodeSection(0x01, Buffer.concat(bufs));
}

function emitTableType(node) {
  const rt = tFindFirst(node, 'reftype');
  const rtTerms = rt ? tAllTerminals(rt).map(t => t.text) : [];
  let rtCode = 0x70;
  if (rtTerms.includes('externref') || rtTerms.includes('extern')) rtCode = 0x6f;
  else if (rtTerms.includes('exnref') || rtTerms.includes('exn')) rtCode = 0x69;
  const limBuf = emitLimits(tFindFirst(node, 'limits'));
  return Buffer.concat([Buffer.from([rtCode]), limBuf]);
}

function emitMemType(node) {
  return emitLimits(tFindFirst(node, 'limits'));
}

function emitGlobalTypeBuf(node) {
  const gtNode = tChild(node, 'globalType') || node;
  const mut = !!tFindFirst(gtNode, 'TOKEN_mut');
  const vt = tFindFirst(gtNode, 'valueType');
  const code = vt ? (ValTypeCode[parseValueType(vt)] || 0x7f) : 0x7f;
  return Buffer.from([code, mut ? 0x01 : 0x00]);
}

function emitLimits(limNode) {
  if (!limNode) return Buffer.concat([Buffer.from([0x00]), encodeULEB128(0)]);
  const nats = tAllTerminals(limNode).filter(t => t.type === 'nat' && /^\d/.test(t.text));
  const min = nats[0] ? parseInt(nats[0].text, 10) : 0;
  const max = nats[1] ? parseInt(nats[1].text, 10) : null;
  if (max !== null) return Buffer.concat([Buffer.from([0x01]), encodeULEB128(min), encodeULEB128(max)]);
  return Buffer.concat([Buffer.from([0x00]), encodeULEB128(min)]);
}

function genImportSection(ctx) {
  if (!ctx.imports.length) return null;
  const bufs = [encodeULEB128(ctx.imports.length)];
  for (const imp of ctx.imports) {
    bufs.push(encodeVecU8(encodeUTF8(imp.module)));
    bufs.push(encodeVecU8(encodeUTF8(imp.name)));
    if (imp.kind === 'func') {
      bufs.push(Buffer.from([0x00]));
      bufs.push(encodeULEB128(imp.idx));
    } else if (imp.kind === 'table') {
      bufs.push(Buffer.from([0x01]));
      bufs.push(emitTableType(imp.node));
    } else if (imp.kind === 'memory') {
      bufs.push(Buffer.from([0x02]));
      bufs.push(emitMemType(imp.node));
    } else if (imp.kind === 'global') {
      bufs.push(Buffer.from([0x03]));
      bufs.push(emitGlobalTypeBuf(imp.node));
    } else if (imp.kind === 'tag') {
      bufs.push(Buffer.from([0x04, 0x00]));
      bufs.push(encodeULEB128(imp.idx || 0));
    }
  }
  return encodeSection(0x02, Buffer.concat(bufs));
}

function genFunctionSection(ctx) {
  const defs = ctx.funcs.filter(f => !f.imported);
  if (!defs.length) return null;
  const bufs = [encodeULEB128(defs.length)];
  for (const f of defs) bufs.push(encodeULEB128(f.typeIdx));
  return encodeSection(0x03, Buffer.concat(bufs));
}

function genTableSection(ctx) {
  const defs = ctx.tables.filter(t => !t.imported);
  if (!defs.length) return null;
  const bufs = [encodeULEB128(defs.length)];
  for (const t of defs) bufs.push(emitTableType(t.node));
  return encodeSection(0x04, Buffer.concat(bufs));
}

function genMemorySection(ctx) {
  const defs = ctx.mems.filter(m => !m.imported);
  if (!defs.length) return null;
  const bufs = [encodeULEB128(defs.length)];
  for (const m of defs) bufs.push(emitMemType(m.node));
  return encodeSection(0x05, Buffer.concat(bufs));
}

function genGlobalSection(ctx) {
  if (!ctx.globalDefs.length) return null;
  const bufs = [encodeULEB128(ctx.globalDefs.length)];
  for (let i = 0; i < ctx.globalDefs.length; i++) {
    const gd = ctx.globalDefs[i];
    const g = ctx.globals[ctx.funcs.filter(f => f.imported).length + i] || ctx.globals[i];
    const gt = tChild(gd, 'globalType');
    const mut = gt ? !!tFindFirst(gt, 'TOKEN_mut') : false;
    const vt = tFindFirst(gt, 'valueType');
    bufs.push(Buffer.from([vt ? (ValTypeCode[parseValueType(vt)] || 0x7f) : 0x7f, mut ? 1 : 0]));
    const exprNode = tChild(gd, 'expr');
    bufs.push(emitExprBuf(exprNode, ctx, null));
    bufs.push(Buffer.from([0x0b]));
  }
  return encodeSection(0x06, Buffer.concat(bufs));
}

function genExportSection(ctx) {
  if (!ctx.exports.length) return null;
  const bufs = [encodeULEB128(ctx.exports.length)];
  for (const exp of ctx.exports) {
    bufs.push(encodeVecU8(encodeUTF8(exp.name)));
    bufs.push(Buffer.from([exp.kind || 0]));
    bufs.push(encodeULEB128(exp.idx || 0));
  }
  return encodeSection(0x07, Buffer.concat(bufs));
}

function genStartSection(ctx) {
  if (!ctx.start) return null;
  return encodeSection(0x08, encodeULEB128(ctx.start.idx || 0));
}

function genTagSection(ctx) {
  const defs = ctx.tags.filter(t => !t.imported);
  if (!defs.length) return null;
  const bufs = [encodeULEB128(defs.length)];
  for (const tag of defs) {
    // exception tag type: attribute byte(0) + type index
    bufs.push(Buffer.from([0x00]));
    bufs.push(encodeULEB128(tag.typeIdx || 0));
  }
  return encodeSection(0x0d, Buffer.concat(bufs));
}

function emitElemTypeByte(node) {
  const rt = tFindFirst(node, 'reftype') || node;
  const terms = tAllTerminals(rt).map(t => t.text);
  if (terms.includes('externref') || terms.includes('extern')) return Buffer.from([0x6f]);
  if (terms.includes('exnref') || terms.includes('exn')) return Buffer.from([0x69]);
  return Buffer.from([0x70]);
}

function genElementSection(ctx) {
  if (!ctx.elems.length) return null;
  const bufs = [encodeULEB128(ctx.elems.length)];
  for (const elem of ctx.elems) {
    const allTerms = tAllTerminals(elem).map(t => t.text);
    const isFuncForm = allTerms.includes('func');
    const elemList = tChild(elem, 'elemList') || elem;
    const hasDeclare = allTerms.includes('declare');
    const tableUse = tChild(elem, 'tableUse');
    const hasTableUse = !!tableUse;
    const tableIdx = hasTableUse ? tResolveIdxNode(tFindFirst(tableUse, 'tableidx'), ctx.tableIds) : 0;
    const offsetNode = tChild(elem, 'offset');
    const hasOffset = !!offsetNode;

    if (isFuncForm) {
      // flags for funcidx element segments: 0(active0),1(passive),2(active tableidx),3(declare)
      if (hasDeclare) {
        bufs.push(Buffer.from([0x03, 0x00]));
      } else if (hasTableUse) {
        bufs.push(Buffer.from([0x02]));
        bufs.push(encodeULEB128(tableIdx));
        bufs.push(emitExprBuf(tChild(offsetNode, 'expr') || offsetNode, ctx, null));
        bufs.push(Buffer.from([0x0b, 0x00]));
      } else if (hasOffset) {
        bufs.push(Buffer.from([0x00]));
        bufs.push(emitExprBuf(tChild(offsetNode, 'expr') || offsetNode, ctx, null));
        bufs.push(Buffer.from([0x0b]));
      } else {
        bufs.push(Buffer.from([0x01, 0x00]));
      }

      const funcIdxNodes = tChildrenOfType(elemList, 'funcidx');
      bufs.push(encodeULEB128(funcIdxNodes.length));
      for (const fi of funcIdxNodes) bufs.push(encodeULEB128(tResolveIdxNode(fi, ctx.funcIds)));
    } else {
      // flags for expr element segments: 4(active0),5(passive),6(active tableidx),7(declare)
      if (hasDeclare) {
        bufs.push(Buffer.from([0x07]));
      } else if (hasTableUse) {
        bufs.push(Buffer.from([0x06]));
        bufs.push(encodeULEB128(tableIdx));
        bufs.push(emitExprBuf(tChild(offsetNode, 'expr') || offsetNode, ctx, null));
        bufs.push(Buffer.from([0x0b]));
      } else if (hasOffset) {
        bufs.push(Buffer.from([0x04]));
        bufs.push(emitExprBuf(tChild(offsetNode, 'expr') || offsetNode, ctx, null));
        bufs.push(Buffer.from([0x0b]));
      } else {
        bufs.push(Buffer.from([0x05]));
      }

      bufs.push(emitElemTypeByte(elemList));
      const exprs = tChildrenOfType(elemList, 'elemExpr');
      bufs.push(encodeULEB128(exprs.length));
      for (const ex of exprs) {
        bufs.push(emitExprBuf(tChild(ex, 'expr') || ex, ctx, null));
        bufs.push(Buffer.from([0x0b]));
      }
    }
  }
  return encodeSection(0x09, Buffer.concat(bufs));
}

function usesDataIndexOps(ctx) {
  return ctx.funcDefs.some(fd => tAllTerminals(fd).some(t => t.text === 'memory.init' || t.text === 'data.drop'));
}

function genDataCountSection(ctx) {
  if (!ctx.datas.length) return null;
  if (!usesDataIndexOps(ctx)) return null;
  return encodeSection(0x0c, encodeULEB128(ctx.datas.length));
}

function genCodeSection(ctx) {
  if (!ctx.funcDefs.length) return null;
  const bodies = ctx.funcDefs.map((fd, i) => emitFuncBody(fd, ctx, i));
  const bufs = [encodeULEB128(bodies.length)];
  for (const body of bodies) { bufs.push(encodeULEB128(body.length)); bufs.push(body); }
  return encodeSection(0x0a, Buffer.concat(bufs));
}

function buildLocalCtx(ctx, funcNode, defIndex) {
  // figure out how many imports precede so we find the right func entry
  const importedCount = ctx.funcs.filter(f => f.imported).length;
  const funcEntry = ctx.funcs[importedCount + defIndex] || { typeIdx: 0 };
  const sig = ctx.types[funcEntry.typeIdx] || { params: [], results: [] };

  const localMap = new Map();
  let slot = 0;

  const tu = tChild(funcNode, 'typeuse');
  const paramDecls = tu ? tChildrenOfType(tu, 'paramDecl') : [];
  if (paramDecls.length > 0) {
    for (const pd of paramDecls) {
      const name = tNameOf(pd);
      const vtNodes = tChildrenOfType(pd, 'valueType');
      if (vtNodes.length > 0) {
        for (const vt of vtNodes) { if (name) localMap.set(name, slot); slot++; }
      } else {
        // (param $name type) form — one param
        if (name) localMap.set(name, slot);
        slot++;
      }
    }
  } else {
    slot = sig.params.length;
  }

  const localTypes = [];
  for (const ld of tChildrenOfType(funcNode, 'localDecl')) {
    const name = tNameOf(ld);
    const vtNodes = tChildrenOfType(ld, 'valueType');
    if (vtNodes.length > 0) {
      for (const vt of vtNodes) {
        if (name) localMap.set(name, slot);
        localTypes.push(parseValueType(vt)); slot++;
      }
    } else {
      const typeTerms = tAllTerminals(ld).filter(t => ValTypeCode[t.text]);
      for (const tt of typeTerms) { if (name) localMap.set(name, slot); localTypes.push(tt.text); slot++; }
    }
  }
  return { localMap, localTypes, paramCount: sig.params.length, labelStack: [] };
}

function emitFuncBody(funcNode, ctx, defIndex) {
  const localCtx = buildLocalCtx(ctx, funcNode, defIndex);
  const lts = localCtx.localTypes;
  // group runs of same type
  const groups = [];
  let i = 0;
  while (i < lts.length) {
    let j = i;
    while (j < lts.length && lts[j] === lts[i]) j++;
    groups.push({ count: j - i, type: lts[i] });
    i = j;
  }
  const localBuf = Buffer.concat([
    encodeULEB128(groups.length),
    ...groups.flatMap(g => [encodeULEB128(g.count), Buffer.from([ValTypeCode[g.type] || 0x7f])]),
  ]);
  const exprNode = tChild(funcNode, 'expr');
  const instrBuf = emitExprBuf(exprNode, ctx, localCtx);
  return Buffer.concat([localBuf, instrBuf, Buffer.from([0x0b])]);
}

function genDataSection(ctx) {
  if (!ctx.datas.length) return null;
  const bufs = [encodeULEB128(ctx.datas.length)];
  for (const dd of ctx.datas) {
    const hasOffset = !!tChild(dd, 'offset');
    const hasMemUse = !!tChild(dd, 'memUse');
    if (hasOffset || hasMemUse) {
      const memIdx = hasMemUse
        ? tResolveIdxNode(tFindFirst(tChild(dd, 'memUse'), 'memidx'), ctx.memIds) : 0;
      if (memIdx === 0) {
        bufs.push(Buffer.from([0x00]));
        const offsNode = tChild(dd, 'offset');
        bufs.push(emitExprBuf(tChild(offsNode, 'expr') || offsNode, ctx, null));
        bufs.push(Buffer.from([0x0b]));
      } else {
        bufs.push(Buffer.from([0x02]));
        bufs.push(encodeULEB128(memIdx));
        const offsNode = tChild(dd, 'offset');
        bufs.push(emitExprBuf(tChild(offsNode, 'expr') || offsNode, ctx, null));
        bufs.push(Buffer.from([0x0b]));
      }
    } else {
      bufs.push(Buffer.from([0x01])); // passive
    }
    // datastring: concatenation of string literals
    const dsNode = tChild(dd, 'datastring');
    const strTerms = (dsNode ? tChildren(dsNode) : tChildren(dd))
      .filter(c => c.type === 'string' || (c.text && c.text.startsWith('"')));
    const bytes = Buffer.concat(strTerms.map(s => decodeString(s.text)));
    bufs.push(encodeULEB128(bytes.length));
    bufs.push(bytes);
  }
  return encodeSection(0x0b, Buffer.concat(bufs));
}

// ============================================================================
// INSTRUCTION EMISSION
// ============================================================================

function emitExprBuf(exprNode, ctx, localCtx) {
  if (!exprNode) return Buffer.alloc(0);
  const parts = [];
  for (const instr of tChildrenOfType(exprNode, 'instr')) {
    parts.push(emitInstrBuf(instr, ctx, localCtx));
  }
  return Buffer.concat(parts);
}

function emitInstrBuf(instrNode, ctx, localCtx) {
  const inner = tChildren(instrNode)[0];
  if (!inner) return Buffer.alloc(0);
  if (inner.type === 'foldedInstr') return emitFolded(inner, ctx, localCtx);
  if (inner.type === 'seqInstr') return emitSeq(inner, ctx, localCtx);
  return Buffer.alloc(0);
}

function getOpName(node) {
  const terms = tAllTerminals(node);
  const first = terms.find(t => t.text && t.text !== '(' && t.text !== ')' &&
    t.text !== 'module' && !/^TOKEN_/.test(t.type));
  return first ? first.text : null;
}

function emitFolded(node, ctx, localCtx) {
  // (op nested-instrs...)  where nested instrs are evaluated before op
  const op = getOpName(node);
  const head = tChildren(node).find(c => c.text && c.text !== '(' && c.text !== ')');
  const ctl = head && (head.text === 'block' || head.text === 'loop' || head.text === 'if' || head.text === 'try_table')
    ? head.text
    : null;
  if (ctl === 'block') return emitBlockLike(0x02, node, ctx, localCtx);
  if (ctl === 'loop') return emitBlockLike(0x03, node, ctx, localCtx);
  if (ctl === 'if') return emitIf(node, ctx, localCtx);
  if (ctl === 'try_table') return emitTryTable(node, ctx, localCtx);
  const parts = [];
  for (const si of tChildrenOfType(node, 'instr')) parts.push(emitInstrBuf(si, ctx, localCtx));
  const nb = tChild(node, 'nonBlockInstr');
  if (nb) parts.push(emitNonBlock(nb, ctx, localCtx));
  if (!op && !nb && parts.length === 0) return Buffer.alloc(0);
  return Buffer.concat(parts);
}

function emitSeq(node, ctx, localCtx) {
  const op = getOpName(node);
  const head = tChildren(node).find(c => c.text && c.text !== '(' && c.text !== ')');
  const ctl = head && (head.text === 'block' || head.text === 'loop' || head.text === 'if' || head.text === 'try_table')
    ? head.text
    : null;
  if (ctl === 'block') return emitBlockLike(0x02, node, ctx, localCtx);
  if (ctl === 'loop') return emitBlockLike(0x03, node, ctx, localCtx);
  if (ctl === 'if') return emitIf(node, ctx, localCtx);
  if (ctl === 'try_table') return emitTryTable(node, ctx, localCtx);
  const nb = tChild(node, 'nonBlockInstr');
  if (nb) return emitNonBlock(nb, ctx, localCtx);
  if (!op) return Buffer.alloc(0);
  return Buffer.alloc(0);
}

function emitTryTable(node, ctx, localCtx) {
  // Exception handling try_table encoding:
  // 0x1f blocktype vec(catch) instr* end
  const bt = tChild(node, 'blockType');
  const catches = tChildrenOfType(node, 'catchClause');
  const bodyInstr = tChildrenOfType(node, 'instr');
  const nestedCtx = withPushedLabel(localCtx, tNameOf(tChild(node, 'label')));

  const parts = [Buffer.from([0x1f]), emitBlockType(bt, ctx), encodeULEB128(catches.length)];

  for (const cc of catches) {
    const terms = tAllTerminals(cc).map(t => t.text);
    const isCatchRef = terms.includes('catch_ref');
    const isCatchAll = terms.includes('catch_all');
    const isCatchAllRef = terms.includes('catch_all_ref');

    if (isCatchAllRef) {
      parts.push(Buffer.from([0x03]));
      parts.push(encodeULEB128(resolveLabelIdx(tFindFirst(cc, 'label'), nestedCtx)));
      continue;
    }
    if (isCatchAll) {
      parts.push(Buffer.from([0x02]));
      parts.push(encodeULEB128(resolveLabelIdx(tFindFirst(cc, 'label'), nestedCtx)));
      continue;
    }

    parts.push(Buffer.from([isCatchRef ? 0x01 : 0x00]));
    parts.push(encodeULEB128(resolveLabelIdx(tFindFirst(cc, 'label'), nestedCtx)));
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(cc, 'tagidx'), ctx.tagIds)));
  }

  for (const instr of bodyInstr) parts.push(emitInstrBuf(instr, ctx, nestedCtx));
  parts.push(Buffer.from([0x0b]));
  return Buffer.concat(parts);
}

function emitBlockType(btNode, ctx) {
  if (!btNode) return Buffer.from([0x40]);
  const rd = tChild(btNode, 'resultDecl') || tChild(btNode, 'resultTypes');
  if (rd) {
    const vt = tFindFirst(rd, 'valueType');
    if (vt) return Buffer.from([ValTypeCode[parseValueType(vt)] || 0x7f]);
  }
  const vt = tFindFirst(btNode, 'valueType');
  if (vt) return Buffer.from([ValTypeCode[parseValueType(vt)] || 0x7f]);
  const tu = tChild(btNode, 'typeuse');
  if (tu) return encodeSLEB128(resolveTypeUse(ctx, tu));
  return Buffer.from([0x40]);
}

function emitBlockLike(opcode, node, ctx, localCtx) {
  const bt = tChild(node, 'blockType');
  const parts = [Buffer.from([opcode]), emitBlockType(bt, ctx)];
  const nestedCtx = withPushedLabel(localCtx, tNameOf(tChild(node, 'label')));
  for (const i of tChildrenOfType(node, 'instr')) parts.push(emitInstrBuf(i, ctx, nestedCtx));
  parts.push(Buffer.from([0x0b]));
  return Buffer.concat(parts);
}

function emitIf(node, ctx, localCtx) {
  const bt = tChild(node, 'blockType');
  const parts = [Buffer.from([0x04]), emitBlockType(bt, ctx)];
  const nestedCtx = withPushedLabel(localCtx, tNameOf(tChild(node, 'label')));
  const thenNode = tChildrenOfType(node, 'ifThen', 'thenBlock')[0];
  const elseNode = tChildrenOfType(node, 'ifElse', 'elseBlock')[0];
  if (thenNode) {
    for (const i of tChildrenOfType(thenNode, 'instr')) parts.push(emitInstrBuf(i, ctx, nestedCtx));
    if (elseNode) {
      parts.push(Buffer.from([0x05]));
      for (const i of tChildrenOfType(elseNode, 'instr')) parts.push(emitInstrBuf(i, ctx, nestedCtx));
    }
  } else {
    // Flat sequential form: children contain TOKEN_else directly between instr nodes.
    const direct = tChildren(node);
    let foundElse = false;
    for (const child of direct) {
      if (child.text === 'else' && !foundElse) {
        parts.push(Buffer.from([0x05]));
        foundElse = true;
        continue;
      }
      if (child.type === 'instr') {
        parts.push(emitInstrBuf(child, ctx, nestedCtx));
      }
    }
  }
  parts.push(Buffer.from([0x0b]));
  return Buffer.concat(parts);
}

function emitMemarg(node) {
  const terms = tAllTerminals(node);
  let offset = 0, align = 0;
  for (let i = 0; i < terms.length; i++) {
    const txt = terms[i].text || '';
    if (txt.startsWith('offset=')) { offset = parseInt(txt.slice(7), 10) || 0; }
    else if (txt.startsWith('align=')) { align = Math.log2(parseInt(txt.slice(6), 10) || 1); }
    else if (terms[i].type && terms[i].type.includes('offset') && terms[i + 1]) {
      offset = parseNum(terms[i + 1].text); i++;
    } else if (terms[i].type && terms[i].type.includes('align') && terms[i + 1]) {
      const aval = parseNum(terms[i + 1].text);
      align = aval > 0 ? Math.log2(aval) : 0; i++;
    }
  }
  return Buffer.concat([encodeULEB128(Math.round(align)), encodeULEB128(offset)]);
}

function emitHeapType(node) {
  const terms = tAllTerminals(node).map(t => t.text);
  for (const t of terms) { if (HeapTypeCode[t] !== undefined) return Buffer.from([HeapTypeCode[t]]); }
  const nat = terms.find(t => /^\d+$/.test(t));
  if (nat) return encodeULEB128(parseInt(nat, 10));
  return Buffer.from([0x70]);
}

function resolveLocal(node, localCtx) {
  if (!localCtx) return 0;
  const terms = tAllTerminals(node);
  const idTerm = terms.find(t => t.text && t.text.startsWith('$'));
  if (idTerm && localCtx.localMap.has(idTerm.text)) return localCtx.localMap.get(idTerm.text);
  const natTerm = terms.find(t => t.type === 'nat' || (t.text && /^\d+$/.test(t.text)));
  if (natTerm) return parseInt(natTerm.text, 10);
  return 0;
}

function withPushedLabel(localCtx, labelName) {
  const base = localCtx || { localMap: new Map(), localTypes: [], paramCount: 0, labelStack: [] };
  return {
    ...base,
    labelStack: [labelName || null, ...(base.labelStack || [])],
  };
}

function resolveLabelIdx(node, localCtx) {
  if (!node) return 0;
  const terms = tAllTerminals(node);
  const idTerm = terms.find(t => t.text && t.text.startsWith('$'));
  if (idTerm && localCtx && Array.isArray(localCtx.labelStack)) {
    const idx = localCtx.labelStack.findIndex(x => x === idTerm.text);
    if (idx !== -1) return idx;
  }
  const natTerm = terms.find(t => t.type === 'nat' || (t.text && /^\d+$/.test(t.text)));
  if (natTerm) return parseInt(natTerm.text, 10);
  return 0;
}

function getIdMap(indexType, ctx) {
  return { typeidx: ctx.typeIds, funcidx: ctx.funcIds, tableidx: ctx.tableIds,
           memidx: ctx.memIds, globalidx: ctx.globalIds, tagidx: ctx.tagIds,
           elemidx: ctx.elemIds, dataidx: ctx.dataIds }[indexType] || new Map();
}

function isMemLoadStore(op) {
  return /^[ifd](32|64)\.(load|store)/.test(op) || op === 'v128.load' || op === 'v128.store';
}

function emitNonBlock(node, ctx, localCtx) {
  const terms = tAllTerminals(node);
  const opTerm = terms.find(t => t.type === 'dottedName' || OPCODE[t.text] !== undefined
    || OPCODE_FB[t.text] !== undefined || OPCODE_FC[t.text] !== undefined
    || OPCODE_FD[t.text] !== undefined);
  const op = opTerm ? opTerm.text : (terms[0] ? terms[0].text : null);
  if (!op) return Buffer.alloc(0);

  const parts = [];

  // GC (0xFB)
  if (OPCODE_FB[op] !== undefined) {
    parts.push(Buffer.from([0xfb]), encodeULEB128(OPCODE_FB[op]));
    if (op === 'ref.test' || op === 'ref.cast') {
      const rt = tChild(node, 'reftype');
      const nullable = rt && tAllTerminals(rt).some(t => t.text === 'null');
      parts.push(Buffer.from([nullable ? 0x01 : 0x00]));
      parts.push(emitHeapType(rt || node));
    } else if (op === 'br_on_cast' || op === 'br_on_cast_fail') {
      const labelIdx = resolveLabelIdx(tFindFirst(node, 'labelidx'), localCtx);
      parts.push(encodeULEB128(labelIdx));
      const rts = tChildrenOfType(node, 'reftype');
      const flags = (rts[0] && tAllTerminals(rts[0]).some(t => t.text === 'null') ? 1 : 0)
                  | (rts[1] && tAllTerminals(rts[1]).some(t => t.text === 'null') ? 2 : 0);
      parts.push(Buffer.from([flags]));
      if (rts[0]) parts.push(emitHeapType(rts[0]));
      if (rts[1]) parts.push(emitHeapType(rts[1]));
    } else if (op === 'struct.get' || op === 'struct.get_s' || op === 'struct.get_u' || op === 'struct.set') {
      const ti = tFindFirst(node, 'typeidx'); const fi = tFindFirst(node, 'fieldidx');
      parts.push(encodeULEB128(tResolveIdxNode(ti, ctx.typeIds)));
      parts.push(encodeULEB128(tResolveIdxNode(fi, new Map())));
    } else if (op === 'struct.new' || op === 'struct.new_default' || op === 'array.new' || op === 'array.new_default') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
    } else if (op === 'array.new_fixed') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
      const natT = terms.find(t => t.type === 'nat'); parts.push(encodeULEB128(natT ? parseInt(natT.text, 10) : 0));
    } else if (op === 'array.new_data' || op === 'array.init_data') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'dataidx'), ctx.dataIds)));
    } else if (op === 'array.new_elem' || op === 'array.init_elem') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'elemidx'), ctx.elemIds)));
    } else if (op === 'array.get' || op === 'array.get_s' || op === 'array.get_u' || op === 'array.set' || op === 'array.fill') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
    } else if (op === 'array.copy') {
      const tis = tChildrenOfType(node, 'typeidx');
      parts.push(encodeULEB128(tResolveIdxNode(tis[0], ctx.typeIds)));
      parts.push(encodeULEB128(tResolveIdxNode(tis[1], ctx.typeIds)));
    }
    return Buffer.concat(parts);
  }

  // SIMD (0xFD)
  if (OPCODE_FD[op] !== undefined) {
    parts.push(Buffer.from([0xfd]), encodeULEB128(OPCODE_FD[op]));
    if (op === 'v128.const') {
      const bytes = Buffer.alloc(16, 0);
      const natTerms = terms.filter(t => t.type === 'nat');
      for (let li = 0; li < 16 && li < natTerms.length; li++) bytes[li] = parseInt(natTerms[li].text, 10) & 0xff;
      parts.push(bytes);
    } else if (op === 'i8x16.shuffle') {
      const natTerms = terms.filter(t => t.type === 'nat');
      for (let li = 0; li < 16; li++) parts.push(Buffer.from([natTerms[li] ? parseInt(natTerms[li].text, 10) & 0xff : 0]));
    } else {
      const maNode = tFindFirst(node, 'memarg');
      if (maNode) parts.push(emitMemarg(maNode));
      // lane index (for extract_lane / replace_lane / load*_lane / store*_lane)
      const laneOps = ['extract_lane', 'replace_lane', 'load8_lane', 'load16_lane', 'load32_lane',
                       'load64_lane', 'store8_lane', 'store16_lane', 'store32_lane', 'store64_lane'];
      if (laneOps.some(s => op.includes(s))) {
        const laneT = terms.find(t => t.type === 'nat');
        parts.push(Buffer.from([laneT ? parseInt(laneT.text, 10) : 0]));
      }
    }
    return Buffer.concat(parts);
  }

  // Misc (0xFC)
  if (OPCODE_FC[op] !== undefined) {
    parts.push(Buffer.from([0xfc]), encodeULEB128(OPCODE_FC[op]));
    if (op === 'memory.init') {
      // Parser maps `memory.init a b` operands as memidx then dataidx.
      // Binary encoding for 0xFC/8 is dataidx then memidx.
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'memidx'), ctx.memIds)));
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'dataidx'), ctx.dataIds)));
    } else if (op === 'data.drop') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'dataidx'), ctx.dataIds)));
    } else if (op === 'memory.copy') {
      const ms = tChildrenOfType(node, 'memidx');
      parts.push(encodeULEB128(tResolveIdxNode(ms[0], ctx.memIds)));
      parts.push(encodeULEB128(tResolveIdxNode(ms[1], ctx.memIds)));
    } else if (op === 'memory.fill') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'memidx'), ctx.memIds)));
    } else if (op === 'table.init') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'tableidx'), ctx.tableIds)));
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'elemidx'), ctx.elemIds)));
    } else if (op === 'elem.drop') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'elemidx'), ctx.elemIds)));
    } else if (op === 'table.copy') {
      const ts = tChildrenOfType(node, 'tableidx');
      parts.push(encodeULEB128(tResolveIdxNode(ts[0], ctx.tableIds)));
      parts.push(encodeULEB128(tResolveIdxNode(ts[1], ctx.tableIds)));
    } else if (op === 'table.grow' || op === 'table.size' || op === 'table.fill') {
      parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'tableidx'), ctx.tableIds)));
    }
    return Buffer.concat(parts);
  }

  // Single-byte opcodes
  const opcode = OPCODE[op];
  if (opcode === undefined) return Buffer.alloc(0); // unknown — skip
  parts.push(Buffer.from([opcode]));

  if (op === 'i32.const') {
    const t = terms.find(t => t.text && /^-?\d/.test(t.text));
    parts.push(encodeSLEB128(t ? parseNum(t.text) : 0));
  } else if (op === 'i64.const') {
    const t = terms.find(t => t.text && /^-?\d/.test(t.text));
    parts.push(encodeSLEB128(t ? parseNum(t.text) : 0));
  } else if (op === 'f32.const') {
    const t = terms.find(t => t.text && /^[+\-]?(\d|inf|nan)/.test(t.text));
    parts.push(encodeF32(t ? parseNum(t.text) : 0));
  } else if (op === 'f64.const') {
    const t = terms.find(t => t.text && /^[+\-]?(\d|inf|nan)/.test(t.text));
    parts.push(encodeF64(t ? parseNum(t.text) : 0));
  } else if (op === 'local.get' || op === 'local.set' || op === 'local.tee') {
    parts.push(encodeULEB128(resolveLocal(node, localCtx)));
  } else if (op === 'global.get' || op === 'global.set') {
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'index') || tFindFirst(node, 'globalidx'), ctx.globalIds)));
  } else if (op === 'table.get' || op === 'table.set') {
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'tableidx'), ctx.tableIds)));
  } else if (op === 'call') {
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'funcidx') || tFindFirst(node, 'index'), ctx.funcIds)));
  } else if (op === 'return_call') {
    parts[0] = Buffer.from([0x12]);
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'funcidx') || tFindFirst(node, 'index'), ctx.funcIds)));
  } else if (op === 'call_ref') {
    parts[0] = Buffer.from([0x14]);
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
  } else if (op === 'return_call_ref') {
    parts[0] = Buffer.from([0x15]);
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'typeidx'), ctx.typeIds)));
  } else if (op === 'call_indirect') {
    const tu = tFindFirst(node, 'typeuse');
    const tbl = tFindFirst(node, 'tableidx');
    parts.push(encodeULEB128(resolveTypeUse(ctx, tu)));
    parts.push(encodeULEB128(tResolveIdxNode(tbl, ctx.tableIds)));
  } else if (op === 'return_call_indirect') {
    parts[0] = Buffer.from([0x13]);
    const tu = tFindFirst(node, 'typeuse');
    const tbl = tFindFirst(node, 'tableidx');
    parts.push(encodeULEB128(resolveTypeUse(ctx, tu)));
    parts.push(encodeULEB128(tResolveIdxNode(tbl, ctx.tableIds)));
  } else if (op === 'br' || op === 'br_if' || op === 'br_on_null' || op === 'br_on_non_null') {
    parts.push(encodeULEB128(resolveLabelIdx(tFindFirst(node, 'labelidx') || tFindFirst(node, 'index'), localCtx)));
  } else if (op === 'br_table') {
    const labels = tChildrenOfType(node, 'labelidx');
    if (labels.length > 0) {
      parts.push(encodeULEB128(labels.length - 1));
      for (const l of labels) parts.push(encodeULEB128(resolveLabelIdx(l, localCtx)));
    } else {
      // fallback: raw nat values
      const natTerms = terms.filter(t => t.type === 'nat');
      parts.push(encodeULEB128(natTerms.length > 0 ? natTerms.length - 1 : 0));
      for (const n of natTerms) parts.push(encodeULEB128(parseInt(n.text, 10)));
    }
  } else if (op === 'throw') {
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'tagidx'), ctx.tagIds)));
  } else if (op === 'rethrow') {
    parts.push(encodeULEB128(resolveLabelIdx(tFindFirst(node, 'labelidx') || tFindFirst(node, 'index'), localCtx)));
  } else if (op === 'ref.null') {
    parts.push(emitHeapType(tChild(node, 'heaptype') || node));
  } else if (op === 'ref.func') {
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'funcidx') || tFindFirst(node, 'index'), ctx.funcIds)));
  } else if (op === 'select') {
    const rt = tFindFirst(node, 'resultTypes') || tFindFirst(node, 'resultDecl');
    if (rt) {
      parts[0] = Buffer.from([0x1c]);
      const vts = tChildrenOfType(rt, 'valueType');
      parts.push(encodeULEB128(vts.length));
      for (const vt of vts) parts.push(Buffer.from([ValTypeCode[parseValueType(vt)] || 0x7f]));
    }
  } else if (op === 'memory.size' || op === 'memory.grow') {
    parts.push(encodeULEB128(tResolveIdxNode(tFindFirst(node, 'memidx'), ctx.memIds)));
  } else if (isMemLoadStore(op)) {
    const ma = tFindFirst(node, 'memarg');
    parts.push(ma ? emitMemarg(ma) : Buffer.from([0x00, 0x00]));
  }
  // Simple opcodes (no immediates) are already handled by pushing just the opcode byte

  return Buffer.concat(parts);
}

// ============================================================================
// MAIN ASSEMBLER
// ============================================================================

class WatAssembler {
  assemble(sourceWat) {
    const p = new WATParser(sourceWat);
    const tree = p.parse();
    const ctx = new ModuleContext(tree);
    buildSymbolTables(ctx);
    resolveExportsAndStart(ctx);
    const sections = [
      Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
      genTypeSection(ctx),
      genImportSection(ctx),
      genFunctionSection(ctx),
      genTableSection(ctx),
      genMemorySection(ctx),
      genGlobalSection(ctx),
      genExportSection(ctx),
      genStartSection(ctx),
      genElementSection(ctx),
      genDataCountSection(ctx),
      genCodeSection(ctx),
      genDataSection(ctx),
      genTagSection(ctx),
    ].filter(Boolean);
    return Buffer.concat(sections);
  }
}

if (require.main === module) {
  const samples = [
    { label: 'simple add',
      wat: `(module
        (func $add (param i32 i32) (result i32)
          local.get 0
          local.get 1
          i32.add)
        (export "add" (func $add)))` },
    { label: 'import + memory + data + global',
      wat: `(module
        (import "env" "log" (func $log (param i32)))
        (memory 1)
        (global $g (mut i32) (i32.const 0))
        (data (i32.const 0) "hello")
        (func $run (result i32)
          i32.const 42
          global.set $g
          global.get $g)
        (export "run" (func $run))
        (export "mem" (memory 0)))` },
    { label: 'block + br_if',
      wat: `(module
        (func $f (param i32) (result i32)
          block $b
            local.get 0
            i32.eqz
            br_if $b
            i32.const 1
            return
          end
          i32.const 0)
        (export "f" (func $f)))` },
  ];
  for (const { label, wat } of samples) {
    try {
      const wasm = new WatAssembler().assemble(wat);
      console.log(`OK [${label}] => ${wasm.length} bytes, magic=${wasm.slice(0,4).toString('hex')}`);
    } catch (e) { console.error(`FAIL [${label}]: ${e.message}`); }
  }
}

module.exports = WatAssembler;
