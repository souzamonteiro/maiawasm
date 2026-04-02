#!/usr/bin/env node

/**
 * WebAssembly Text Format Assembler
 * 
 * A modern, well-documented assembler that compiles WebAssembly text format (.wat)
 * to binary WebAssembly (.wasm).
 * 
 * Based on the original js_of_ocaml compiled code, but rewritten with clarity,
 * maintainability, and extensibility in mind.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONSTANTS AND TYPE DEFINITIONS
// ============================================================================

/**
 * WebAssembly value types
 */
const ValueType = {
  I32: 0x7F,
  I64: 0x7E,
  F32: 0x7D,
  F64: 0x7C,
  V128: 0x7B,
  FUNCREF: 0x70,
  EXTERNREF: 0x6F,
};

/**
 * WebAssembly external kinds
 */
const ExternalKind = {
  FUNCTION: 0x00,
  TABLE: 0x01,
  MEMORY: 0x02,
  GLOBAL: 0x03,
};

/**
 * WebAssembly opcodes
 */
const Opcode = {
  // Control flow
  UNREACHABLE: 0x00,
  NOP: 0x01,
  BLOCK: 0x02,
  LOOP: 0x03,
  IF: 0x04,
  ELSE: 0x05,
  END: 0x0B,
  BR: 0x0C,
  BR_IF: 0x0D,
  BR_TABLE: 0x0E,
  RETURN: 0x0F,
  
  // Calls
  CALL: 0x10,
  CALL_INDIRECT: 0x11,
  
  // Parametric
  DROP: 0x1A,
  SELECT: 0x1B,
  SELECT_T: 0x1C,
  
  // Variable access
  LOCAL_GET: 0x20,
  LOCAL_SET: 0x21,
  LOCAL_TEE: 0x22,
  GLOBAL_GET: 0x23,
  GLOBAL_SET: 0x24,
  
  // Table instructions
  TABLE_GET: 0x25,
  TABLE_SET: 0x26,
  TABLE_INIT: 0xFC,
  ELEM_DROP: 0xFD,
  TABLE_COPY: 0xFC,
  TABLE_GROW: 0xFC,
  TABLE_SIZE: 0xFC,
  TABLE_FILL: 0xFC,
  
  // Memory instructions
  I32_LOAD: 0x28,
  I64_LOAD: 0x29,
  F32_LOAD: 0x2A,
  F64_LOAD: 0x2B,
  I32_LOAD8_S: 0x2C,
  I32_LOAD8_U: 0x2D,
  I32_LOAD16_S: 0x2E,
  I32_LOAD16_U: 0x2F,
  I64_LOAD8_S: 0x30,
  I64_LOAD8_U: 0x31,
  I64_LOAD16_S: 0x32,
  I64_LOAD16_U: 0x33,
  I64_LOAD32_S: 0x34,
  I64_LOAD32_U: 0x35,
  I32_STORE: 0x36,
  I64_STORE: 0x37,
  F32_STORE: 0x38,
  F64_STORE: 0x39,
  I32_STORE8: 0x3A,
  I32_STORE16: 0x3B,
  I64_STORE8: 0x3C,
  I64_STORE16: 0x3D,
  I64_STORE32: 0x3E,
  MEMORY_SIZE: 0x3F,
  MEMORY_GROW: 0x40,
  MEMORY_INIT: 0xFC,
  MEMORY_COPY: 0xFC,
  MEMORY_FILL: 0xFC,
  DATA_DROP: 0xFC,
  
  // Numeric constants
  I32_CONST: 0x41,
  I64_CONST: 0x42,
  F32_CONST: 0x43,
  F64_CONST: 0x44,
  
  // Numeric operations
  I32_EQZ: 0x45,
  I32_EQ: 0x46,
  I32_NE: 0x47,
  I32_LT_S: 0x48,
  I32_LT_U: 0x49,
  I32_GT_S: 0x4A,
  I32_GT_U: 0x4B,
  I32_LE_S: 0x4C,
  I32_LE_U: 0x4D,
  I32_GE_S: 0x4E,
  I32_GE_U: 0x4F,
  
  I64_EQZ: 0x50,
  I64_EQ: 0x51,
  I64_NE: 0x52,
  I64_LT_S: 0x53,
  I64_LT_U: 0x54,
  I64_GT_S: 0x55,
  I64_GT_U: 0x56,
  I64_LE_S: 0x57,
  I64_LE_U: 0x58,
  I64_GE_S: 0x59,
  I64_GE_U: 0x5A,
  
  F32_EQ: 0x5B,
  F32_NE: 0x5C,
  F32_LT: 0x5D,
  F32_GT: 0x5E,
  F32_LE: 0x5F,
  F32_GE: 0x60,
  
  F64_EQ: 0x61,
  F64_NE: 0x62,
  F64_LT: 0x63,
  F64_GT: 0x64,
  F64_LE: 0x65,
  F64_GE: 0x66,
  
  I32_CLZ: 0x67,
  I32_CTZ: 0x68,
  I32_POPCNT: 0x69,
  I32_ADD: 0x6A,
  I32_SUB: 0x6B,
  I32_MUL: 0x6C,
  I32_DIV_S: 0x6D,
  I32_DIV_U: 0x6E,
  I32_REM_S: 0x6F,
  I32_REM_U: 0x70,
  I32_AND: 0x71,
  I32_OR: 0x72,
  I32_XOR: 0x73,
  I32_SHL: 0x74,
  I32_SHR_S: 0x75,
  I32_SHR_U: 0x76,
  I32_ROTL: 0x77,
  I32_ROTR: 0x78,
  
  I64_CLZ: 0x79,
  I64_CTZ: 0x7A,
  I64_POPCNT: 0x7B,
  I64_ADD: 0x7C,
  I64_SUB: 0x7D,
  I64_MUL: 0x7E,
  I64_DIV_S: 0x7F,
  I64_DIV_U: 0x80,
  I64_REM_S: 0x81,
  I64_REM_U: 0x82,
  I64_AND: 0x83,
  I64_OR: 0x84,
  I64_XOR: 0x85,
  I64_SHL: 0x86,
  I64_SHR_S: 0x87,
  I64_SHR_U: 0x88,
  I64_ROTL: 0x89,
  I64_ROTR: 0x8A,
  
  F32_ABS: 0x8B,
  F32_NEG: 0x8C,
  F32_CEIL: 0x8D,
  F32_FLOOR: 0x8E,
  F32_TRUNC: 0x8F,
  F32_NEAREST: 0x90,
  F32_SQRT: 0x91,
  F32_ADD: 0x92,
  F32_SUB: 0x93,
  F32_MUL: 0x94,
  F32_DIV: 0x95,
  F32_MIN: 0x96,
  F32_MAX: 0x97,
  F32_COPYSIGN: 0x98,
  
  F64_ABS: 0x99,
  F64_NEG: 0x9A,
  F64_CEIL: 0x9B,
  F64_FLOOR: 0x9C,
  F64_TRUNC: 0x9D,
  F64_NEAREST: 0x9E,
  F64_SQRT: 0x9F,
  F64_ADD: 0xA0,
  F64_SUB: 0xA1,
  F64_MUL: 0xA2,
  F64_DIV: 0xA3,
  F64_MIN: 0xA4,
  F64_MAX: 0xA5,
  F64_COPYSIGN: 0xA6,
  
  // Conversions
  I32_WRAP_I64: 0xA7,
  I32_TRUNC_F32_S: 0xA8,
  I32_TRUNC_F32_U: 0xA9,
  I32_TRUNC_F64_S: 0xAA,
  I32_TRUNC_F64_U: 0xAB,
  I64_EXTEND_I32_S: 0xAC,
  I64_EXTEND_I32_U: 0xAD,
  I64_TRUNC_F32_S: 0xAE,
  I64_TRUNC_F32_U: 0xAF,
  I64_TRUNC_F64_S: 0xB0,
  I64_TRUNC_F64_U: 0xB1,
  F32_CONVERT_I32_S: 0xB2,
  F32_CONVERT_I32_U: 0xB3,
  F32_CONVERT_I64_S: 0xB4,
  F32_CONVERT_I64_U: 0xB5,
  F32_DEMOTE_F64: 0xB6,
  F64_CONVERT_I32_S: 0xB7,
  F64_CONVERT_I32_U: 0xB8,
  F64_CONVERT_I64_S: 0xB9,
  F64_CONVERT_I64_U: 0xBA,
  F64_PROMOTE_F32: 0xBB,
  
  // Reinterpretations
  I32_REINTERPRET_F32: 0xBC,
  I64_REINTERPRET_F64: 0xBD,
  F32_REINTERPRET_I32: 0xBE,
  F64_REINTERPRET_I64: 0xBF,
  
  // Extended opcodes (SIMD, etc.)
  I32_EXTEND8_S: 0xC0,
  I32_EXTEND16_S: 0xC1,
  I64_EXTEND8_S: 0xC2,
  I64_EXTEND16_S: 0xC3,
  I64_EXTEND32_S: 0xC4,
  
  // Prefix for multi-byte opcodes
  PREFIX_FC: 0xFC,
  PREFIX_FD: 0xFD,
  PREFIX_FE: 0xFE,
};

/**
 * Extended opcodes (prefixed with 0xFC)
 */
const OpcodeFC = {
  I32_TRUNC_SAT_F32_S: 0x00,
  I32_TRUNC_SAT_F32_U: 0x01,
  I32_TRUNC_SAT_F64_S: 0x02,
  I32_TRUNC_SAT_F64_U: 0x03,
  I64_TRUNC_SAT_F32_S: 0x04,
  I64_TRUNC_SAT_F32_U: 0x05,
  I64_TRUNC_SAT_F64_S: 0x06,
  I64_TRUNC_SAT_F64_U: 0x07,
  
  MEMORY_INIT: 0x08,
  DATA_DROP: 0x09,
  MEMORY_COPY: 0x0A,
  MEMORY_FILL: 0x0B,
  TABLE_INIT: 0x0C,
  ELEM_DROP: 0x0D,
  TABLE_COPY: 0x0E,
  TABLE_GROW: 0x0F,
  TABLE_SIZE: 0x10,
  TABLE_FILL: 0x11,
  
  // SIMD
  V128_LOAD: 0x00,
  V128_LOAD8X8_S: 0x41,
  V128_LOAD8X8_U: 0x42,
  V128_LOAD16X4_S: 0x43,
  V128_LOAD16X4_U: 0x44,
  V128_LOAD32X2_S: 0x45,
  V128_LOAD32X2_U: 0x46,
  V128_LOAD8_SPLAT: 0x47,
  V128_LOAD16_SPLAT: 0x48,
  V128_LOAD32_SPLAT: 0x49,
  V128_LOAD64_SPLAT: 0x4A,
  V128_STORE: 0x0B,
  V128_CONST: 0x0C,
  I8X16_SHUFFLE: 0x0D,
  I8X16_SWIZZLE: 0x4E,
  
  I8X16_SPLAT: 0x0F,
  I16X8_SPLAT: 0x10,
  I32X4_SPLAT: 0x11,
  I64X2_SPLAT: 0x12,
  F32X4_SPLAT: 0x13,
  F64X2_SPLAT: 0x14,
  
  I8X16_EXTRACT_LANE_S: 0x55,
  I8X16_EXTRACT_LANE_U: 0x56,
  I8X16_REPLACE_LANE: 0x57,
  I16X8_EXTRACT_LANE_S: 0x58,
  I16X8_EXTRACT_LANE_U: 0x59,
  I16X8_REPLACE_LANE: 0x5A,
  I32X4_EXTRACT_LANE: 0x1B,
  I32X4_REPLACE_LANE: 0x1C,
  I64X2_EXTRACT_LANE: 0x5D,
  I64X2_REPLACE_LANE: 0x5E,
  F32X4_EXTRACT_LANE: 0x5F,
  F32X4_REPLACE_LANE: 0x60,
  F64X2_EXTRACT_LANE: 0x61,
  F64X2_REPLACE_LANE: 0x62,
  
  I8X16_EQ: 0x63,
  I8X16_NE: 0x64,
  I8X16_LT_S: 0x65,
  I8X16_LT_U: 0x66,
  I8X16_GT_S: 0x67,
  I8X16_GT_U: 0x68,
  I8X16_LE_S: 0x69,
  I8X16_LE_U: 0x6A,
  I8X16_GE_S: 0x6B,
  I8X16_GE_U: 0x6C,
  
  I16X8_EQ: 0x6D,
  I16X8_NE: 0x6E,
  I16X8_LT_S: 0x6F,
  I16X8_LT_U: 0x70,
  I16X8_GT_S: 0x71,
  I16X8_GT_U: 0x72,
  I16X8_LE_S: 0x73,
  I16X8_LE_U: 0x74,
  I16X8_GE_S: 0x75,
  I16X8_GE_U: 0x76,
  
  I32X4_EQ: 0x77,
  I32X4_NE: 0x78,
  I32X4_LT_S: 0x79,
  I32X4_LT_U: 0x7A,
  I32X4_GT_S: 0x7B,
  I32X4_GT_U: 0x7C,
  I32X4_LE_S: 0x7D,
  I32X4_LE_U: 0x7E,
  I32X4_GE_S: 0x7F,
  I32X4_GE_U: 0x80,
  
  F32X4_EQ: 0x81,
  F32X4_NE: 0x82,
  F32X4_LT: 0x83,
  F32X4_GT: 0x84,
  F32X4_LE: 0x85,
  F32X4_GE: 0x86,
  
  F64X2_EQ: 0x87,
  F64X2_NE: 0x88,
  F64X2_LT: 0x89,
  F64X2_GT: 0x8A,
  F64X2_LE: 0x8B,
  F64X2_GE: 0x8C,
  
  V128_NOT: 0x8D,
  V128_AND: 0x8E,
  V128_ANDNOT: 0x8F,
  V128_OR: 0x90,
  V128_XOR: 0x91,
  V128_BITSELECT: 0x92,
  V128_ANY_TRUE: 0x93,
  
  F32X4_CEIL: 0x94,
  F32X4_FLOOR: 0x95,
  F32X4_TRUNC: 0x96,
  F32X4_NEAREST: 0x97,
  F64X2_CEIL: 0x98,
  F64X2_FLOOR: 0x99,
  F64X2_TRUNC: 0x9A,
  F64X2_NEAREST: 0x9B,
  
  F32X4_DEMOTE_F64X2_ZERO: 0x9C,
  F64X2_PROMOTE_LOW_F32X4: 0x9D,
  
  I8X16_ABS: 0x9E,
  I8X16_NEG: 0x9F,
  I8X16_POPCNT: 0xA0,
  I8X16_ALL_TRUE: 0xA1,
  I8X16_BITMASK: 0xA2,
  I8X16_NARROW_I16X8_S: 0xA3,
  I8X16_NARROW_I16X8_U: 0xA4,
  I8X16_SHL: 0xA5,
  I8X16_SHR_S: 0xA6,
  I8X16_SHR_U: 0xA7,
  I8X16_ADD: 0x6E,
  I8X16_ADD_SAT_S: 0xA9,
  I8X16_ADD_SAT_U: 0xAA,
  I8X16_SUB: 0x71,
  I8X16_SUB_SAT_S: 0xAC,
  I8X16_SUB_SAT_U: 0xAD,
  I8X16_MIN_S: 0xAE,
  I8X16_MIN_U: 0xAF,
  I8X16_MAX_S: 0xB0,
  I8X16_MAX_U: 0xB1,
  I8X16_AVGR_U: 0xB2,
  
  I16X8_ABS: 0xB3,
  I16X8_NEG: 0xB4,
  I16X8_ALL_TRUE: 0xB5,
  I16X8_BITMASK: 0xB6,
  I16X8_NARROW_I32X4_S: 0xB7,
  I16X8_NARROW_I32X4_U: 0xB8,
  I16X8_EXTEND_LOW_I8X16_S: 0xB9,
  I16X8_EXTEND_HIGH_I8X16_S: 0xBA,
  I16X8_EXTEND_LOW_I8X16_U: 0xBB,
  I16X8_EXTEND_HIGH_I8X16_U: 0xBC,
  I16X8_SHL: 0xBD,
  I16X8_SHR_S: 0xBE,
  I16X8_SHR_U: 0xBF,
  I16X8_ADD: 0xC0,
  I16X8_ADD_SAT_S: 0xC1,
  I16X8_ADD_SAT_U: 0xC2,
  I16X8_SUB: 0xC3,
  I16X8_SUB_SAT_S: 0xC4,
  I16X8_SUB_SAT_U: 0xC5,
  I16X8_MUL: 0x95,
  I16X8_MIN_S: 0xC7,
  I16X8_MIN_U: 0xC8,
  I16X8_MAX_S: 0xC9,
  I16X8_MAX_U: 0xCA,
  I16X8_AVGR_U: 0xCB,
  I16X8_EXTMUL_LOW_I8X16_S: 0xCC,
  I16X8_EXTMUL_HIGH_I8X16_S: 0xCD,
  I16X8_EXTMUL_LOW_I8X16_U: 0xCE,
  I16X8_EXTMUL_HIGH_I8X16_U: 0xCF,
  I16X8_Q15MULR_SAT_S: 0xD0,
  
  I32X4_ABS: 0xD1,
  I32X4_NEG: 0xD2,
  I32X4_ALL_TRUE: 0xD3,
  I32X4_BITMASK: 0xD4,
  I32X4_EXTEND_LOW_I16X8_S: 0xD5,
  I32X4_EXTEND_HIGH_I16X8_S: 0xD6,
  I32X4_EXTEND_LOW_I16X8_U: 0xD7,
  I32X4_EXTEND_HIGH_I16X8_U: 0xD8,
  I32X4_SHL: 0xD9,
  I32X4_SHR_S: 0xDA,
  I32X4_SHR_U: 0xDB,
  I32X4_ADD: 0xAE,
  I32X4_SUB: 0xDD,
  I32X4_MUL: 0xDE,
  I32X4_MIN_S: 0xDF,
  I32X4_MIN_U: 0xE0,
  I32X4_MAX_S: 0xE1,
  I32X4_MAX_U: 0xE2,
  I32X4_DOT_I16X8_S: 0xE3,
  I32X4_EXTMUL_LOW_I16X8_S: 0xE4,
  I32X4_EXTMUL_HIGH_I16X8_S: 0xE5,
  I32X4_EXTMUL_LOW_I16X8_U: 0xE6,
  I32X4_EXTMUL_HIGH_I16X8_U: 0xE7,
  
  I64X2_ABS: 0xE8,
  I64X2_NEG: 0xE9,
  I64X2_ALL_TRUE: 0xEA,
  I64X2_BITMASK: 0xEB,
  I64X2_EXTEND_LOW_I32X4_S: 0xEC,
  I64X2_EXTEND_HIGH_I32X4_S: 0xED,
  I64X2_EXTEND_LOW_I32X4_U: 0xEE,
  I64X2_EXTEND_HIGH_I32X4_U: 0xEF,
  I64X2_SHL: 0xF0,
  I64X2_SHR_S: 0xF1,
  I64X2_SHR_U: 0xF2,
  I64X2_ADD: 0xF3,
  I64X2_SUB: 0xF4,
  I64X2_MUL: 0xF5,
  I64X2_EXTMUL_LOW_I32X4_S: 0xF6,
  I64X2_EXTMUL_HIGH_I32X4_S: 0xF7,
  I64X2_EXTMUL_LOW_I32X4_U: 0xF8,
  I64X2_EXTMUL_HIGH_I32X4_U: 0xF9,
  
  F32X4_ABS: 0xFA,
  F32X4_NEG: 0xFB,
  F32X4_SQRT: 0xFC,
  F32X4_ADD: 0xE4,
  F32X4_SUB: 0xFE,
  F32X4_MUL: 0xE6,
  F32X4_DIV: 0x100,
  F32X4_MIN: 0x101,
  F32X4_MAX: 0x102,
  F32X4_PMIN: 0x103,
  F32X4_PMAX: 0x104,
  
  F64X2_ABS: 0x105,
  F64X2_NEG: 0x106,
  F64X2_SQRT: 0x107,
  F64X2_ADD: 0x108,
  F64X2_SUB: 0x109,
  F64X2_MUL: 0x10A,
  F64X2_DIV: 0x10B,
  F64X2_MIN: 0x10C,
  F64X2_MAX: 0x10D,
  F64X2_PMIN: 0x10E,
  F64X2_PMAX: 0x10F,
  
  I32X4_TRUNC_SAT_F32X4_S: 0x110,
  I32X4_TRUNC_SAT_F32X4_U: 0x111,
  F32X4_CONVERT_I32X4_S: 0x112,
  F32X4_CONVERT_I32X4_U: 0x113,
  I32X4_TRUNC_SAT_F64X2_S_ZERO: 0x114,
  I32X4_TRUNC_SAT_F64X2_U_ZERO: 0x115,
  F64X2_CONVERT_LOW_I32X4_S: 0x116,
  F64X2_CONVERT_LOW_I32X4_U: 0x117,
};

/**
 * SIMD lane shapes
 */
const Shape = {
  I8X16: 0x00,
  I16X8: 0x01,
  I32X4: 0x02,
  I64X2: 0x03,
  F32X4: 0x04,
  F64X2: 0x05,
};

/**
 * Section IDs
 */
const Section = {
  CUSTOM: 0x00,
  TYPE: 0x01,
  IMPORT: 0x02,
  FUNCTION: 0x03,
  TABLE: 0x04,
  MEMORY: 0x05,
  GLOBAL: 0x06,
  EXPORT: 0x07,
  START: 0x08,
  ELEMENT: 0x09,
  CODE: 0x0A,
  DATA: 0x0B,
  DATA_COUNT: 0x0C,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * LEB128 encoding utilities for variable-length integers
 */
const LEB128 = {
  /**
   * Encode a signed 32-bit integer as LEB128
   * @param {number} value - The value to encode
   * @returns {number[]} Array of bytes
   */
  encodeI32(value) {
    const bytes = [];
    let more = true;
    while (more) {
      let byte = value & 0x7F;
      value >>= 7;
      if ((value === 0 && (byte & 0x40) === 0) || 
          (value === -1 && (byte & 0x40) !== 0)) {
        more = false;
      } else {
        byte |= 0x80;
      }
      bytes.push(byte);
    }
    return bytes;
  },

  /**
   * Encode an unsigned 32-bit integer as LEB128
   * @param {number} value - The value to encode
   * @returns {number[]} Array of bytes
   */
  encodeU32(value) {
    const bytes = [];
    do {
      let byte = value & 0x7F;
      value >>>= 7;
      if (value !== 0) {
        byte |= 0x80;
      }
      bytes.push(byte);
    } while (value !== 0);
    return bytes;
  },

  /**
   * Encode a signed 64-bit integer as LEB128
   * @param {bigint} value - The value to encode
   * @returns {number[]} Array of bytes
   */
  encodeI64(value) {
    const bytes = [];
    let more = true;
    while (more) {
      let byte = Number(value & 0x7Fn);
      value >>= 7n;
      if ((value === 0n && (byte & 0x40) === 0) || 
          (value === -1n && (byte & 0x40) !== 0)) {
        more = false;
      } else {
        byte |= 0x80;
      }
      bytes.push(byte);
    }
    return bytes;
  },

  /**
   * Encode an unsigned 64-bit integer as LEB128
   * @param {bigint} value - The value to encode
   * @returns {number[]} Array of bytes
   */
  encodeU64(value) {
    const bytes = [];
    do {
      let byte = Number(value & 0x7Fn);
      value >>= 7n;
      if (value !== 0n) {
        byte |= 0x80;
      }
      bytes.push(byte);
    } while (value !== 0n);
    return bytes;
  }
};

/**
 * Float encoding utilities
 */
const FloatEncoding = {
  /**
   * Encode a 32-bit float as 4 bytes
   * @param {number} value - The float value
   * @returns {number[]} Array of 4 bytes
   */
  encodeF32(value) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, true); // little-endian
    return [
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    ];
  },

  /**
   * Encode a 64-bit float as 8 bytes
   * @param {number} value - The float value
   * @returns {number[]} Array of 8 bytes
   */
  encodeF64(value) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true); // little-endian
    return [
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7)
    ];
  }
};

// ============================================================================
// TOKENIZER / LEXER
// ============================================================================

/**
 * Token types for the WAT lexer
 */
const TokenType = {
  // Keywords
  MODULE: 'module',
  FUNC: 'func',
  PARAM: 'param',
  RESULT: 'result',
  LOCAL: 'local',
  GLOBAL: 'global',
  TABLE: 'table',
  MEMORY: 'memory',
  ELEM: 'elem',
  DATA: 'data',
  TYPE: 'type',
  IMPORT: 'import',
  EXPORT: 'export',
  START: 'start',
  
  // Control flow
  BLOCK: 'block',
  LOOP: 'loop',
  IF: 'if',
  THEN: 'then',
  ELSE: 'else',
  END: 'end',
  BR: 'br',
  BR_IF: 'br_if',
  BR_TABLE: 'br_table',
  RETURN: 'return',
  CALL: 'call',
  CALL_INDIRECT: 'call_indirect',
  UNREACHABLE: 'unreachable',
  NOP: 'nop',
  DROP: 'drop',
  SELECT: 'select',
  LOCAL_GET: 'local.get',
  LOCAL_SET: 'local.set',
  LOCAL_TEE: 'local.tee',
  GLOBAL_GET: 'global.get',
  GLOBAL_SET: 'global.set',
  TABLE_GET: 'table.get',
  TABLE_SET: 'table.set',
  TABLE_INIT: 'table.init',
  ELEM_DROP: 'elem.drop',
  TABLE_COPY: 'table.copy',
  TABLE_GROW: 'table.grow',
  TABLE_SIZE: 'table.size',
  TABLE_FILL: 'table.fill',
  MEMORY_INIT: 'memory.init',
  MEMORY_COPY: 'memory.copy',
  MEMORY_FILL: 'memory.fill',
  DATA_DROP: 'data.drop',
  OFFSET: 'offset',
  ALIGN: 'align',
  MUT: 'mut',
  ITEM: 'item',
  
  // Value types
  I32: 'i32',
  I64: 'i64',
  F32: 'f32',
  F64: 'f64',
  V128: 'v128',
  FUNCREF: 'funcref',
  EXTERNREF: 'externref',
  
  // Numeric constants
  CONST: 'const',
  
  // Numeric operations
  ADD: 'add',
  SUB: 'sub',
  MUL: 'mul',
  DIV: 'div',
  DIV_S: 'div_s',
  DIV_U: 'div_u',
  REM_S: 'rem_s',
  REM_U: 'rem_u',
  AND: 'and',
  OR: 'or',
  XOR: 'xor',
  SHL: 'shl',
  SHR_S: 'shr_s',
  SHR_U: 'shr_u',
  ROTL: 'rotl',
  ROTR: 'rotr',
  CLZ: 'clz',
  CTZ: 'ctz',
  POPCNT: 'popcnt',
  EQZ: 'eqz',
  EQ: 'eq',
  NE: 'ne',
  LT_S: 'lt_s',
  LT_U: 'lt_u',
  GT_S: 'gt_s',
  GT_U: 'gt_u',
  LE_S: 'le_s',
  LE_U: 'le_u',
  GE_S: 'ge_s',
  GE_U: 'ge_u',
  ABS: 'abs',
  NEG: 'neg',
  CEIL: 'ceil',
  FLOOR: 'floor',
  TRUNC: 'trunc',
  NEAREST: 'nearest',
  SQRT: 'sqrt',
  MIN: 'min',
  MAX: 'max',
  COPYSIGN: 'copysign',
  
  // Memory operations
  LOAD: 'load',
  STORE: 'store',
  LOAD8_S: 'load8_s',
  LOAD8_U: 'load8_u',
  LOAD16_S: 'load16_s',
  LOAD16_U: 'load16_u',
  LOAD32_S: 'load32_s',
  LOAD32_U: 'load32_u',
  STORE8: 'store8',
  STORE16: 'store16',
  STORE32: 'store32',
  MEMORY_SIZE: 'memory.size',
  MEMORY_GROW: 'memory.grow',
  
  // SIMD
  V128_LOAD: 'v128.load',
  V128_STORE: 'v128.store',
  I8X16_SPLAT: 'i8x16.splat',
  I16X8_SPLAT: 'i16x8.splat',
  I32X4_SPLAT: 'i32x4.splat',
  I64X2_SPLAT: 'i64x2.splat',
  F32X4_SPLAT: 'f32x4.splat',
  F64X2_SPLAT: 'f64x2.splat',
  
  // Literals
  INTEGER: 'integer',
  FLOAT: 'float',
  STRING: 'string',
  IDENT: 'ident',
  
  // Punctuation
  LPAREN: '(',
  RPAREN: ')',
  LBRACE: '{',
  RBRACE: '}',
  LBRACKET: '[',
  RBRACKET: ']',
  EQUALS: '=',
  COMMA: ',',
  SEMICOLON: ';',
  COLON: ':',
  DOT: '.',
  
  // Special
  EOF: 'eof',
  ERROR: 'error'
};

/**
 * Token class representing a lexical token
 */
class Token {
  /**
   * @param {string} type - Token type
   * @param {string|number} value - Token value
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `Token(${this.type}, ${this.value}, ${this.line}:${this.column})`;
  }
}

/**
 * Lexer for WebAssembly text format
 */
class Lexer {
  /**
   * @param {string} input - Source text to tokenize
   */
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  /**
   * Check if at end of input
   */
  isEOF() {
    return this.pos >= this.input.length;
  }

  /**
   * Peek at current character without advancing
   */
  peek() {
    return this.isEOF() ? '\0' : this.input[this.pos];
  }

  /**
   * Advance one character and return it
   */
  advance() {
    const ch = this.peek();
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  /**
   * Skip whitespace characters
   */
  skipWhitespace() {
    while (!this.isEOF() && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  /**
   * Skip comments (both line and block comments)
   */
  skipComment() {
    if (this.peek() !== ';') return false;
    
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip first ;
    
    if (this.peek() === ';') {
      // Line comment (;;)
      this.advance(); // skip second ;
      while (!this.isEOF() && this.peek() !== '\n') {
        this.advance();
      }
      return true;
    } else if (this.peek() === '|') {
      // Block comment (;| ... |;)
      this.advance(); // skip |
      let depth = 1;
      
      while (!this.isEOF() && depth > 0) {
        if (this.peek() === ';' && this.input[this.pos + 1] === '|') {
          depth++;
          this.advance(); // skip ;
          this.advance(); // skip |
        } else if (this.peek() === '|' && this.input[this.pos + 1] === ';') {
          depth--;
          this.advance(); // skip |
          this.advance(); // skip ;
        } else {
          this.advance();
        }
      }
      
      if (depth > 0) {
        throw new Error(`Unterminated block comment at ${startLine}:${startCol}`);
      }
      return true;
    } else {
      // Not a comment, backtrack
      this.pos--;
      this.column--;
      return false;
    }
  }

  /**
   * Read a numeric literal (integer or float)
   */
  readNumber() {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    let isFloat = false;
    
    // Optional sign
    if (this.peek() === '+' || this.peek() === '-') {
      this.advance();
    }
    
    // Check for hexadecimal
    let isHex = false;
    if (this.peek() === '0' && 
        (this.input[this.pos + 1] === 'x' || this.input[this.pos + 1] === 'X')) {
      isHex = true;
      this.advance(); // skip 0
      this.advance(); // skip x
    }
    
    // Read digits
    let hasDigits = false;
    while (!this.isEOF()) {
      const ch = this.peek();
      if (isHex) {
        if (/[0-9A-Fa-f]/.test(ch)) {
          hasDigits = true;
          this.advance();
        } else if (ch === '.') {
          isFloat = true;
          this.advance();
        } else {
          break;
        }
      } else {
        if (/\d/.test(ch)) {
          hasDigits = true;
          this.advance();
        } else if (ch === '.') {
          isFloat = true;
          this.advance();
        } else {
          break;
        }
      }
    }
    
    if (!hasDigits) {
      throw new Error(`Invalid number at ${startLine}:${startCol}`);
    }
    
    // Check for exponent
    if (!this.isEOF() && (this.peek() === 'e' || this.peek() === 'E')) {
      isFloat = true;
      this.advance();
      
      // Optional sign after e
      if (this.peek() === '+' || this.peek() === '-') {
        this.advance();
      }
      
      // Read exponent digits
      while (!this.isEOF() && /\d/.test(this.peek())) {
        this.advance();
      }
    }
    
    const numStr = this.input.substring(start, this.pos);
    
    if (isFloat) {
      return new Token(TokenType.FLOAT, parseFloat(numStr), startLine, startCol);
    } else {
      // Parse integer (could be bigint for 64-bit)
      try {
        const value = isHex ? parseInt(numStr, 16) : parseInt(numStr, 10);
        return new Token(TokenType.INTEGER, value, startLine, startCol);
      } catch (e) {
        // Fall back to bigint for large values
        const value = isHex ? BigInt(numStr) : BigInt(numStr);
        return new Token(TokenType.INTEGER, value, startLine, startCol);
      }
    }
  }

  /**
   * Read a string literal
   */
  readString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip opening quote
    
    let value = '';
    let escaped = false;
    
    while (!this.isEOF()) {
      const ch = this.advance();
      
      if (escaped) {
        switch (ch) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case '\'': value += '\''; break;
          default:
            // Handle hexadecimal escape \xx
            if (/[0-9A-Fa-f]/.test(ch) && /[0-9A-Fa-f]/.test(this.peek())) {
              const hex = ch + this.advance();
              value += String.fromCharCode(parseInt(hex, 16));
            } else {
              value += ch;
            }
        }
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        return new Token(TokenType.STRING, value, startLine, startCol);
      } else {
        value += ch;
      }
    }
    
    throw new Error(`Unterminated string at ${startLine}:${startCol}`);
  }

  /**
   * Read an identifier or keyword
   */
  readIdent() {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    
    // First character: letter or underscore or $
    if (!/[a-zA-Z_$]/.test(this.peek())) {
      throw new Error(`Invalid identifier start at ${startLine}:${startCol}`);
    }
    this.advance();
    
    // Subsequent characters: letter, digit, underscore, $, ., -, +, *
    while (!this.isEOF()) {
      const ch = this.peek();
      // Allow letters, digits, underscore, dollar sign, dot, hyphen, plus, asterisk
      if (/[a-zA-Z0-9_$]/.test(ch) || ch === '.' || ch === '-' || ch === '+' || ch === '*' || ch === '\\') {
        this.advance();
      } else {
        break;
     }
    }
    
    const ident = this.input.substring(start, this.pos);
    
    // Check if it's a keyword
    const keywords = {
      'module': TokenType.MODULE,
      'func': TokenType.FUNC,
      'param': TokenType.PARAM,
      'result': TokenType.RESULT,
      'local': TokenType.LOCAL,
      'global': TokenType.GLOBAL,
      'table': TokenType.TABLE,
      'memory': TokenType.MEMORY,
      'elem': TokenType.ELEM,
      'data': TokenType.DATA,
      'type': TokenType.TYPE,
      'import': TokenType.IMPORT,
      'export': TokenType.EXPORT,
      'start': TokenType.START,
      'block': TokenType.BLOCK,
      'loop': TokenType.LOOP,
      'if': TokenType.IF,
      'then': TokenType.THEN,
      'else': TokenType.ELSE,
      'end': TokenType.END,
      'br': TokenType.BR,
      'br_if': TokenType.BR_IF,
      'br_table': TokenType.BR_TABLE,
      'return': TokenType.RETURN,
      'call': TokenType.CALL,
      'call_indirect': TokenType.CALL_INDIRECT,
      'unreachable': TokenType.UNREACHABLE,
      'nop': TokenType.NOP,
      'drop': TokenType.DROP,
      'select': TokenType.SELECT,
      'local.get': TokenType.LOCAL_GET,
      'local.set': TokenType.LOCAL_SET,
      'local.tee': TokenType.LOCAL_TEE,
      'global.get': TokenType.GLOBAL_GET,
      'global.set': TokenType.GLOBAL_SET,
      'table.get': TokenType.TABLE_GET,
      'table.set': TokenType.TABLE_SET,
      'table.init': TokenType.TABLE_INIT,
      'elem.drop': TokenType.ELEM_DROP,
      'table.copy': TokenType.TABLE_COPY,
      'table.grow': TokenType.TABLE_GROW,
      'table.size': TokenType.TABLE_SIZE,
      'table.fill': TokenType.TABLE_FILL,
      'memory.init': TokenType.MEMORY_INIT,
      'memory.copy': TokenType.MEMORY_COPY,
      'memory.fill': TokenType.MEMORY_FILL,
      'data.drop': TokenType.DATA_DROP,
      'offset': TokenType.OFFSET,
      'align': TokenType.ALIGN,
      'mut': TokenType.MUT,
      'item': TokenType.ITEM,
      'i32': TokenType.I32,
      'i64': TokenType.I64,
      'f32': TokenType.F32,
      'f64': TokenType.F64,
      'v128': TokenType.V128,
      'funcref': TokenType.FUNCREF,
      'externref': TokenType.EXTERNREF,
      'const': TokenType.CONST,
      'add': TokenType.ADD,
      'sub': TokenType.SUB,
      'mul': TokenType.MUL,
      'div': TokenType.DIV,
      'div_s': TokenType.DIV_S,
      'div_u': TokenType.DIV_U,
      'rem_s': TokenType.REM_S,
      'rem_u': TokenType.REM_U,
      'and': TokenType.AND,
      'or': TokenType.OR,
      'xor': TokenType.XOR,
      'shl': TokenType.SHL,
      'shr_s': TokenType.SHR_S,
      'shr_u': TokenType.SHR_U,
      'rotl': TokenType.ROTL,
      'rotr': TokenType.ROTR,
      'clz': TokenType.CLZ,
      'ctz': TokenType.CTZ,
      'popcnt': TokenType.POPCNT,
      'eqz': TokenType.EQZ,
      'eq': TokenType.EQ,
      'ne': TokenType.NE,
      'lt_s': TokenType.LT_S,
      'lt_u': TokenType.LT_U,
      'gt_s': TokenType.GT_S,
      'gt_u': TokenType.GT_U,
      'le_s': TokenType.LE_S,
      'le_u': TokenType.LE_U,
      'ge_s': TokenType.GE_S,
      'ge_u': TokenType.GE_U,
      'abs': TokenType.ABS,
      'neg': TokenType.NEG,
      'ceil': TokenType.CEIL,
      'floor': TokenType.FLOOR,
      'trunc': TokenType.TRUNC,
      'nearest': TokenType.NEAREST,
      'sqrt': TokenType.SQRT,
      'min': TokenType.MIN,
      'max': TokenType.MAX,
      'copysign': TokenType.COPYSIGN,
      'load': TokenType.LOAD,
      'store': TokenType.STORE,
      'load8_s': TokenType.LOAD8_S,
      'load8_u': TokenType.LOAD8_U,
      'load16_s': TokenType.LOAD16_S,
      'load16_u': TokenType.LOAD16_U,
      'load32_s': TokenType.LOAD32_S,
      'load32_u': TokenType.LOAD32_U,
      'store8': TokenType.STORE8,
      'store16': TokenType.STORE16,
      'store32': TokenType.STORE32,
      'memory.size': TokenType.MEMORY_SIZE,
      'memory.grow': TokenType.MEMORY_GROW,
      'v128.load': TokenType.V128_LOAD,
      'v128.store': TokenType.V128_STORE,
      'i8x16.splat': TokenType.I8X16_SPLAT,
      'i16x8.splat': TokenType.I16X8_SPLAT,
      'i32x4.splat': TokenType.I32X4_SPLAT,
      'i64x2.splat': TokenType.I64X2_SPLAT,
      'f32x4.splat': TokenType.F32X4_SPLAT,
      'f64x2.splat': TokenType.F64X2_SPLAT,
    };
    
    const type = keywords[ident] || TokenType.IDENT;
    return new Token(type, ident, startLine, startCol);
  }

  /**
   * Tokenize the entire input
   * @returns {Token[]} Array of tokens
   */
  tokenize() {
    while (!this.isEOF()) {
      this.skipWhitespace();
      
      if (this.isEOF()) break;
      
      const ch = this.peek();
      
      // Comments
      if (ch === ';' && (this.input[this.pos + 1] === ';' || 
                          this.input[this.pos + 1] === '|')) {
        this.skipComment();
        continue;
      }
      
      // Punctuation
      switch (ch) {
        case '(':
          this.tokens.push(new Token(TokenType.LPAREN, '(', this.line, this.column));
          this.advance();
          continue;
        case ')':
          this.tokens.push(new Token(TokenType.RPAREN, ')', this.line, this.column));
          this.advance();
          continue;
        case '{':
          this.tokens.push(new Token(TokenType.LBRACE, '{', this.line, this.column));
          this.advance();
          continue;
        case '}':
          this.tokens.push(new Token(TokenType.RBRACE, '}', this.line, this.column));
          this.advance();
          continue;
        case '[':
          this.tokens.push(new Token(TokenType.LBRACKET, '[', this.line, this.column));
          this.advance();
          continue;
        case ']':
          this.tokens.push(new Token(TokenType.RBRACKET, ']', this.line, this.column));
          this.advance();
          continue;
        case '=':
          this.tokens.push(new Token(TokenType.EQUALS, '=', this.line, this.column));
          this.advance();
          continue;
        case ',':
          this.tokens.push(new Token(TokenType.COMMA, ',', this.line, this.column));
          this.advance();
          continue;
        case ';':
          this.tokens.push(new Token(TokenType.SEMICOLON, ';', this.line, this.column));
          this.advance();
          continue;
        case ':':
          this.tokens.push(new Token(TokenType.COLON, ':', this.line, this.column));
          this.advance();
          continue;
        case '.':
          this.tokens.push(new Token(TokenType.DOT, '.', this.line, this.column));
          this.advance();
          continue;
      }
      
      // String literals
      if (ch === '"') {
        this.tokens.push(this.readString());
        continue;
      }
      
      // Numbers
      if (/[0-9]/.test(ch) || (ch === '+' || ch === '-') && 
          !this.isEOF() && /[0-9.]/.test(this.input[this.pos + 1])) {
        this.tokens.push(this.readNumber());
        continue;
      }
      
      // Identifiers and keywords
      if (/[a-zA-Z_$]/.test(ch)) {
        this.tokens.push(this.readIdent());
        continue;
      }
      
      // Unexpected character
      throw new Error(`Unexpected character '${ch}' at ${this.line}:${this.column}`);
    }
    
    this.tokens.push(new Token(TokenType.EOF, 'EOF', this.line, this.column));
    return this.tokens;
  }
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parser for WebAssembly text format
 */
class Parser {
  /**
   * @param {Token[]} tokens - Array of tokens from lexer
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  /**
   * Peek at current token
   */
  peek() {
    return this.tokens[this.pos];
  }

  /**
   * Check if current token is of expected type
   * @param {string} type - Expected token type
   */
  is(type) {
    return this.peek().type === type;
  }

  /**
   * Expect current token to be of given type and advance
   * @param {string} type - Expected token type
   * @returns {Token} The consumed token
   */
  expect(type) {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected ${type}, got ${token.type} at ${token.line}:${token.column}`);
    }
    this.pos++;
    return token;
  }

  /**
   * Consume current token if it matches type
   * @param {string} type - Expected token type
   * @returns {Token|null} The consumed token or null
   */
  maybe(type) {
    if (this.is(type)) {
      return this.expect(type);
    }
    return null;
  }

  /**
   * Parse the entire module
   * @returns {Object} AST root
   */
  parseModule() {
    this.expect(TokenType.LPAREN);
    this.expect(TokenType.MODULE);
    
    // Optional module name
    let name = null;
    if (this.is(TokenType.IDENT)) {
      name = this.expect(TokenType.IDENT).value;
    }
    
    const module = {
      type: 'module',
      name,
      types: [],
      imports: [],
      functions: [],
      tables: [],
      memories: [],
      globals: [],
      exports: [],
      start: null,
      elements: [],
      data: []
    };
    
    // Parse module fields
    while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
      if (this.is(TokenType.LPAREN)) {
        this.pos++;
        const field = this.parseModuleField();
        if (field) {
          switch (field.type) {
            case 'type': module.types.push(field); break;
            case 'import': module.imports.push(field); break;
            case 'func': module.functions.push(field); break;
            case 'table': module.tables.push(field); break;
            case 'memory': module.memories.push(field); break;
            case 'global': module.globals.push(field); break;
            case 'export': module.exports.push(field); break;
            case 'start': module.start = field; break;
            case 'elem': module.elements.push(field); break;
            case 'data': module.data.push(field); break;
          }
        }
      } else {
        throw new Error(`Unexpected token ${this.peek().type} at ${this.peek().line}:${this.peek().column}`);
      }
    }
    
    this.expect(TokenType.RPAREN);
    this.expect(TokenType.EOF);
    
    return module;
  }

  /**
   * Parse a module field
   */
  parseModuleField() {
    const token = this.peek();
    
    switch (token.type) {
      case TokenType.TYPE:
        return this.parseTypeDef();
      case TokenType.IMPORT:
        return this.parseImport();
      case TokenType.FUNC:
        return this.parseFunction();
      case TokenType.TABLE:
        return this.parseTable();
      case TokenType.MEMORY:
        return this.parseMemory();
      case TokenType.GLOBAL:
        return this.parseGlobal();
      case TokenType.EXPORT:
        return this.parseExport();
      case TokenType.START:
        return this.parseStart();
      case TokenType.ELEM:
        return this.parseElem();
      case TokenType.DATA:
        return this.parseData();
      default:
        throw new Error(`Unexpected module field ${token.type} at ${token.line}:${token.column}`);
    }
  }

  /**
   * Parse a type definition
   */
  parseTypeDef() {
    this.expect(TokenType.TYPE);
    
    // Optional type name
    let name = null;
    if (this.is(TokenType.IDENT)) {
      name = this.expect(TokenType.IDENT).value;
    }
    
    this.expect(TokenType.LPAREN);
    this.expect(TokenType.FUNC);
    
    const params = [];
    const results = [];
    
    while (!this.is(TokenType.RPAREN)) {
      if (this.is(TokenType.LPAREN)) {
        this.pos++;
        const token = this.peek();
        
        if (token.type === TokenType.PARAM) {
          this.pos++;
          // Parse parameters
          while (!this.is(TokenType.RPAREN)) {
            const paramType = this.parseValueType();
            params.push(paramType);
          }
          this.expect(TokenType.RPAREN);
        } else if (token.type === TokenType.RESULT) {
          this.pos++;
          // Parse results
          while (!this.is(TokenType.RPAREN)) {
            const resultType = this.parseValueType();
            results.push(resultType);
          }
          this.expect(TokenType.RPAREN);
        } else {
          throw new Error(`Expected PARAM or RESULT, got ${token.type} at ${token.line}:${token.column}`);
        }
      } else {
        throw new Error(`Expected (, got ${this.peek().type} at ${this.peek().line}:${this.peek().column}`);
      }
    }
    
    this.expect(TokenType.RPAREN); // close func
    this.expect(TokenType.RPAREN); // close type
    
    return {
      type: 'type',
      name,
      params,
      results
    };
  }

  /**
   * Parse an import
   */
  parseImport() {
    this.expect(TokenType.IMPORT);
    
    const module = this.expect(TokenType.STRING).value;
    const name = this.expect(TokenType.STRING).value;
    
    const wrappedDescriptor = this.is(TokenType.LPAREN);
    if (wrappedDescriptor) {
      this.expect(TokenType.LPAREN);
    }

    const descToken = this.peek();
    let desc;
    
    if (descToken.type === TokenType.FUNC) {
      this.pos++;
      let internalName = null;
      if (this.is(TokenType.IDENT)) {
        internalName = this.expect(TokenType.IDENT).value;
      }
      const typeName = this.parseTypeUse();
      desc = {
        kind: 'func',
        name: internalName,
        type: typeName
      };
    } else if (descToken.type === TokenType.TABLE) {
      this.pos++;
      let internalName = null;
      if (this.is(TokenType.IDENT)) {
        internalName = this.expect(TokenType.IDENT).value;
      }
      desc = { kind: 'table', name: internalName, ...this.parseTableType() };
    } else if (descToken.type === TokenType.MEMORY) {
      this.pos++;
      let internalName = null;
      if (this.is(TokenType.IDENT)) {
        internalName = this.expect(TokenType.IDENT).value;
      }
      desc = { kind: 'memory', name: internalName, ...this.parseMemoryType() };
    } else if (descToken.type === TokenType.GLOBAL) {
      this.pos++;
      let internalName = null;
      if (this.is(TokenType.IDENT)) {
        internalName = this.expect(TokenType.IDENT).value;
      }
      desc = { kind: 'global', name: internalName, ...this.parseGlobalType() };
    } else {
      throw new Error(`Expected import descriptor, got ${descToken.type} at ${descToken.line}:${descToken.column}`);
    }

    if (wrappedDescriptor) {
      this.expect(TokenType.RPAREN);
    }
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'import',
      module,
      name,
      desc
    };
  }

  /**
   * Parse a function
   */
  parseFunction() {
    this.expect(TokenType.FUNC);
    
    // Optional function name
    let name = null;
    if (this.is(TokenType.IDENT)) {
      name = this.expect(TokenType.IDENT).value;
    }
    
    // Optional export
    let exportName = null;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.EXPORT) {
      this.pos++; // skip (
      this.expect(TokenType.EXPORT);
      exportName = this.expect(TokenType.STRING).value;
      this.expect(TokenType.RPAREN);
    }
    
    // Type use (either inline or reference to type)
    const typeUse = this.parseTypeUse();
    
    const locals = [];
    const body = [];
    
    // Parse locals and instructions
    while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
      if (this.is(TokenType.LPAREN)) {
        this.pos++;
        if (this.is(TokenType.LOCAL)) {
          this.pos++;
          // Local declaration
          while (!this.is(TokenType.RPAREN)) {
            if (this.is(TokenType.IDENT)) {
              // Named local
              const localName = this.expect(TokenType.IDENT).value;
              const localType = this.parseValueType();
              locals.push({ name: localName, type: localType });
            } else {
              // Anonymous local
              const localType = this.parseValueType();
              locals.push({ name: null, type: localType });
            }
          }
          this.expect(TokenType.RPAREN);
        } else {
          // Instruction with nested block
          this.pos--; // backtrack
          const instr = this.parseInstruction();
          body.push(instr);
        }
      } else {
        // Simple instruction
        const instr = this.parseInstruction();
        body.push(instr);
      }
    }
    
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'func',
      name,
      exportName,
      typeUse,
      locals,
      body
    };
  }

  /**
   * Parse a table
   */
  parseTable() {
    this.expect(TokenType.TABLE);
    
    // Optional table name
    let name = null;
    if (this.is(TokenType.IDENT)) {
      name = this.expect(TokenType.IDENT).value;
    }
    
    // Optional export
    let exportName = null;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.EXPORT) {
      this.pos++; // skip (
      this.expect(TokenType.EXPORT);
      exportName = this.expect(TokenType.STRING).value;
      this.expect(TokenType.RPAREN);
    }
    
    const tableType = this.parseTableType();
    
    // Optional elements
    let elements = null;
    if (!this.is(TokenType.RPAREN)) {
      elements = [];
      while (!this.is(TokenType.RPAREN)) {
        if (this.is(TokenType.LPAREN)) {
          this.pos++;
          this.expect(TokenType.ITEM);
          elements.push(this.parseInstruction());
          this.expect(TokenType.RPAREN);
        } else {
          elements.push(this.parseInstruction());
        }
      }
    }
    
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'table',
      name,
      exportName,
      ...tableType,
      elements
    };
  }

  /**
   * Parse a memory
   */
  parseMemory() {
    this.expect(TokenType.MEMORY);
    
    // Optional memory name
    let name = null;
    if (this.is(TokenType.IDENT)) {
      name = this.expect(TokenType.IDENT).value;
    }
    
    // Optional export
    let exportName = null;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.EXPORT) {
      this.pos++; // skip (
      this.expect(TokenType.EXPORT);
      exportName = this.expect(TokenType.STRING).value;
      this.expect(TokenType.RPAREN);
    }
    
    const memoryType = this.parseMemoryType();
    
    // Optional data
    let data = null;
    if (!this.is(TokenType.RPAREN)) {
      data = this.expect(TokenType.STRING).value;
    }
    
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'memory',
      name,
      exportName,
      ...memoryType,
      data
    };
  }

  /**
   * Parse a global
   */
  parseGlobal() {
    this.expect(TokenType.GLOBAL);
    
    // Optional global name
    let name = null;
    if (this.is(TokenType.IDENT)) {
      name = this.expect(TokenType.IDENT).value;
    }
    
    // Optional export
    let exportName = null;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.EXPORT) {
      this.pos++; // skip (
      this.expect(TokenType.EXPORT);
      exportName = this.expect(TokenType.STRING).value;
      this.expect(TokenType.RPAREN);
    }
    
    const globalType = this.parseGlobalType();
    
    // Initial value expression
    const init = this.parseInstruction();
    
    this.expect(TokenType.RPAREN);
    
    return {
      ...globalType,
      type: 'global',
      name,
      exportName,
      init
    };
  }

  /**
   * Parse an export
   */
  parseExport() {
    this.expect(TokenType.EXPORT);
    
    const name = this.expect(TokenType.STRING).value;
    
    const descToken = this.peek();
    let desc;
    
    if (descToken.type === TokenType.LPAREN) {
      this.pos++;
      const kind = this.peek().type;
      this.pos++;
      const index = this.parseIndex();
      this.expect(TokenType.RPAREN);
      
      desc = {
        kind: kind === TokenType.FUNC ? 'func' :
              kind === TokenType.TABLE ? 'table' :
              kind === TokenType.MEMORY ? 'memory' :
              kind === TokenType.GLOBAL ? 'global' : 'unknown',
        index
      };
    } else {
      // Short form: (export "name" (func $name))
      throw new Error(`Expected ( after export at ${descToken.line}:${descToken.column}`);
    }

    this.expect(TokenType.RPAREN);
    
    return {
      type: 'export',
      name,
      desc
    };
  }

  /**
   * Parse a start function
   */
  parseStart() {
    this.expect(TokenType.START);
    
    const func = this.parseIndex();
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'start',
      func
    };
  }

  /**
   * Parse an element segment
   */
  parseElem() {
    this.expect(TokenType.ELEM);
    
    // Optional table name
    let table = null;
    if (this.is(TokenType.IDENT)) {
      table = this.expect(TokenType.IDENT).value;
    }
    
    // Optional offset expression
    let offset = null;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.OFFSET) {
      this.pos++; // skip (
      this.expect(TokenType.OFFSET);
      offset = this.parseInstruction();
      this.expect(TokenType.RPAREN);
    } else if (this.is(TokenType.LPAREN)) {
      offset = this.parseInstruction();
    } else if (!this.is(TokenType.RPAREN)) {
      offset = this.parseInstruction();
    }
    
    // Function indices or instructions
    const items = [];
    if (this.is(TokenType.FUNC)) {
      this.expect(TokenType.FUNC);
    }

    while (!this.is(TokenType.RPAREN)) {
      if (this.is(TokenType.LPAREN)) {
        this.pos++;
        if (this.is(TokenType.ITEM)) {
          this.pos++;
          items.push(this.parseInstruction());
          this.expect(TokenType.RPAREN);
        } else {
          // Function reference
          items.push(this.parseIndex());
          this.expect(TokenType.RPAREN);
        }
      } else {
        items.push(this.parseIndex());
      }
    }
    
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'elem',
      table,
      offset,
      items
    };
  }

  /**
   * Parse a data segment
   */
  parseData() {
    this.expect(TokenType.DATA);
    
    // Optional memory name
    let memory = null;
    if (this.is(TokenType.IDENT)) {
      memory = this.expect(TokenType.IDENT).value;
    }
    
    // Optional offset expression
    let offset = null;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.OFFSET) {
      this.pos++; // skip (
      this.expect(TokenType.OFFSET);
      offset = this.parseInstruction();
      this.expect(TokenType.RPAREN);
    } else if (this.is(TokenType.LPAREN)) {
      offset = this.parseInstruction();
    } else if (!this.is(TokenType.RPAREN)) {
      offset = this.parseInstruction();
    }
    
    // Data string
    const data = this.expect(TokenType.STRING).value;
    
    this.expect(TokenType.RPAREN);
    
    return {
      type: 'data',
      memory,
      offset,
      data
    };
  }

  /**
   * Parse a table type
   */
  parseTableType() {
    const limits = this.parseLimits();
    const elemType = this.parseRefType();
    
    return {
      limits,
      elemType
    };
  }

  /**
   * Parse a memory type
   */
  parseMemoryType() {
    const limits = this.parseLimits();
    
    return {
      limits
    };
  }

  /**
   * Parse a global type
   */
  parseGlobalType() {
    let mut = false;
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.MUT) {
      this.pos++; // skip (
      this.expect(TokenType.MUT);
      mut = true;
      const type = this.parseValueType();
      this.expect(TokenType.RPAREN);
      return {
        mut,
        valueType: type
      };
    }
    
    const type = this.parseValueType();
    
    return {
      mut,
      valueType: type
    };
  }

  /**
   * Parse limits (min, max)
   */
  parseLimits() {
    const min = parseInt(this.expect(TokenType.INTEGER).value, 10);
    
    let max = null;
    if (!this.is(TokenType.RPAREN) && !this.is(TokenType.IDENT) && 
        !this.is(TokenType.LPAREN) && !this.is(TokenType.FUNCREF) && 
        !this.is(TokenType.EXTERNREF)) {
      max = parseInt(this.expect(TokenType.INTEGER).value, 10);
    }
    
    return { min, max };
  }

  /**
   * Parse a type use (either inline or reference)
   */
  parseTypeUse() {
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.TYPE) {
      this.pos++; // skip (
      this.expect(TokenType.TYPE);
      const typeName = this.parseIndex();
      this.expect(TokenType.RPAREN);
      // Type use can be followed by inline param/result declarations
      const inline = this.parseTypeUse();
      if (inline.type === 'inline') {
        return {
          type: 'ref',
          name: typeName,
          params: inline.params,
          paramNames: inline.paramNames,
          results: inline.results
        };
      }
      return { type: 'ref', name: typeName, params: [], paramNames: [], results: [] };
    }
    
    // Inline type
    const params = [];
    const results = [];
    
    const paramNames = [];

    while (this.is(TokenType.LPAREN) &&
           (this.tokens[this.pos + 1].type === TokenType.PARAM ||
            this.tokens[this.pos + 1].type === TokenType.RESULT)) {
      this.pos++;
      const token = this.peek();

      if (token.type === TokenType.PARAM) {
        this.pos++;
        while (!this.is(TokenType.RPAREN)) {
          if (this.is(TokenType.IDENT)) {
            const maybeName = this.expect(TokenType.IDENT).value;
            if (this.is(TokenType.RPAREN)) {
              throw new Error(`Expected value type after parameter name ${maybeName}`);
            }
            const paramType = this.parseValueType();
            params.push(paramType);
            paramNames.push(maybeName);
          } else {
            const paramType = this.parseValueType();
            params.push(paramType);
            paramNames.push(null);
          }
        }
        this.expect(TokenType.RPAREN);
      } else if (token.type === TokenType.RESULT) {
        this.pos++;
        while (!this.is(TokenType.RPAREN)) {
          const resultType = this.parseValueType();
          results.push(resultType);
        }
        this.expect(TokenType.RPAREN);
      }
    }
    
    return {
      type: 'inline',
      params,
      paramNames,
      results
    };
  }

  /**
   * Parse an index (identifier or integer)
   */
  parseIndex() {
    if (this.is(TokenType.IDENT)) {
      return { type: 'name', value: this.expect(TokenType.IDENT).value };
    } else if (this.is(TokenType.INTEGER)) {
      return { type: 'index', value: parseInt(this.expect(TokenType.INTEGER).value, 10) };
    } else {
      throw new Error(`Expected index, got ${this.peek().type} at ${this.peek().line}:${this.peek().column}`);
    }
  }

  /**
   * Parse a value type
   */
  parseValueType() {
    const token = this.peek();
    let type;
    
    switch (token.type) {
      case TokenType.I32: type = ValueType.I32; break;
      case TokenType.I64: type = ValueType.I64; break;
      case TokenType.F32: type = ValueType.F32; break;
      case TokenType.F64: type = ValueType.F64; break;
      case TokenType.V128: type = ValueType.V128; break;
      case TokenType.FUNCREF: type = ValueType.FUNCREF; break;
      case TokenType.EXTERNREF: type = ValueType.EXTERNREF; break;
      default:
        throw new Error(`Expected value type, got ${token.type} at ${token.line}:${token.column}`);
    }
    
    this.pos++;
    return type;
  }

  /**
   * Parse a reference type
   */
  parseRefType() {
    const token = this.peek();
    let type;
    
    switch (token.type) {
      case TokenType.FUNCREF: type = ValueType.FUNCREF; break;
      case TokenType.EXTERNREF: type = ValueType.EXTERNREF; break;
      default:
        throw new Error(`Expected reference type, got ${token.type} at ${token.line}:${token.column}`);
    }
    
    this.pos++;
    return type;
  }

  /**
   * Parse a block type
   */
  parseBlockType() {
    if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.RESULT) {
      this.pos++; // skip (
      this.expect(TokenType.RESULT);
      const type = this.parseValueType();
      this.expect(TokenType.RPAREN);
      return [type];
    } else if (this.is(TokenType.I32) || this.is(TokenType.I64) || 
               this.is(TokenType.F32) || this.is(TokenType.F64) || 
               this.is(TokenType.V128)) {
      return [this.parseValueType()];
    } else {
      return [];
    }
  }

  /**
   * Parse a memory argument (offset, align)
   */
  parseMemArg() {
    let offset = 0;
    let align = null;
    
    while (!this.is(TokenType.RPAREN) && !this.is(TokenType.LPAREN) && 
           !this.is(TokenType.EOF)) {
      if (this.is(TokenType.OFFSET) || this.is(TokenType.IDENT) && this.peek().value === 'offset') {
        this.pos++;
        this.expect(TokenType.EQUALS);
        offset = parseInt(this.expect(TokenType.INTEGER).value, 10);
      } else if (this.is(TokenType.ALIGN) || this.is(TokenType.IDENT) && this.peek().value === 'align') {
        this.pos++;
        this.expect(TokenType.EQUALS);
        align = parseInt(this.expect(TokenType.INTEGER).value, 10);
      } else {
        // Plain number means offset
        offset = parseInt(this.expect(TokenType.INTEGER).value, 10);
      }
    }
    
    return { offset, align };
  }

  /**
   * Parse a lane index for SIMD instructions
   */
  parseLaneIndex() {
    return parseInt(this.expect(TokenType.INTEGER).value, 10);
  }

  /**
   * Parse SIMD shuffle immediates (16 lane indices)
   */
  parseShuffleImmediates() {
    const lanes = [];
    this.expect(TokenType.LPAREN);
    while (!this.is(TokenType.RPAREN)) {
      lanes.push(this.parseLaneIndex());
    }
    this.expect(TokenType.RPAREN);
    return lanes;
  }

  /**
   * Parse an instruction
   */
  parseInstruction() {
    const token = this.peek();
    let instr;
    
    // Handle nested blocks
    if (token.type === TokenType.LPAREN) {
      this.pos++;
      instr = this.parseInstruction();
      this.expect(TokenType.RPAREN);
      return instr;
    }
    
    // Control flow instructions
    switch (token.type) {
      case TokenType.BLOCK:
        this.pos++;
        let blockLabel = null;
        if (this.is(TokenType.IDENT)) {
          blockLabel = this.expect(TokenType.IDENT).value;
        }
        const blockType = this.parseBlockType();
        const blockInstrs = [];
        while (!this.is(TokenType.END) && !this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
          if (this.is(TokenType.LPAREN)) {
            this.pos++;
            blockInstrs.push(this.parseInstruction());
            this.expect(TokenType.RPAREN);
          } else {
            blockInstrs.push(this.parseInstruction());
          }
        }
        if (this.is(TokenType.END)) {
          this.expect(TokenType.END);
        }
        return { type: 'block', label: blockLabel, resultType: blockType, instrs: blockInstrs };
      
      case TokenType.LOOP:
        this.pos++;
        let loopLabel = null;
        if (this.is(TokenType.IDENT)) {
          loopLabel = this.expect(TokenType.IDENT).value;
        }
        const loopType = this.parseBlockType();
        const loopInstrs = [];
        while (!this.is(TokenType.END) && !this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
          if (this.is(TokenType.LPAREN)) {
            this.pos++;
            loopInstrs.push(this.parseInstruction());
            this.expect(TokenType.RPAREN);
          } else {
            loopInstrs.push(this.parseInstruction());
          }
        }
        if (this.is(TokenType.END)) {
          this.expect(TokenType.END);
        }
        return { type: 'loop', label: loopLabel, resultType: loopType, instrs: loopInstrs };
      
      case TokenType.IF:
        this.pos++;
        const ifType = this.parseBlockType();
        const condInstrs = [];
        const thenInstrs = [];
        const elseInstrs = [];
        let hasFoldedThen = false;
        let hasFoldedElse = false;
        
        // Then block
        while (!this.is(TokenType.ELSE) && !this.is(TokenType.END) && 
               !this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
          if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.THEN) {
            this.pos += 2; // skip ( then
            hasFoldedThen = true;
            while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
              if (this.is(TokenType.LPAREN)) {
                this.pos++;
                thenInstrs.push(this.parseInstruction());
                this.expect(TokenType.RPAREN);
              } else {
                thenInstrs.push(this.parseInstruction());
              }
            }
            this.expect(TokenType.RPAREN);
            continue;
          }

          if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.ELSE) {
            break;
          }

          if (this.is(TokenType.THEN)) {
            this.pos++;
            hasFoldedThen = true;
            continue;
          }

          if (this.is(TokenType.ELSE)) {
            break;
          }

          if (this.is(TokenType.LPAREN)) {
            this.pos++;
            condInstrs.push(this.parseInstruction());
            this.expect(TokenType.RPAREN);
          } else {
            condInstrs.push(this.parseInstruction());
          }
        }

        if (!hasFoldedThen) {
          thenInstrs.push(...condInstrs);
          condInstrs.length = 0;
        }
        
        // Else block
        if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.ELSE) {
          this.pos += 2; // skip ( else
          hasFoldedElse = true;
          while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
            if (this.is(TokenType.LPAREN)) {
              this.pos++;
              elseInstrs.push(this.parseInstruction());
              this.expect(TokenType.RPAREN);
            } else {
              elseInstrs.push(this.parseInstruction());
            }
          }
          this.expect(TokenType.RPAREN);
        } else if (this.is(TokenType.ELSE)) {
          this.pos++;
          while (!this.is(TokenType.END) && !this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
            if (this.is(TokenType.LPAREN)) {
              this.pos++;
              elseInstrs.push(this.parseInstruction());
              this.expect(TokenType.RPAREN);
            } else {
              elseInstrs.push(this.parseInstruction());
            }
          }
        }
        
        if (!hasFoldedThen && !hasFoldedElse) {
          this.expect(TokenType.END);
        }
        return { type: 'if', resultType: ifType, cond: condInstrs, then: thenInstrs, else: elseInstrs };
      
      case TokenType.BR:
        this.pos++;
        const label = this.parseIndex();
        return { type: 'br', label };
      
      case TokenType.BR_IF:
        this.pos++;
        const labelIf = this.parseIndex();
        return { type: 'br_if', label: labelIf };
      
      case TokenType.BR_TABLE:
        this.pos++;
        const labels = [];
        while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
          labels.push(this.parseIndex());
        }
        const defaultLabel = labels.pop();
        return { type: 'br_table', labels, default: defaultLabel };
      
      case TokenType.RETURN:
        this.pos++;
        return { type: 'return' };
      
      case TokenType.UNREACHABLE:
        this.pos++;
        return { type: 'unreachable' };
      
      case TokenType.NOP:
        this.pos++;
        return { type: 'nop' };
      
      case TokenType.DROP:
        this.pos++;
        return { type: 'drop' };
      
      case TokenType.SELECT:
        this.pos++;
        // Optional types for select_t
        const selectTypes = [];
        if (this.is(TokenType.LPAREN)) {
          this.pos++;
          this.expect(TokenType.RESULT);
          while (!this.is(TokenType.RPAREN)) {
            selectTypes.push(this.parseValueType());
          }
          this.expect(TokenType.RPAREN);
        }
        return { type: 'select', types: selectTypes.length > 0 ? selectTypes : null };
      
      case TokenType.CALL:
        this.pos++;
        const func = this.parseIndex();
        return { type: 'call', func };
      
      case TokenType.CALL_INDIRECT:
        this.pos++;
        let table = { type: 'index', value: 0 };
        let typeIndex;

        if (this.is(TokenType.LPAREN) && this.tokens[this.pos + 1].type === TokenType.TYPE) {
          this.pos++;
          this.expect(TokenType.TYPE);
          typeIndex = this.parseIndex();
          this.expect(TokenType.RPAREN);
          if (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
            table = this.parseIndex();
          }
        } else {
          table = this.parseIndex();
          typeIndex = this.parseIndex();
        }

        return { type: 'call_indirect', table, typeIndex };
      
      // Variable instructions
      case TokenType.LOCAL_GET:
      case TokenType.LOCAL_SET:
      case TokenType.LOCAL_TEE:
      case TokenType.GLOBAL_GET:
      case TokenType.GLOBAL_SET:
        const op = token.type;
        this.pos++;
        const index = this.parseIndex();
        return { type: op, index };
      
      // Table instructions
      case TokenType.TABLE_GET:
      case TokenType.TABLE_SET:
      case TokenType.TABLE_SIZE:
      case TokenType.TABLE_GROW:
      case TokenType.TABLE_FILL:
        const tableOp = token.type;
        this.pos++;
        const tableIndex = this.parseIndex();
        return { type: tableOp, table: tableIndex };
      
      case TokenType.TABLE_INIT:
        this.pos++;
        const elemSeg = this.parseIndex();
        const tableInit = this.parseIndex();
        return { type: 'table.init', elem: elemSeg, table: tableInit };
      
      case TokenType.TABLE_COPY:
        this.pos++;
        const destTable = this.parseIndex();
        const srcTable = this.parseIndex();
        return { type: 'table.copy', dest: destTable, src: srcTable };
      
      case TokenType.ELEM_DROP:
        this.pos++;
        const elem = this.parseIndex();
        return { type: 'elem.drop', elem };
      
      // Memory instructions
      case TokenType.MEMORY_SIZE:
        this.pos++;
        return { type: 'memory.size' };
      
      case TokenType.MEMORY_GROW:
        this.pos++;
        return { type: 'memory.grow' };
      
      case TokenType.MEMORY_INIT:
        this.pos++;
        const dataSeg = this.parseIndex();
        return { type: 'memory.init', data: dataSeg };
      
      case TokenType.MEMORY_COPY:
        this.pos++;
        return { type: 'memory.copy' };
      
      case TokenType.MEMORY_FILL:
        this.pos++;
        return { type: 'memory.fill' };
      
      case TokenType.DATA_DROP:
        this.pos++;
        const data = this.parseIndex();
        return { type: 'data.drop', data };
      
      // Load instructions
      case TokenType.LOAD:
      case TokenType.LOAD8_S:
      case TokenType.LOAD8_U:
      case TokenType.LOAD16_S:
      case TokenType.LOAD16_U:
      case TokenType.LOAD32_S:
      case TokenType.LOAD32_U:
      case TokenType.STORE:
      case TokenType.STORE8:
      case TokenType.STORE16:
      case TokenType.STORE32:
        const memOp = token.type;
        this.pos++;
        const memArg = this.parseMemArg();
        return { type: memOp, ...memArg };
      
      // Numeric constant instructions
      case TokenType.CONST:
        this.pos++;
        const valueType = this.parseValueType();
        let value;
        if (this.is(TokenType.FLOAT)) {
          value = this.expect(TokenType.FLOAT).value;
        } else {
          value = this.expect(TokenType.INTEGER).value;
        }
        return { type: 'const', valueType, value };
      
      // Numeric operations
      case TokenType.ADD:
      case TokenType.SUB:
      case TokenType.MUL:
      case TokenType.DIV:
      case TokenType.DIV_S:
      case TokenType.DIV_U:
      case TokenType.REM_S:
      case TokenType.REM_U:
      case TokenType.AND:
      case TokenType.OR:
      case TokenType.XOR:
      case TokenType.SHL:
      case TokenType.SHR_S:
      case TokenType.SHR_U:
      case TokenType.ROTL:
      case TokenType.ROTR:
      case TokenType.CLZ:
      case TokenType.CTZ:
      case TokenType.POPCNT:
      case TokenType.EQZ:
      case TokenType.EQ:
      case TokenType.NE:
      case TokenType.LT_S:
      case TokenType.LT_U:
      case TokenType.GT_S:
      case TokenType.GT_U:
      case TokenType.LE_S:
      case TokenType.LE_U:
      case TokenType.GE_S:
      case TokenType.GE_U:
      case TokenType.ABS:
      case TokenType.NEG:
      case TokenType.CEIL:
      case TokenType.FLOOR:
      case TokenType.TRUNC:
      case TokenType.NEAREST:
      case TokenType.SQRT:
      case TokenType.MIN:
      case TokenType.MAX:
      case TokenType.COPYSIGN:
        const opType = token.type;
        this.pos++;
        // Optional value type prefix for typed operators
        let valType = null;
        if (this.is(TokenType.I32) || this.is(TokenType.I64) || 
            this.is(TokenType.F32) || this.is(TokenType.F64)) {
          valType = this.parseValueType();
        }
        return { type: opType, valueType: valType };
      
      // SIMD instructions
      case TokenType.V128_LOAD:
        this.pos++;
        const v128LoadArg = this.parseMemArg();
        return { type: 'v128.load', ...v128LoadArg };
      
      case TokenType.V128_STORE:
        this.pos++;
        const v128StoreArg = this.parseMemArg();
        return { type: 'v128.store', ...v128StoreArg };
      
      case TokenType.I8X16_SPLAT:
      case TokenType.I16X8_SPLAT:
      case TokenType.I32X4_SPLAT:
      case TokenType.I64X2_SPLAT:
      case TokenType.F32X4_SPLAT:
      case TokenType.F64X2_SPLAT:
        const splatType = token.type;
        this.pos++;
        return { type: splatType };
      
      // Handle I32_CONST, I64_CONST, etc. that come from the tokenizer
      // These might be represented as separate tokens in some WAT formats
      
      default:
        // Try to parse as a typed operator (e.g., i32.add)
        const opStr = token.value;
        if (typeof opStr === 'string' && opStr.includes('.')) {
          // Explicit SIMD instructions used by test fixtures
          if (opStr === 'i8x16.add' || opStr === 'i8x16.sub' ||
              opStr === 'i16x8.mul' || opStr === 'i32x4.add' ||
              opStr === 'f32x4.add' || opStr === 'f32x4.mul') {
            this.pos++;
            return { type: opStr };
          }

          if (opStr === 'i32x4.extract_lane') {
            this.pos++;
            const lane = this.parseLaneIndex();
            return { type: opStr, lane };
          }

          if (opStr === 'i32x4.replace_lane') {
            this.pos++;
            const lane = this.parseLaneIndex();
            return { type: opStr, lane };
          }

          if (opStr === 'i8x16.shuffle') {
            this.pos++;
            const lanes = [];
            for (let i = 0; i < 16; i++) {
              lanes.push(this.parseLaneIndex());
            }
            return { type: opStr, lanes };
          }

          if (opStr === 'v128.const') {
            this.pos++;
            const laneType = this.expect(TokenType.IDENT).value;
            const lanes = [];
            if (laneType === 'i32x4') {
              for (let i = 0; i < 4; i++) {
                lanes.push(this.expect(TokenType.INTEGER).value);
              }
            } else {
              throw new Error(`Unsupported v128.const lane type ${laneType}`);
            }
            return { type: opStr, laneType, lanes };
          }

          const [type, op] = opStr.split('.');
          if (type && op) {
            let valueType;
            switch (type) {
              case 'i32': valueType = ValueType.I32; break;
              case 'i64': valueType = ValueType.I64; break;
              case 'f32': valueType = ValueType.F32; break;
              case 'f64': valueType = ValueType.F64; break;
              default: valueType = null;
            }
            
            if (valueType) {
              this.pos++;
              if (op === 'const') {
                let value;
                if (valueType === ValueType.F32 || valueType === ValueType.F64) {
                  if (this.is(TokenType.FLOAT)) {
                    value = this.expect(TokenType.FLOAT).value;
                  } else {
                    value = this.expect(TokenType.INTEGER).value;
                  }
                } else {
                  value = this.expect(TokenType.INTEGER).value;
                }
                return { type: 'const', valueType, value };
              } else {
                return { type: op, valueType };
              }
            }
          }
        }
        
        throw new Error(`Unknown instruction ${token.type} at ${token.line}:${token.column}`);
    }
  }
}

// ============================================================================
// SYMBOL RESOLVER
// ============================================================================

/**
 * Symbol resolver that maps identifiers to indices
 */
class SymbolResolver {
  constructor(ast) {
    this.ast = ast;
    this.typeMap = new Map();
    this.importFuncMap = new Map();
    this.importTableMap = new Map();
    this.importMemoryMap = new Map();
    this.importGlobalMap = new Map();
    this.funcMap = new Map();
    this.tableMap = new Map();
    this.memoryMap = new Map();
    this.globalMap = new Map();
    this.elemMap = new Map();
    this.dataMap = new Map();
    this.labelMap = new Map();
    
    this.funcCount = 0;
    this.tableCount = 0;
    this.memoryCount = 0;
    this.globalCount = 0;
    this.typeCount = 0;
    this.elemCount = 0;
    this.dataCount = 0;
    
    this.resolve();
  }

  /**
   * Resolve all symbols
   */
  resolve() {
    // First pass: collect all named definitions
    this.ast.types.forEach((type, i) => {
      if (type.name) {
        this.typeMap.set(type.name, i);
      }
      this.typeCount++;
    });
    
    this.ast.imports.forEach((imp, i) => {
      const importBindingName = imp.desc?.name || imp.name;
      switch (imp.desc.kind) {
        case 'func':
          this.importFuncMap.set(importBindingName, this.funcCount);
          this.funcCount++;
          break;
        case 'table':
          this.importTableMap.set(importBindingName, this.tableCount);
          this.tableCount++;
          break;
        case 'memory':
          this.importMemoryMap.set(importBindingName, this.memoryCount);
          this.memoryCount++;
          break;
        case 'global':
          this.importGlobalMap.set(importBindingName, this.globalCount);
          this.globalCount++;
          break;
      }
    });
    
    this.ast.functions.forEach((func, i) => {
      if (func.name) {
        this.funcMap.set(func.name, this.funcCount);
      }
      this.funcCount++;
    });
    
    this.ast.tables.forEach((table, i) => {
      if (table.name) {
        this.tableMap.set(table.name, this.tableCount);
      }
      this.tableCount++;
    });
    
    this.ast.memories.forEach((memory, i) => {
      if (memory.name) {
        this.memoryMap.set(memory.name, this.memoryCount);
      }
      this.memoryCount++;
    });
    
    this.ast.globals.forEach((global, i) => {
      if (global.name) {
        this.globalMap.set(global.name, this.globalCount);
      }
      this.globalCount++;
    });
    
    this.ast.elements.forEach((elem, i) => {
      if (elem.name) {
        this.elemMap.set(elem.name, i);
      }
      this.elemCount++;
    });
    
    this.ast.data.forEach((data, i) => {
      if (data.name) {
        this.dataMap.set(data.name, i);
      }
      this.dataCount++;
    });
  }

  /**
   * Resolve a type index
   */
  resolveType(idx) {
    if (idx.type === 'name') {
      const i = this.typeMap.get(idx.value);
      if (i === undefined) {
        throw new Error(`Unknown type ${idx.value}`);
      }
      return i;
    }
    return idx.value;
  }

  /**
   * Resolve a function index
   */
  resolveFunc(idx) {
    if (idx.type === 'name') {
      // Check imports first
      let i = this.importFuncMap.get(idx.value);
      if (i !== undefined) return i;
      
      i = this.funcMap.get(idx.value);
      if (i !== undefined) return i;
      
      throw new Error(`Unknown function ${idx.value}`);
    }
    return idx.value;
  }

  /**
   * Resolve a table index
   */
  resolveTable(idx) {
    if (idx.type === 'name') {
      // Check imports first
      let i = this.importTableMap.get(idx.value);
      if (i !== undefined) return i;
      
      i = this.tableMap.get(idx.value);
      if (i !== undefined) return i;
      
      throw new Error(`Unknown table ${idx.value}`);
    }
    return idx.value;
  }

  /**
   * Resolve a memory index
   */
  resolveMemory(idx) {
    if (idx.type === 'name') {
      // Check imports first
      let i = this.importMemoryMap.get(idx.value);
      if (i !== undefined) return i;
      
      i = this.memoryMap.get(idx.value);
      if (i !== undefined) return i;
      
      throw new Error(`Unknown memory ${idx.value}`);
    }
    return idx.value;
  }

  /**
   * Resolve a global index
   */
  resolveGlobal(idx) {
    if (idx.type === 'name') {
      // Check imports first
      let i = this.importGlobalMap.get(idx.value);
      if (i !== undefined) return i;
      
      i = this.globalMap.get(idx.value);
      if (i !== undefined) return i;
      
      throw new Error(`Unknown global ${idx.value}`);
    }
    return idx.value;
  }

  /**
   * Resolve an element segment index
   */
  resolveElem(idx) {
    if (idx.type === 'name') {
      const i = this.elemMap.get(idx.value);
      if (i === undefined) {
        throw new Error(`Unknown element segment ${idx.value}`);
      }
      return i;
    }
    return idx.value;
  }

  /**
   * Resolve a data segment index
   */
  resolveData(idx) {
    if (idx.type === 'name') {
      const i = this.dataMap.get(idx.value);
      if (i === undefined) {
        throw new Error(`Unknown data segment ${idx.value}`);
      }
      return i;
    }
    return idx.value;
  }

  /**
   * Resolve a label index (for branch instructions)
   */
  resolveLabel(idx, labelStack) {
    if (idx.type === 'name') {
      // Labels are resolved during code generation with a stack
      return idx;
    }
    return idx.value;
  }
}

// ============================================================================
// CODE GENERATOR
// ============================================================================

/**
 * WebAssembly binary code generator
 */
class CodeGenerator {
  constructor(resolver) {
    this.resolver = resolver;
    this.bytes = [];
    this.labelStack = [];
  }

  /**
   * Get the generated binary
   */
  getBytes() {
    return this.bytes;
  }

  /**
   * Write a single byte
   */
  writeByte(b) {
    this.bytes.push(b & 0xFF);
  }

  /**
   * Write an array of bytes
   */
  writeBytes(arr) {
    for (const b of arr) {
      this.writeByte(b);
    }
  }

  /**
   * Write a U32 LEB128 value
   */
  writeU32(value) {
    this.writeBytes(LEB128.encodeU32(value));
  }

  /**
   * Write an I32 LEB128 value
   */
  writeI32(value) {
    this.writeBytes(LEB128.encodeI32(value));
  }

  /**
   * Write a U64 LEB128 value
   */
  writeU64(value) {
    this.writeBytes(LEB128.encodeU64(BigInt(value)));
  }

  /**
   * Write an I64 LEB128 value
   */
  writeI64(value) {
    this.writeBytes(LEB128.encodeI64(BigInt(value)));
  }

  /**
   * Write a string (as UTF-8 bytes with length prefix)
   */
  writeString(str) {
    const utf8 = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) {
        utf8.push(c);
      } else if (c < 0x800) {
        utf8.push(0xC0 | (c >> 6));
        utf8.push(0x80 | (c & 0x3F));
      } else if (c < 0xD800 || c >= 0xE000) {
        utf8.push(0xE0 | (c >> 12));
        utf8.push(0x80 | ((c >> 6) & 0x3F));
        utf8.push(0x80 | (c & 0x3F));
      }
    }
    this.writeU32(utf8.length);
    this.writeBytes(utf8);
  }

  /**
   * Write a section header
   */
  writeSection(id, content) {
    this.writeByte(id);
    this.writeU32(content.length);
    this.writeBytes(content);
  }

  /**
   * Create a deterministic signature key for functypes
   */
  getTypeSignature(params, results) {
    return `${params.join(',')}->${results.join(',')}`;
  }

  /**
   * Register effective type list (declared + inline type uses)
   */
  prepareTypes(ast) {
    this.effectiveTypes = [];
    this.typeSignatureMap = new Map();

    const registerType = (params, results) => {
      const p = params || [];
      const r = results || [];
      const key = this.getTypeSignature(p, r);
      if (this.typeSignatureMap.has(key)) {
        return this.typeSignatureMap.get(key);
      }
      const idx = this.effectiveTypes.length;
      this.effectiveTypes.push({ params: p, results: r });
      this.typeSignatureMap.set(key, idx);
      return idx;
    };

    // Declared types first (stable indices for named type refs)
    for (const type of ast.types) {
      registerType(type.params, type.results);
    }

    // Imports with inline signatures
    for (const imp of ast.imports) {
      if (imp.desc.kind === 'func' && imp.desc.type && imp.desc.type.type === 'inline') {
        imp.desc.typeIndex = registerType(imp.desc.type.params, imp.desc.type.results);
      }
    }

    // Functions with inline signatures
    for (const func of ast.functions) {
      if (func.typeUse.type === 'inline') {
        func.typeUse.typeIndex = registerType(func.typeUse.params, func.typeUse.results);
      }
    }
  }

  /**
   * Generate the complete WASM binary
   */
  generate(ast) {
    this.prepareTypes(ast);

    // Preamble: \0asm magic number and version
    this.writeBytes([0x00, 0x61, 0x73, 0x6D]); // "\0asm"
    this.writeBytes([0x01, 0x00, 0x00, 0x00]); // version 1
    
    // Type section
    if (this.effectiveTypes.length > 0) {
      this.generateTypeSection(ast);
    }
    
    // Import section
    if (ast.imports.length > 0) {
      this.generateImportSection(ast);
    }
    
    // Function section (function type indices)
    if (ast.functions.length > 0) {
      this.generateFunctionSection(ast);
    }
    
    // Table section
    if (ast.tables.length > 0) {
      this.generateTableSection(ast);
    }
    
    // Memory section
    if (ast.memories.length > 0) {
      this.generateMemorySection(ast);
    }
    
    // Global section
    if (ast.globals.length > 0) {
      this.generateGlobalSection(ast);
    }
    
    // Export section
    if (ast.exports.length > 0) {
      this.generateExportSection(ast);
    }
    
    // Start section
    if (ast.start) {
      this.generateStartSection(ast);
    }
    
    // Element section
    if (ast.elements.length > 0) {
      this.generateElementSection(ast);
    }
    
    // Code section (function bodies)
    if (ast.functions.length > 0) {
      this.generateCodeSection(ast);
    }
    
    // Data section
    if (ast.data.length > 0) {
      this.generateDataSection(ast);
    }
    
    return this.getBytes();
  }

  /**
   * Generate type section
   */
  generateTypeSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(this.effectiveTypes.length);
    for (const type of this.effectiveTypes) {
      gen.writeByte(0x60); // functype
      
      // Parameters
      gen.writeU32(type.params.length);
      for (const param of type.params) {
        gen.writeByte(param);
      }
      
      // Results
      gen.writeU32(type.results.length);
      for (const result of type.results) {
        gen.writeByte(result);
      }
    }
    
    this.writeSection(Section.TYPE, gen.getBytes());
  }

  /**
   * Generate import section
   */
  generateImportSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.imports.length);
    for (const imp of ast.imports) {
      gen.writeString(imp.module);
      gen.writeString(imp.name);
      
      switch (imp.desc.kind) {
        case 'func':
          gen.writeByte(ExternalKind.FUNCTION);
          if (imp.desc.type.type === 'ref') {
            gen.writeU32(this.resolver.resolveType(imp.desc.type.name));
          } else {
            gen.writeU32(imp.desc.typeIndex);
          }
          break;
        case 'table':
          gen.writeByte(ExternalKind.TABLE);
          gen.writeByte(imp.desc.elemType);
          if (imp.desc.limits.max !== null) {
            gen.writeByte(0x01);
            gen.writeU32(imp.desc.limits.min);
            gen.writeU32(imp.desc.limits.max);
          } else {
            gen.writeByte(0x00);
            gen.writeU32(imp.desc.limits.min);
          }
          break;
        case 'memory':
          gen.writeByte(ExternalKind.MEMORY);
          if (imp.desc.limits.max !== null) {
            gen.writeByte(0x01);
            gen.writeU32(imp.desc.limits.min);
            gen.writeU32(imp.desc.limits.max);
          } else {
            gen.writeByte(0x00);
            gen.writeU32(imp.desc.limits.min);
          }
          break;
        case 'global':
          gen.writeByte(ExternalKind.GLOBAL);
          gen.writeByte(imp.desc.valueType);
          gen.writeByte(imp.desc.mut ? 0x01 : 0x00);
          break;
      }
    }
    
    this.writeSection(Section.IMPORT, gen.getBytes());
  }

  /**
   * Generate function section (type indices for functions)
   */
  generateFunctionSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.functions.length);
    for (const func of ast.functions) {
      if (func.typeUse.type === 'ref') {
        gen.writeU32(this.resolver.resolveType(func.typeUse.name));
      } else {
        gen.writeU32(func.typeUse.typeIndex);
      }
    }
    
    this.writeSection(Section.FUNCTION, gen.getBytes());
  }

  /**
   * Generate table section
   */
  generateTableSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.tables.length);
    for (const table of ast.tables) {
      gen.writeByte(table.elemType);
      if (table.limits.max !== null) {
        gen.writeByte(0x01);
        gen.writeU32(table.limits.min);
        gen.writeU32(table.limits.max);
      } else {
        gen.writeByte(0x00);
        gen.writeU32(table.limits.min);
      }
    }
    
    this.writeSection(Section.TABLE, gen.getBytes());
  }

  /**
   * Generate memory section
   */
  generateMemorySection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.memories.length);
    for (const memory of ast.memories) {
      if (memory.limits.max !== null) {
        gen.writeByte(0x01);
        gen.writeU32(memory.limits.min);
        gen.writeU32(memory.limits.max);
      } else {
        gen.writeByte(0x00);
        gen.writeU32(memory.limits.min);
      }
    }
    
    this.writeSection(Section.MEMORY, gen.getBytes());
  }

  /**
   * Generate global section
   */
  generateGlobalSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.globals.length);
    for (const global of ast.globals) {
      gen.writeByte(global.valueType);
      gen.writeByte(global.mut ? 0x01 : 0x00);
      this.generateInstruction(global.init, gen);
      gen.writeByte(Opcode.END);
    }
    
    this.writeSection(Section.GLOBAL, gen.getBytes());
  }

  /**
   * Generate export section
   */
  generateExportSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.exports.length);
    for (const exp of ast.exports) {
      gen.writeString(exp.name);
      
      let kind;
      let index;
      
      if (exp.desc.kind === 'func') {
        kind = ExternalKind.FUNCTION;
        index = this.resolver.resolveFunc(exp.desc.index);
      } else if (exp.desc.kind === 'table') {
        kind = ExternalKind.TABLE;
        index = this.resolver.resolveTable(exp.desc.index);
      } else if (exp.desc.kind === 'memory') {
        kind = ExternalKind.MEMORY;
        index = this.resolver.resolveMemory(exp.desc.index);
      } else {
        kind = ExternalKind.GLOBAL;
        index = this.resolver.resolveGlobal(exp.desc.index);
      }
      
      gen.writeByte(kind);
      gen.writeU32(index);
    }
    
    this.writeSection(Section.EXPORT, gen.getBytes());
  }

  /**
   * Generate start section
   */
  generateStartSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(this.resolver.resolveFunc(ast.start.func));
    
    this.writeSection(Section.START, gen.getBytes());
  }

  /**
   * Generate element section
   */
  generateElementSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.elements.length);
    for (const elem of ast.elements) {
      // Element segment flags
      const mode = elem.table ? 0x02 : 0x00;
      gen.writeU32(mode);
      
      if (mode === 0x02) {
        gen.writeU32(this.resolver.resolveTable({ type: 'name', value: elem.table }));
      }
      
      // Offset expression
      if (elem.offset) {
        this.generateInstruction(elem.offset, gen);
      } else {
        gen.writeByte(Opcode.I32_CONST);
        gen.writeI32(0);
      }
      gen.writeByte(Opcode.END);
      
      // Elements
      gen.writeU32(elem.items.length);
      for (const item of elem.items) {
        if (typeof item === 'object' && (item.type === 'name' || item.type === 'index')) {
          // Function index reference
          gen.writeU32(this.resolver.resolveFunc(item));
        } else if (typeof item === 'object' && item.type) {
          // Instruction (for externref)
          this.generateInstruction(item, gen);
          gen.writeByte(Opcode.END);
        } else {
          // Legacy/raw function index
          gen.writeU32(this.resolver.resolveFunc(item));
        }
      }
    }
    
    this.writeSection(Section.ELEMENT, gen.getBytes());
  }

  /**
   * Generate code section (function bodies)
   */
  generateCodeSection(ast) {
    const section = [];
    const bodies = [];
    
    for (const func of ast.functions) {
      const gen = new CodeGenerator(this.resolver);

      // Local index map (params first, then locals)
      const localMap = new Map();
      let localIndex = 0;

      for (const paramName of (func.typeUse.paramNames || [])) {
        if (paramName) {
          localMap.set(paramName, localIndex);
        }
        localIndex++;
      }

      for (const local of func.locals) {
        if (local.name) {
          localMap.set(local.name, localIndex);
        }
        localIndex++;
      }

      this.currentLocalMap = localMap;
      
      // Locals
      const locals = new Map();
      for (const local of func.locals) {
        const count = locals.get(local.type) || 0;
        locals.set(local.type, count + 1);
      }
      
      gen.writeU32(locals.size);
      for (const [type, count] of locals) {
        gen.writeU32(count);
        gen.writeByte(type);
      }
      
      // Function body
      for (const instr of func.body) {
        this.generateInstruction(instr, gen);
      }
      gen.writeByte(Opcode.END);

      this.currentLocalMap = null;
      
      bodies.push(gen.getBytes());
    }
    
    const gen = new CodeGenerator(this.resolver);
    gen.writeU32(bodies.length);
    for (const body of bodies) {
      gen.writeU32(body.length);
      gen.writeBytes(body);
    }
    
    this.writeSection(Section.CODE, gen.getBytes());
  }

  /**
   * Generate data section
   */
  generateDataSection(ast) {
    const section = [];
    const gen = new CodeGenerator(this.resolver);
    
    gen.writeU32(ast.data.length);
    for (const data of ast.data) {
      // Data segment flags
      const mode = data.memory ? 0x02 : 0x00;
      gen.writeU32(mode);
      
      if (mode === 0x02) {
        gen.writeU32(this.resolver.resolveMemory({ type: 'name', value: data.memory }));
      }
      
      // Offset expression
      if (data.offset) {
        this.generateInstruction(data.offset, gen);
      } else {
        gen.writeByte(Opcode.I32_CONST);
        gen.writeI32(0);
      }
      gen.writeByte(Opcode.END);
      
      // Data bytes
      const utf8 = [];
      for (let i = 0; i < data.data.length; i++) {
        utf8.push(data.data.charCodeAt(i) & 0xFF);
      }
      gen.writeU32(utf8.length);
      gen.writeBytes(utf8);
    }
    
    this.writeSection(Section.DATA, gen.getBytes());
  }

  /**
   * Generate a single instruction
   */
  generateInstruction(instr, gen) {
    if (!instr) return;
    
    switch (instr.type) {
      // Control flow
      case 'block':
        gen.writeByte(Opcode.BLOCK);
        this.generateBlockType(instr.resultType, gen);
        for (const i of instr.instrs) {
          this.generateInstruction(i, gen);
        }
        gen.writeByte(Opcode.END);
        break;
      
      case 'loop':
        gen.writeByte(Opcode.LOOP);
        this.generateBlockType(instr.resultType, gen);
        for (const i of instr.instrs) {
          this.generateInstruction(i, gen);
        }
        gen.writeByte(Opcode.END);
        break;
      
      case 'if':
        for (const i of (instr.cond || [])) {
          this.generateInstruction(i, gen);
        }
        gen.writeByte(Opcode.IF);
        this.generateBlockType(instr.resultType, gen);
        for (const i of instr.then) {
          this.generateInstruction(i, gen);
        }
        if (instr.else && instr.else.length > 0) {
          gen.writeByte(Opcode.ELSE);
          for (const i of instr.else) {
            this.generateInstruction(i, gen);
          }
        }
        gen.writeByte(Opcode.END);
        break;
      
      case 'br':
        gen.writeByte(Opcode.BR);
        this.generateLabelIndex(instr.label, gen);
        break;
      
      case 'br_if':
        gen.writeByte(Opcode.BR_IF);
        this.generateLabelIndex(instr.label, gen);
        break;
      
      case 'br_table':
        gen.writeByte(Opcode.BR_TABLE);
        gen.writeU32(instr.labels.length);
        for (const label of instr.labels) {
          this.generateLabelIndex(label, gen);
        }
        this.generateLabelIndex(instr.default, gen);
        break;
      
      case 'return':
        gen.writeByte(Opcode.RETURN);
        break;
      
      case 'unreachable':
        gen.writeByte(Opcode.UNREACHABLE);
        break;
      
      case 'nop':
        gen.writeByte(Opcode.NOP);
        break;
      
      case 'drop':
        gen.writeByte(Opcode.DROP);
        break;
      
      case 'select':
        gen.writeByte(Opcode.SELECT);
        if (instr.types) {
          gen.writeByte(0x1C); // select_t
          gen.writeU32(instr.types.length);
          for (const t of instr.types) {
            gen.writeByte(t);
          }
        }
        break;
      
      // Calls
      case 'call':
        gen.writeByte(Opcode.CALL);
        gen.writeU32(this.resolver.resolveFunc(instr.func));
        break;
      
      case 'call_indirect':
        gen.writeByte(Opcode.CALL_INDIRECT);
        gen.writeU32(this.resolver.resolveType(instr.typeIndex));
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      // Variable instructions
      case TokenType.LOCAL_GET:
        gen.writeByte(Opcode.LOCAL_GET);
        this.generateLocalIndex(instr.index, gen);
        break;
      
      case TokenType.LOCAL_SET:
        gen.writeByte(Opcode.LOCAL_SET);
        this.generateLocalIndex(instr.index, gen);
        break;
      
      case TokenType.LOCAL_TEE:
        gen.writeByte(Opcode.LOCAL_TEE);
        this.generateLocalIndex(instr.index, gen);
        break;
      
      case TokenType.GLOBAL_GET:
        gen.writeByte(Opcode.GLOBAL_GET);
        gen.writeU32(this.resolver.resolveGlobal(instr.index));
        break;
      
      case TokenType.GLOBAL_SET:
        gen.writeByte(Opcode.GLOBAL_SET);
        gen.writeU32(this.resolver.resolveGlobal(instr.index));
        break;
      
      // Table instructions
      case TokenType.TABLE_GET:
        gen.writeByte(Opcode.TABLE_GET);
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      case TokenType.TABLE_SET:
        gen.writeByte(Opcode.TABLE_SET);
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      case TokenType.TABLE_SIZE:
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.TABLE_SIZE);
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      case TokenType.TABLE_GROW:
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.TABLE_GROW);
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      case TokenType.TABLE_FILL:
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.TABLE_FILL);
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      case 'table.init':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.TABLE_INIT);
        gen.writeU32(this.resolver.resolveElem(instr.elem));
        gen.writeU32(this.resolver.resolveTable(instr.table));
        break;
      
      case 'table.copy':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.TABLE_COPY);
        gen.writeU32(this.resolver.resolveTable(instr.dest));
        gen.writeU32(this.resolver.resolveTable(instr.src));
        break;
      
      case 'elem.drop':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.ELEM_DROP);
        gen.writeU32(this.resolver.resolveElem(instr.elem));
        break;
      
      // Memory instructions
      case TokenType.MEMORY_SIZE:
        gen.writeByte(Opcode.MEMORY_SIZE);
        gen.writeByte(0x00); // reserved
        break;
      
      case TokenType.MEMORY_GROW:
        gen.writeByte(Opcode.MEMORY_GROW);
        gen.writeByte(0x00); // reserved
        break;
      
      case 'memory.init':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.MEMORY_INIT);
        gen.writeU32(this.resolver.resolveData(instr.data));
        gen.writeByte(0x00); // reserved
        break;
      
      case 'memory.copy':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.MEMORY_COPY);
        gen.writeByte(0x00); // reserved
        gen.writeByte(0x00); // reserved
        break;
      
      case 'memory.fill':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.MEMORY_FILL);
        gen.writeByte(0x00); // reserved
        break;
      
      case 'data.drop':
        gen.writeByte(Opcode.PREFIX_FC);
        gen.writeU32(OpcodeFC.DATA_DROP);
        gen.writeU32(this.resolver.resolveData(instr.data));
        break;
      
      // Load instructions
      case TokenType.LOAD:
        this.generateLoadStore(instr, Opcode.I32_LOAD, gen);
        break;
      
      case TokenType.LOAD8_S:
        this.generateLoadStore(instr, Opcode.I32_LOAD8_S, gen);
        break;
      
      case TokenType.LOAD8_U:
        this.generateLoadStore(instr, Opcode.I32_LOAD8_U, gen);
        break;
      
      case TokenType.LOAD16_S:
        this.generateLoadStore(instr, Opcode.I32_LOAD16_S, gen);
        break;
      
      case TokenType.LOAD16_U:
        this.generateLoadStore(instr, Opcode.I32_LOAD16_U, gen);
        break;
      
      case TokenType.LOAD32_S:
        this.generateLoadStore(instr, Opcode.I64_LOAD32_S, gen);
        break;
      
      case TokenType.LOAD32_U:
        this.generateLoadStore(instr, Opcode.I64_LOAD32_U, gen);
        break;
      
      case TokenType.STORE:
        this.generateLoadStore(instr, Opcode.I32_STORE, gen);
        break;
      
      case TokenType.STORE8:
        this.generateLoadStore(instr, Opcode.I32_STORE8, gen);
        break;
      
      case TokenType.STORE16:
        this.generateLoadStore(instr, Opcode.I32_STORE16, gen);
        break;
      
      case TokenType.STORE32:
        this.generateLoadStore(instr, Opcode.I64_STORE32, gen);
        break;
      
      // Constants
      case 'const':
        if (instr.valueType === ValueType.I32) {
          gen.writeByte(Opcode.I32_CONST);
          gen.writeI32(instr.value);
        } else if (instr.valueType === ValueType.I64) {
          gen.writeByte(Opcode.I64_CONST);
          gen.writeI64(instr.value);
        } else if (instr.valueType === ValueType.F32) {
          gen.writeByte(Opcode.F32_CONST);
          gen.writeBytes(FloatEncoding.encodeF32(instr.value));
        } else if (instr.valueType === ValueType.F64) {
          gen.writeByte(Opcode.F64_CONST);
          gen.writeBytes(FloatEncoding.encodeF64(instr.value));
        }
        break;
      
      // Numeric operations
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
      case 'div_s':
      case 'div_u':
      case 'rem_s':
      case 'rem_u':
      case 'and':
      case 'or':
      case 'xor':
      case 'shl':
      case 'shr_s':
      case 'shr_u':
      case 'rotl':
      case 'rotr':
      case 'clz':
      case 'ctz':
      case 'popcnt':
      case 'eqz':
      case 'eq':
      case 'ne':
      case 'lt_s':
      case 'lt_u':
      case 'gt_s':
      case 'gt_u':
      case 'le_s':
      case 'le_u':
      case 'ge_s':
      case 'ge_u':
      case 'abs':
      case 'neg':
      case 'ceil':
      case 'floor':
      case 'trunc':
      case 'nearest':
      case 'sqrt':
      case 'min':
      case 'max':
      case 'copysign':
        this.generateNumericOp(instr, gen);
        break;
      
      // SIMD
      case 'v128.load':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.V128_LOAD);
        this.generateMemArg(instr, gen);
        break;
      
      case 'v128.store':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.V128_STORE);
        this.generateMemArg(instr, gen);
        break;
      
      case TokenType.I8X16_SPLAT:
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I8X16_SPLAT);
        break;
      
      case TokenType.I16X8_SPLAT:
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I16X8_SPLAT);
        break;
      
      case TokenType.I32X4_SPLAT:
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I32X4_SPLAT);
        break;
      
      case TokenType.I64X2_SPLAT:
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I64X2_SPLAT);
        break;
      
      case TokenType.F32X4_SPLAT:
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.F32X4_SPLAT);
        break;
      
      case TokenType.F64X2_SPLAT:
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.F64X2_SPLAT);
        break;

      case 'i8x16.add':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I8X16_ADD);
        break;

      case 'i8x16.sub':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I8X16_SUB);
        break;

      case 'i16x8.mul':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I16X8_MUL);
        break;

      case 'i32x4.add':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I32X4_ADD);
        break;

      case 'f32x4.add':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.F32X4_ADD);
        break;

      case 'f32x4.mul':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.F32X4_MUL);
        break;

      case 'i32x4.extract_lane':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I32X4_EXTRACT_LANE);
        gen.writeByte(instr.lane & 0xFF);
        break;

      case 'i32x4.replace_lane':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I32X4_REPLACE_LANE);
        gen.writeByte(instr.lane & 0xFF);
        break;

      case 'i8x16.shuffle':
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.I8X16_SHUFFLE);
        for (const lane of instr.lanes) {
          gen.writeByte(lane & 0xFF);
        }
        break;

      case 'v128.const': {
        gen.writeByte(Opcode.PREFIX_FD);
        gen.writeU32(OpcodeFC.V128_CONST);

        const bytes = new Uint8Array(16);
        const view = new DataView(bytes.buffer);

        if (instr.laneType === 'i32x4') {
          for (let i = 0; i < 4; i++) {
            view.setInt32(i * 4, Number(instr.lanes[i] || 0), true);
          }
        }

        gen.writeBytes(Array.from(bytes));
        break;
      }
      
      default:
        throw new Error(`Unknown instruction type: ${instr.type}`);
    }
  }

  /**
   * Generate a block type
   */
  generateBlockType(types, gen) {
    if (types.length === 0) {
      gen.writeByte(0x40); // empty block type
    } else if (types.length === 1) {
      gen.writeByte(types[0]);
    } else {
      // Multi-value block type (would require a type index)
      // For simplicity, we assume single-value or empty
      gen.writeByte(0x40);
    }
  }

  /**
   * Generate a label index
   */
  generateLabelIndex(label, gen) {
    if (label.type === 'name') {
      // Labels are resolved during parsing with a stack
      // For now, we treat them as relative depth
      // In a full implementation, we'd need to track label depths
      gen.writeU32(0);
    } else {
      gen.writeU32(label.value);
    }
  }

  /**
   * Generate a local index
   */
  generateLocalIndex(idx, gen) {
    if (idx.type === 'name') {
      const localIdx = this.currentLocalMap?.get(idx.value);
      if (localIdx === undefined) {
        throw new Error(`Unknown local ${idx.value}`);
      }
      gen.writeU32(localIdx);
    } else {
      gen.writeU32(idx.value);
    }
  }

  /**
   * Generate a memory argument (offset and align)
   */
  generateMemArg(instr, gen) {
    const align = instr.align !== null ? Math.log2(instr.align) : 0;
    gen.writeU32(align);
    gen.writeU32(instr.offset);
  }

  /**
   * Generate a load/store instruction
   */
  generateLoadStore(instr, opcode, gen) {
    gen.writeByte(opcode);
    this.generateMemArg(instr, gen);
  }

  /**
   * Generate a numeric operation
   */
  generateNumericOp(instr, gen) {
    const type = instr.valueType || ValueType.I32;
    
    // Map operation to opcode based on type
    const opMap = {
      [ValueType.I32]: {
        'add': Opcode.I32_ADD,
        'sub': Opcode.I32_SUB,
        'mul': Opcode.I32_MUL,
        'div_s': Opcode.I32_DIV_S,
        'div_u': Opcode.I32_DIV_U,
        'rem_s': Opcode.I32_REM_S,
        'rem_u': Opcode.I32_REM_U,
        'and': Opcode.I32_AND,
        'or': Opcode.I32_OR,
        'xor': Opcode.I32_XOR,
        'shl': Opcode.I32_SHL,
        'shr_s': Opcode.I32_SHR_S,
        'shr_u': Opcode.I32_SHR_U,
        'rotl': Opcode.I32_ROTL,
        'rotr': Opcode.I32_ROTR,
        'clz': Opcode.I32_CLZ,
        'ctz': Opcode.I32_CTZ,
        'popcnt': Opcode.I32_POPCNT,
        'eqz': Opcode.I32_EQZ,
        'eq': Opcode.I32_EQ,
        'ne': Opcode.I32_NE,
        'lt_s': Opcode.I32_LT_S,
        'lt_u': Opcode.I32_LT_U,
        'gt_s': Opcode.I32_GT_S,
        'gt_u': Opcode.I32_GT_U,
        'le_s': Opcode.I32_LE_S,
        'le_u': Opcode.I32_LE_U,
        'ge_s': Opcode.I32_GE_S,
        'ge_u': Opcode.I32_GE_U,
      },
      [ValueType.I64]: {
        'add': Opcode.I64_ADD,
        'sub': Opcode.I64_SUB,
        'mul': Opcode.I64_MUL,
        'div_s': Opcode.I64_DIV_S,
        'div_u': Opcode.I64_DIV_U,
        'rem_s': Opcode.I64_REM_S,
        'rem_u': Opcode.I64_REM_U,
        'and': Opcode.I64_AND,
        'or': Opcode.I64_OR,
        'xor': Opcode.I64_XOR,
        'shl': Opcode.I64_SHL,
        'shr_s': Opcode.I64_SHR_S,
        'shr_u': Opcode.I64_SHR_U,
        'rotl': Opcode.I64_ROTL,
        'rotr': Opcode.I64_ROTR,
        'clz': Opcode.I64_CLZ,
        'ctz': Opcode.I64_CTZ,
        'popcnt': Opcode.I64_POPCNT,
        'eqz': Opcode.I64_EQZ,
        'eq': Opcode.I64_EQ,
        'ne': Opcode.I64_NE,
        'lt_s': Opcode.I64_LT_S,
        'lt_u': Opcode.I64_LT_U,
        'gt_s': Opcode.I64_GT_S,
        'gt_u': Opcode.I64_GT_U,
        'le_s': Opcode.I64_LE_S,
        'le_u': Opcode.I64_LE_U,
        'ge_s': Opcode.I64_GE_S,
        'ge_u': Opcode.I64_GE_U,
      },
      [ValueType.F32]: {
        'add': Opcode.F32_ADD,
        'sub': Opcode.F32_SUB,
        'mul': Opcode.F32_MUL,
        'div': Opcode.F32_DIV,
        'min': Opcode.F32_MIN,
        'max': Opcode.F32_MAX,
        'copysign': Opcode.F32_COPYSIGN,
        'abs': Opcode.F32_ABS,
        'neg': Opcode.F32_NEG,
        'ceil': Opcode.F32_CEIL,
        'floor': Opcode.F32_FLOOR,
        'trunc': Opcode.F32_TRUNC,
        'nearest': Opcode.F32_NEAREST,
        'sqrt': Opcode.F32_SQRT,
        'eq': Opcode.F32_EQ,
        'ne': Opcode.F32_NE,
        'lt': Opcode.F32_LT,
        'gt': Opcode.F32_GT,
        'le': Opcode.F32_LE,
        'ge': Opcode.F32_GE,
      },
      [ValueType.F64]: {
        'add': Opcode.F64_ADD,
        'sub': Opcode.F64_SUB,
        'mul': Opcode.F64_MUL,
        'div': Opcode.F64_DIV,
        'min': Opcode.F64_MIN,
        'max': Opcode.F64_MAX,
        'copysign': Opcode.F64_COPYSIGN,
        'abs': Opcode.F64_ABS,
        'neg': Opcode.F64_NEG,
        'ceil': Opcode.F64_CEIL,
        'floor': Opcode.F64_FLOOR,
        'trunc': Opcode.F64_TRUNC,
        'nearest': Opcode.F64_NEAREST,
        'sqrt': Opcode.F64_SQRT,
        'eq': Opcode.F64_EQ,
        'ne': Opcode.F64_NE,
        'lt': Opcode.F64_LT,
        'gt': Opcode.F64_GT,
        'le': Opcode.F64_LE,
        'ge': Opcode.F64_GE,
      },
    };
    
    const opcode = opMap[type]?.[instr.type];
    if (opcode === undefined) {
      throw new Error(`Unknown numeric operation: ${instr.type} for type ${type}`);
    }
    
    gen.writeByte(opcode);
  }
}

// ============================================================================
// MAIN ASSEMBLER
// ============================================================================

/**
 * WebAssembly Text Format Assembler
 */
class WatAssembler {
  /**
   * Assemble WAT source to WASM binary
   * @param {string} source - WAT source code
   * @returns {Uint8Array} WASM binary
   */
  assemble(source) {
    try {
      // Tokenize
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      
      // Parse
      const parser = new Parser(tokens);
      const ast = parser.parseModule();
      
      // Resolve symbols
      const resolver = new SymbolResolver(ast);
      
      // Generate code
      const generator = new CodeGenerator(resolver);
      const bytes = generator.generate(ast);
      
      return new Uint8Array(bytes);
    } catch (error) {
      throw new Error(`Assembly failed: ${error.message}`);
    }
  }
}

// ============================================================================
// COMMAND-LINE INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  function showHelp() {
    console.log(`
WebAssembly Text Format Assembler
==================================

Usage: node wat-assembler.js [options] <input.wat> [output.wasm]

Options:
  -o, --output <file>   Output file (default: input name with .wasm extension)
  -h, --help           Show this help message
  -v, --version        Show version information

Examples:
  node wat-assembler.js program.wat
  node wat-assembler.js program.wat -o program.wasm
  node wat-assembler.js --output program.wasm program.wat
    `);
  }
  
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('-v') || args.includes('--version')) {
    console.log('wat-assembler v1.0.0');
    process.exit(0);
  }
  
  let inputFile = null;
  let outputFile = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      outputFile = args[++i];
    } else if (!args[i].startsWith('-')) {
      inputFile = args[i];
    }
  }
  
  if (!inputFile) {
    console.error('Error: No input file specified');
    process.exit(1);
  }
  
  // Read input file
  let source;
  try {
    source = fs.readFileSync(inputFile, 'utf8');
  } catch (err) {
    console.error(`Error reading input file: ${err.message}`);
    process.exit(1);
  }
  
  // Assemble
  const assembler = new WatAssembler();
  try {
    const wasm = assembler.assemble(source);
    
    // Determine output file
    if (!outputFile) {
      outputFile = path.basename(inputFile, path.extname(inputFile)) + '.wasm';
    }
    
    // Write output
    fs.writeFileSync(outputFile, Buffer.from(wasm));
    console.log(`Successfully wrote WASM to ${outputFile}`);
  } catch (err) {
    console.error(`Assembly failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { WatAssembler, Lexer, Parser, CodeGenerator, SymbolResolver };