(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MaiaWasmVM = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";
  const __modules = Object.create(null);
  const __cache = Object.create(null);
  function __require(id) {
    if (__cache[id]) return __cache[id].exports;
    if (!__modules[id]) throw new Error("Module not found in bundle: " + id);
    const mod = { exports: {} };
    __cache[id] = mod;
    __modules[id](mod, mod.exports, __require);
    return mod.exports;
  }
  __modules["./wasm-strings.js"] = function (module, exports, require) {
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const utf8Encoder = new TextEncoder();

function toByteBuffer(bytes) {
  return typeof Buffer !== 'undefined' ? Buffer.from(bytes) : Uint8Array.from(bytes);
}

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
  return quoteWatBytes(utf8Encoder.encode(name));
}

function decodeWatString(raw) {
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') throw new Error('Invalid WAT string delimiters');
  const text = raw.slice(1, -1);
  const bytes = [];
  const appendScalar = value => {
    if (value < 0x80) bytes.push(value);
    else for (const byte of utf8Encoder.encode(String.fromCodePoint(value))) bytes.push(byte);
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
  return toByteBuffer(bytes);
}

module.exports = { decodeUTF8, quoteWatBytes, quoteWatName, decodeWatString };

  };
  __modules["./wasm-memory.js"] = function (module, exports, require) {
function naturalAlignment(op) {
  const scalar = /^(i32|i64|f32|f64)\.(?:load|store)(8|16|32)?(?:_[su])?$/.exec(op);
  if (scalar) return Math.log2(Number(scalar[2] || scalar[1].slice(1)) / 8);
  if (op === 'v128.load' || op === 'v128.store') return 4;
  if (/^v128\.load(?:8x8|16x4|32x2)_[su]$/.test(op)) return 3;
  const vector = /^v128\.(?:load|store)(8|16|32|64)_(?:splat|lane|zero)$/.exec(op);
  if (vector) return Math.log2(Number(vector[1]) / 8);
  throw new Error(`Unknown memory access instruction ${op}`);
}

module.exports = { naturalAlignment };

  };
  __modules["./wasm-binary.js"] = function (module, exports, require) {
const { decodeUTF8: decodeUTF8Bytes } = __require("./wasm-strings.js");

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

  };
  __modules["./wasm-reader.js"] = function (module, exports, require) {
const { decodeULEB128, decodeSLEB128, decodeValueType, decodeUTF8 } = __require("./wasm-binary.js");

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

  };
  __modules["./wasm-control.js"] = function (module, exports, require) {
const blockNames = new Set(['block', 'loop', 'if', 'try', 'try_table']);
const branchNames = new Set(['br', 'br_if', 'br_on_null', 'br_on_non_null', 'br_on_cast', 'br_on_cast_fail']);

class ControlAnalyzer {
  constructor({ functionBody = false } = {}) {
    this.functionBody = functionBody;
    this.frames = [{ kind: functionBody ? 'function' : 'expression', startIndex: -1, parent: null,
      endIndex: null, elseIndex: null, handlers: [] }];
    this.stack = [0];
    this.branches = [];
    this.closed = false;
  }

  fail(instruction, message) {
    throw new Error(`Invalid control (${instruction.name}) at offset ${instruction.offset}: ${message}`);
  }

  target(instruction, depth) {
    if (!Number.isInteger(depth) || depth < 0 || depth >= this.stack.length) {
      this.fail(instruction, `label depth ${depth} out of range (labels=${this.stack.length})`);
    }
    return { depth, frameIndex: this.stack[this.stack.length - 1 - depth] };
  }

  accept(instruction, instructionIndex) {
    if (this.closed) this.fail(instruction, 'instruction after outer end');
    const { name, immediates } = instruction;
    const frameIndex = this.stack[this.stack.length - 1];
    const frame = this.frames[frameIndex];
    if (blockNames.has(name)) {
      // try_table handlers resolve in the surrounding label context.
      if (name === 'try_table' && this.functionBody) {
        immediates.catches.forEach((entry, catchIndex) => {
          this.branches.push({ instructionIndex, kind: 'catch', catchIndex,
            targets: [this.target(instruction, entry.labelIndex)] });
        });
      }
      const child = { kind: name, startIndex: instructionIndex, parent: frameIndex,
        endIndex: null, elseIndex: null, handlers: [] };
      this.frames.push(child);
      this.stack.push(this.frames.length - 1);
    } else if (name === 'else') {
      if (frame.kind !== 'if') this.fail(instruction, 'else outside its if');
      if (frame.elseIndex !== null) this.fail(instruction, 'duplicate else');
      frame.elseIndex = instructionIndex;
    } else if (name === 'catch' || name === 'catch_all') {
      if (frame.kind !== 'try') this.fail(instruction, 'legacy catch outside its try');
      if (frame.handlers.length && frame.handlers[frame.handlers.length - 1].kind === 'catch_all') {
        this.fail(instruction, 'handler after catch_all');
      }
      const handler = { kind: name, instructionIndex };
      if (name === 'catch') handler.tagIndex = immediates.tagIndex;
      frame.handlers.push(handler);
    } else if (name === 'end') {
      frame.endIndex = instructionIndex;
      this.stack.pop();
      this.closed = this.stack.length === 0;
    } else if (this.functionBody) {
      if (branchNames.has(name)) {
        this.branches.push({ instructionIndex, kind: name,
          targets: [this.target(instruction, immediates.labelIndex)] });
      } else if (name === 'br_table') {
        this.branches.push({ instructionIndex, kind: name,
          targets: [...immediates.targets, immediates.defaultTarget].map(depth => this.target(instruction, depth)) });
      } else if (name === 'return') {
        this.branches.push({ instructionIndex, kind: name, targets: [{ depth: this.stack.length - 1, frameIndex: 0 }] });
      } else if (name === 'rethrow') {
        const target = this.target(instruction, immediates.labelIndex);
        const caught = this.frames[target.frameIndex];
        if (caught.kind !== 'try' || caught.handlers.length === 0) {
          this.fail(instruction, 'rethrow target is not an enclosing active legacy catch');
        }
        this.branches.push({ instructionIndex, kind: name,
          targets: [{ ...target, handlerIndex: caught.handlers[caught.handlers.length - 1].instructionIndex }] });
      }
    }
    return this.closed;
  }

  finish() {
    if (!this.closed) throw new Error('Unterminated expression in control analysis');
    for (const branch of this.branches) {
      for (const target of branch.targets) {
        const frame = this.frames[target.frameIndex];
        target.kind = frame.kind;
        // These are instruction destinations only, not validated branch arities.
        if (branch.kind !== 'rethrow') target.targetIndex = frame.kind === 'loop' ? frame.startIndex + 1 : frame.endIndex + 1;
      }
    }
    return { frames: this.frames, branches: this.branches };
  }
}

function analyzeFunctionControl(instructions) {
  const analyzer = new ControlAnalyzer({ functionBody: true });
  instructions.forEach((instruction, index) => analyzer.accept(instruction, index));
  return analyzer.finish();
}

module.exports = { ControlAnalyzer, analyzeFunctionControl };

  };
  __modules["./wasm-instructions.js"] = function (module, exports, require) {
const { BinaryReader } = __require("./wasm-reader.js");
const {
  OPCODE_NAME, OPCODE_FC_NAME, OPCODE_FB_NAME, OPCODE_FD_NAME,
  HeapTypeName, ValTypeName, heapTypeToString
} = __require("./wasm-binary.js");
const { naturalAlignment } = __require("./wasm-memory.js");
const { ControlAnalyzer } = __require("./wasm-control.js");

const indexed = new Map([
  ['br', 'labelIndex'], ['br_if', 'labelIndex'], ['br_on_null', 'labelIndex'],
  ['br_on_non_null', 'labelIndex'], ['rethrow', 'labelIndex'],
  ['call', 'functionIndex'], ['return_call', 'functionIndex'], ['ref.func', 'functionIndex'],
  ['call_ref', 'typeIndex'], ['return_call_ref', 'typeIndex'],
  ['throw', 'tagIndex'], ['catch', 'tagIndex'],
  ['local.get', 'localIndex'], ['local.set', 'localIndex'], ['local.tee', 'localIndex'],
  ['global.get', 'globalIndex'], ['global.set', 'globalIndex'],
  ['table.get', 'tableIndex'], ['table.set', 'tableIndex'],
  ['memory.size', 'memoryIndex'], ['memory.grow', 'memoryIndex']
]);
const blockNames = new Set(['block', 'loop', 'if', 'try', 'try_table']);

function readHeapType(reader) {
  const value = reader.readSLEB('heap type', 33);
  heapTypeToString(value);
  return value;
}

function readBlockType(reader) {
  reader.ensure(1, 'blocktype');
  const code = reader.bytes[reader.offset];
  if (code === 0x40) {
    reader.offset++;
    return { kind: 'empty' };
  }
  if (ValTypeName[code] || HeapTypeName[code] || code === 0x63 || code === 0x64) {
    return { kind: 'value', valueType: reader.readValueType('blocktype') };
  }
  const typeIndex = reader.readSLEB('block type index', 33);
  if (typeIndex < 0) throw new Error(`Invalid block type index ${typeIndex}`);
  return { kind: 'type', typeIndex };
}

function readMemarg(reader, name) {
  const flags = reader.readULEB(`${name} flags`);
  if (flags >= 0x80) throw new Error(`Invalid memarg flags ${flags}`);
  const alignment = flags & 0x3f;
  if (alignment > naturalAlignment(name)) throw new Error(`Invalid ${name} alignment exponent ${alignment}`);
  const explicitMemory = (flags & 0x40) !== 0;
  const memoryIndex = explicitMemory ? reader.readULEB(`${name} memory index`) : 0;
  const offset = reader.readULEB(`${name} offset`, 64, { asBigInt: true });
  if (offset > 0xffffffffn) throw new Error('Unsupported memory offset: memory32 requires a u32 offset');
  return { alignment, memoryIndex, offset, explicitMemory };
}

function readVector(reader, context, minimumBytes, readEntry) {
  const count = reader.readULEB(`${context} count`);
  reader.ensure(count * minimumBytes, context);
  const entries = [];
  for (let i = 0; i < count; i++) entries.push(readEntry());
  return entries;
}

function decodeInstruction(reader) {
  const start = reader.offset;
  const opcode = reader.readByte('instruction opcode');
  let subopcode;
  let name;
  if (opcode === 0xfc || opcode === 0xfb || opcode === 0xfd) {
    subopcode = reader.readULEB('instruction subopcode');
    const table = opcode === 0xfc ? OPCODE_FC_NAME : opcode === 0xfb ? OPCODE_FB_NAME : OPCODE_FD_NAME;
    name = table[subopcode];
  } else {
    name = OPCODE_NAME[opcode];
  }
  if (name === undefined) {
    throw new Error(`Unknown opcode 0x${opcode.toString(16)}${subopcode === undefined ? '' : ` subopcode ${subopcode}`} at code offset ${reader.baseOffset + start}`);
  }
  const immediates = {};
  const index = key => { immediates[key] = reader.readULEB(`${name} ${key}`); };
  if (opcode === 0xfc) {
    if (name === 'memory.init') { index('dataIndex'); index('memoryIndex'); }
    else if (name === 'data.drop') index('dataIndex');
    else if (name === 'elem.drop') index('elementIndex');
    else if (name === 'memory.copy') { index('destinationMemory'); index('sourceMemory'); }
    else if (name === 'memory.fill') index('memoryIndex');
    else if (name === 'table.init') { index('elementIndex'); index('tableIndex'); }
    else if (name === 'table.copy') { index('destinationTable'); index('sourceTable'); }
    else if (['table.grow', 'table.size', 'table.fill'].includes(name)) index('tableIndex');
  } else if (opcode === 0xfb) {
    if (['ref.test', 'ref.test_null', 'ref.cast', 'ref.cast_null'].includes(name)) {
      immediates.heapType = readHeapType(reader);
      immediates.nullable = name.endsWith('_null');
    } else if (name === 'br_on_cast' || name === 'br_on_cast_fail') {
      const flags = reader.readByte(`${name} flags`);
      if (flags > 3) throw new Error(`Invalid ${name} flags ${flags}`);
      index('labelIndex');
      immediates.sourceType = { kind: 'ref', nullable: (flags & 1) !== 0, heapType: readHeapType(reader) };
      immediates.targetType = { kind: 'ref', nullable: (flags & 2) !== 0, heapType: readHeapType(reader) };
    } else if (name.startsWith('struct.get') || name === 'struct.set') {
      index('typeIndex'); index('fieldIndex');
    } else if (name === 'array.copy') {
      index('destinationType'); index('sourceType');
    } else if (['array.new_data', 'array.init_data', 'array.new_elem', 'array.init_elem'].includes(name)) {
      index('typeIndex'); index(name.endsWith('data') ? 'dataIndex' : 'elementIndex');
    } else if (name === 'array.new_fixed') {
      index('typeIndex'); index('length');
    } else if (['struct.new', 'struct.new_default', 'array.new', 'array.new_default',
      'array.get', 'array.get_s', 'array.get_u', 'array.set', 'array.fill'].includes(name)) {
      index('typeIndex');
    }
  } else if (opcode === 0xfd) {
    if (name === 'v128.const') {
      immediates.bytes = Uint8Array.from(reader.readBytes(16, 'v128.const bytes'));
    } else if (name === 'i8x16.shuffle') {
      immediates.lanes = Array.from(reader.readBytes(16, 'i8x16.shuffle lanes'));
      for (const lane of immediates.lanes) {
        if (lane >= 32) throw new Error(`Invalid i8x16.shuffle lane ${lane}`);
      }
    } else {
      if (name.startsWith('v128.load') || name.startsWith('v128.store')) {
        immediates.memarg = readMemarg(reader, name);
      }
      const laneShape = /^(?:[if](8|16|32|64)x\d+\.(?:extract_lane|replace_lane)|v128\.(?:load|store)(8|16|32|64)_lane)/.exec(name);
      if (laneShape) {
        const lane = reader.readByte(`${name} lane`);
        if (lane >= 128 / Number(laneShape[1] || laneShape[2])) throw new Error(`Invalid ${name} lane ${lane}`);
        immediates.lane = lane;
      }
    }
  } else if (blockNames.has(name)) {
    immediates.blockType = readBlockType(reader);
    if (name === 'try_table') {
      immediates.catches = readVector(reader, 'try_table catches', 2, () => {
        const kind = reader.readByte('try_table catch kind');
        if (kind > 3) throw new Error(`Invalid try_table catch kind ${kind}`);
        const tagIndex = kind < 2 ? reader.readULEB('catch tag index') : undefined;
        const labelIndex = reader.readULEB('catch label index');
        return tagIndex === undefined ? { kind, labelIndex } : { kind, tagIndex, labelIndex };
      });
    }
  } else if (indexed.has(name)) {
    index(indexed.get(name));
  } else if (name === 'call_indirect' || name === 'return_call_indirect') {
    index('typeIndex'); index('tableIndex');
  } else if (name === 'select_t') {
    immediates.types = readVector(reader, 'select_t type vector immediate', 1, () => reader.readValueType('select type'));
  } else if (name === 'br_table') {
    immediates.targets = readVector(reader, 'br_table targets', 1, () => reader.readULEB('branch target'));
    index('defaultTarget');
  } else if (opcode >= 0x28 && opcode <= 0x3e) {
    immediates.memarg = readMemarg(reader, name);
  } else if (name === 'i32.const') {
    immediates.value = reader.readSLEB(name, 32);
  } else if (name === 'i64.const') {
    immediates.value = reader.readSLEB(name, 64, { asBigInt: true });
  } else if (name === 'f32.const' || name === 'f64.const') {
    immediates.bits = reader.readFloatBits(name === 'f32.const' ? 32 : 64);
  } else if (name === 'ref.null') {
    immediates.heapType = readHeapType(reader);
  }
  const record = {
    opcode, name, immediates,
    offset: reader.baseOffset + start,
    endOffset: reader.baseOffset + reader.offset
  };
  if (subopcode !== undefined) record.subopcode = subopcode;
  return record;
}

function decodeInstructions(bytes, options = {}) {
  const reader = new BinaryReader(bytes, options);
  const instructions = [];
  while (reader.offset < reader.end) instructions.push(decodeInstruction(reader));
  return instructions;
}

function decodeExpression(bytes, options = {}) {
  const reader = new BinaryReader(bytes, options);
  const start = reader.offset;
  const instructions = [];
  const control = new ControlAnalyzer({ functionBody: options.functionBody === true });
  while (reader.offset < reader.end) {
    const instruction = decodeInstruction(reader);
    instructions.push(instruction);
    if (control.accept(instruction, instructions.length - 1)) {
      return {
        instructions,
        control: control.finish(),
        offset: reader.baseOffset + start,
        endOffset: reader.baseOffset + reader.offset,
        bytesRead: reader.offset - start
      };
    }
  }
  throw new Error(`Unterminated expression at offset ${reader.baseOffset + start}`);
}

module.exports = { decodeInstruction, decodeInstructions, decodeExpression };

  };
  __modules["./wasm-module.js"] = function (module, exports, require) {
const { BinaryReader } = __require("./wasm-reader.js");
const { decodeExpression } = __require("./wasm-instructions.js");
const { PackedTypeName } = __require("./wasm-binary.js");

// Tags precede globals; data-count precedes code, regardless of section IDs.
const SECTION_ORDER = new Map(
  [1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11].map((id, index) => [id, index + 1])
);

class ModuleDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.resetState();
  }

  resetState() {
    this.offset = 0;
    this.reader = null;
    this.binaryVersion = 1;
    this.sections = [];
    this.typeSection = [];
    this.typeGroups = [];
    this.importSection = [];
    this.functionSection = [];
    this.tableSection = [];
    this.memorySection = [];
    this.globalSection = [];
    this.exportSection = [];
    this.startSection = null;
    this.elementSection = [];
    this.codeSection = [];
    this.expressions = [];
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
    this.seenSections = new Set();
    this.lastSectionOrder = 0;
  }

  ensureAvailable(length, context, absoluteOffset = this.offset) {
    const end = this.sectionEnd !== null && this.sectionEnd !== undefined ? this.sectionEnd : this.buffer.length;
    if (!Number.isSafeInteger(length) || !Number.isSafeInteger(absoluteOffset) ||
        absoluteOffset < 0 || length < 0 || length > end - absoluteOffset) {
      throw new Error(`Out-of-bounds read (${context}) at offset ${absoluteOffset}, length ${length}, end ${end}`);
    }
  }

  readByte(context) {
    return this.readWith('readByte', context);
  }

  readULEB(context, bitWidth = 32, options) {
    return this.readWith('readULEB', context, bitWidth, options);
  }

  readSLEB(context, bitWidth, options) {
    return this.readWith('readSLEB', context, bitWidth, options);
  }

  readBytes(length, context) {
    return this.readWith('readBytes', length, context);
  }

  readCount(context, minimumEntryBytes = 1) {
    return this.readWith('readCount', context, minimumEntryBytes);
  }

  readWith(method, ...args) {
    if (!this.reader || this.reader.bytes !== this.buffer) {
      this.reader = new BinaryReader(this.buffer, { context: 'binary read' });
    }
    this.reader.offset = this.offset;
    this.reader.end = this.sectionEnd ?? this.buffer.length;
    const result = this.reader[method](...args);
    this.offset = this.reader.offset;
    return result;
  }

  withReadLimit(length, context, parse) {
    this.ensureAvailable(length, context);
    const previousEnd = this.sectionEnd;
    const end = this.offset + length;
    this.sectionEnd = end;
    try {
      const result = parse();
      if (this.offset !== end) {
        throw new Error(`${context} has unconsumed bytes at offset ${this.offset} (end=${end})`);
      }
      return result;
    } finally {
      this.sectionEnd = previousEnd;
    }
  }

  readUTF8String(context) {
    return this.readWith('readUTF8String', context);
  }

  readReferenceType(context) {
    return this.readValueType(context, true);
  }

  readValueType(context, referenceOnly = false) {
    return this.readWith('readValueType', context, referenceOnly);
  }

  readMutability(context) {
    const value = this.readByte(context);
    if (value > 1) throw new Error(`Invalid mutability ${value} (${context})`);
    return value === 1;
  }

  decode() {
    this.resetState();
    if (!(this.buffer instanceof Uint8Array) || this.buffer.length < 8) {
      throw new Error('Input is not a valid WASM buffer (too small)');
    }
    
    // Check magic number and version
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    if (view.getUint32(0, true) !== 0x6d736100 || view.getUint32(4, true) !== 0x1) {
      throw new Error('Invalid WASM magic number or version');
    }

    this.offset = 8; // Skip magic and version
    
    // Parse all sections
    while (this.offset < this.buffer.length) {
      this.parseSection();
    }
    
    return Object.fromEntries([
      ['bytes', this.buffer],
      ...['binaryVersion', 'sections', 'typeSection', 'typeGroups', 'importSection',
        'functionSection', 'tableSection', 'memorySection', 'globalSection', 'exportSection',
        'startSection', 'elementSection', 'codeSection', 'expressions', 'dataSection',
        'tagSection', 'dataCountSection', 'customSections', 'nameSection']
        .map(key => [key, this[key]])
    ]);
  }

  parseSection() {
    const sectionOffset = this.offset;
    this.ensureAvailable(1, 'section id');
    const sectionId = this.buffer[this.offset++];
    if (sectionId !== 0) {
      const order = SECTION_ORDER.get(sectionId);
      if (order === undefined) {
        throw new Error(`Unknown section ${sectionId} at offset ${sectionOffset}`);
      }
      if (this.seenSections.has(sectionId)) {
        throw new Error(`Duplicate section ${sectionId} at offset ${sectionOffset}`);
      }
      if (order < this.lastSectionOrder) {
        throw new Error(`Section ${sectionId} out of order at offset ${sectionOffset}`);
      }
      this.seenSections.add(sectionId);
      this.lastSectionOrder = order;
    }
    const sectionLength = this.readULEB('section length');
    const payloadOffset = this.offset;
    const sectionEnd = this.offset + sectionLength;
    if (sectionEnd > this.buffer.length) {
      throw new Error(`Section ${sectionId} exceeds buffer bounds (offset=${this.offset}, length=${sectionLength})`);
    }
    const previousSectionEnd = this.sectionEnd;
    this.sectionEnd = sectionEnd;
    
    try {
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
      }

      if (this.offset < sectionEnd) {
        throw new Error(`Section ${sectionId} has unconsumed bytes at offset ${this.offset} (end=${sectionEnd})`);
      } else if (this.offset > sectionEnd) {
        throw new Error(`Section ${sectionId} parser overread at offset ${this.offset}`);
      }
      this.sections.push({ id: sectionId, offset: sectionOffset, payloadOffset, endOffset: sectionEnd });
    } finally {
      this.sectionEnd = previousSectionEnd;
    }
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
      payload: this.buffer.subarray(payloadStart, this.sectionEnd),
    });

    if (name !== 'name') {
      this.offset = this.sectionEnd;
      return;
    }

    while (this.offset < this.sectionEnd) {
      const subsectionId = this.readByte('name subsection id');
      const subsectionSize = this.readULEB('name subsection size');
      this.withReadLimit(subsectionSize, `name subsection ${subsectionId}`, () => {
        if (subsectionId === 0x00) {
          this.nameSection.moduleName = this.readUTF8String('module name');
        } else if (subsectionId === 0x01) {
          const count = this.readCount('function name count', 2);
          for (let i = 0; i < count; i++) {
            const functionIndex = this.readULEB('function name index');
            const functionName = this.readUTF8String('function name');
            this.nameSection.functionNames.set(functionIndex, functionName);
          }
        } else if (subsectionId === 0x02) {
          const functionCount = this.readCount('local name function count', 2);
          for (let i = 0; i < functionCount; i++) {
            const functionIndex = this.readULEB('local name function index');
            const localCount = this.readCount('local name count', 2);
            const localMap = new Map();
            for (let j = 0; j < localCount; j++) {
              const localIndex = this.readULEB('local name index');
              const localName = this.readUTF8String('local name');
              localMap.set(localIndex, localName);
            }
            this.nameSection.localNames.set(functionIndex, localMap);
          }
        } else {
          this.readBytes(subsectionSize, `unknown name subsection ${subsectionId}`);
        }
      });
    }
  }

  parseTypeSection() {
    const count = this.readCount('type count');
    for (let i = 0; i < count; i++) {
      const offset = this.offset;
      const recursive = this.buffer[this.offset] === 0x4e;
      if (recursive) this.readByte('recursive group marker');
      const size = recursive ? this.readCount('recursive group count') : 1;
      const startIndex = this.typeSection.length;
      for (let j = 0; j < size; j++) {
        this.typeSection.push(this.parseSubtype());
      }
      this.typeGroups.push({ recursive, startIndex, size, offset, endOffset: this.offset });
    }
  }

  parseSubtype() {
    const offset = this.offset;
    let form = this.readByte('type form');
    const explicit = form === 0x50 || form === 0x4f;
    const isFinal = form !== 0x50;
    const supertypes = [];
    if (explicit) {
      const count = this.readCount('supertype count');
      for (let i = 0; i < count; i++) supertypes.push(this.readULEB('supertype index'));
      form = this.readByte('composite type form');
    }
    let type;
    if (form === 0x60) {
      const readTypes = context => {
        const count = this.readCount(context);
        const types = [];
        for (let i = 0; i < count; i++) types.push(this.readValueType(context));
        return types;
      };
      type = { kind: 'func', params: readTypes('parameter count'), results: readTypes('result count') };
    } else if (form === 0x5f) {
      const count = this.readCount('field count', 2);
      const fields = [];
      for (let i = 0; i < count; i++) fields.push(this.parseFieldType());
      type = { kind: 'struct', fields };
    } else if (form === 0x5e) {
      type = { kind: 'array', field: this.parseFieldType() };
    } else {
      throw new Error(`Invalid composite type form 0x${form.toString(16)} at offset ${this.offset - 1}`);
    }
    return { ...type, subtype: { explicit, isFinal, supertypes }, offset, endOffset: this.offset };
  }

  parseFieldType() {
    const code = this.buffer[this.offset];
    const storage = PackedTypeName[code] ? this.readByte('packed field type') : this.readValueType('field value type');
    const mutable = this.readMutability('field mutability');
    return { storage, mutable };
  }

  parseImportSection() {
    const count = this.readCount('import count', 4);
    
    for (let i = 0; i < count; i++) {
      const module = this.readUTF8String('import module');
      const name = this.readUTF8String('import name');
      
      const kind = this.readByte('import kind');
      let importDesc = { module, name, kind };
      
      switch (kind) {
        case 0x00: // Function
          importDesc.typeIdx = this.readULEB('import function type');
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
          importDesc.attribute = this.readTagAttribute('import tag attribute');
          importDesc.typeIdx = this.readULEB('import tag type');
          break;
        default:
          throw new Error(`Invalid import kind ${kind} at offset ${this.offset - 1}`);
      }
      
      this.importSection.push(importDesc);
    }
  }

  parseTableType() {
    const elemType = this.readReferenceType('table element type');
    const limits = this.parseLimits();
    return { elemType, limits };
  }

  parseMemoryType() {
    const limits = this.parseLimits();
    if (limits.min > 65536 || (limits.max !== undefined && limits.max > 65536)) {
      throw new Error('Memory32 limits exceed 65536 pages');
    }
    return limits;
  }

  parseGlobalType() {
    const valType = this.readValueType('global value type');
    const mutable = this.readMutability('global mutability');
    return { valType, mutable };
  }

  parseLimits() {
    const flags = this.readByte('limits flags');
    if (flags !== 0 && flags !== 1) {
      throw new Error(`Unsupported limits flags 0x${flags.toString(16)}: only unshared memory32/table32 limits are supported`);
    }
    const readLimit = context => {
      const value = this.readULEB(context, 64, { asBigInt: true });
      if (value > 0xffffffffn) throw new Error(`Unsupported ${context}: memory32/table32 limits require u32 values`);
      return Number(value);
    };
    const min = readLimit('limits minimum');
    
    if (flags === 0x01) {
      const max = readLimit('limits maximum');
      if (max < min) throw new Error(`Invalid limits: maximum ${max} is below minimum ${min}`);
      return { min, max };
    }
    return { min };
  }

  parseFunctionSection() {
    const count = this.readCount('function count');

    for (let i = 0; i < count; i++) {
      this.functionSection.push(this.readULEB('function type index'));
    }
  }

  parseTableSection() {
    const count = this.readCount('table count', 3);

    for (let i = 0; i < count; i++) {
      this.tableSection.push(this.parseTableType());
    }
  }

  parseMemorySection() {
    const count = this.readCount('memory count', 2);

    for (let i = 0; i < count; i++) {
      this.memorySection.push(this.parseMemoryType());
    }
  }

  parseGlobalSection() {
    const count = this.readCount('global count', 3);

    for (let i = 0; i < count; i++) {
      const globalType = this.parseGlobalType();
      const initExpr = this.parseExpressionBytes();
      this.globalSection.push({ globalType, initExpr, initializer: this.expressions[this.expressions.length - 1] });
    }
  }

  parseExportSection() {
    const count = this.readCount('export count', 3);

    for (let i = 0; i < count; i++) {
      const name = this.readUTF8String('export name');
      const kind = this.readByte('export kind');
      if (kind > 4) throw new Error(`Invalid export kind ${kind} at offset ${this.offset - 1}`);
      const index = this.readULEB('export index');
      this.exportSection.push({ name, kind, index });
    }
  }

  parseStartSection() {
    this.startSection = this.readULEB('start function');
  }

  parseElementSection() {
    const count = this.readCount('element count');
    for (let i = 0; i < count; i++) {
      const flags = this.readULEB('element flags');
      if (flags > 7) throw new Error(`Invalid element flags ${flags} at offset ${this.offset}`);

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

      if (flags === 2 || flags === 6) {
        entry.tableIndex = this.readULEB('element table index');
      }

      if (entry.mode === 'active') {
        entry.initExpr = this.parseExpressionBytes();
        entry.offsetExpression = this.expressions[this.expressions.length - 1];
      }

      if (flags >= 5) {
        const referenceTypeOffset = this.offset;
        entry.reftype = this.readReferenceType('element reference type');
        entry.reftypeBytes = this.buffer.subarray(referenceTypeOffset, this.offset);
      } else if (flags === 1 || flags === 2 || flags === 3) {
        const elemkind = this.readByte('element kind');
        if (elemkind !== 0) throw new Error(`Invalid element kind ${elemkind} at offset ${this.offset - 1}`);
      }

      const itemCount = this.readCount('element item count');
      if (entry.useExpressions) entry.elementExpressions = [];
      for (let j = 0; j < itemCount; j++) {
        if (entry.useExpressions) {
          entry.elements.push(this.parseExpressionBytes());
          entry.elementExpressions.push(this.expressions[this.expressions.length - 1]);
        } else {
          entry.elements.push(this.readULEB('element function index'));
        }
      }

      this.elementSection.push(entry);
    }
  }

  parseCodeSection() {
    const count = this.readCount('code body count');
    for (let i = 0; i < count; i++) {
      const bodyOffset = this.offset;
      const bodySize = this.readULEB('function body size');
      const payloadOffset = this.offset;
      const body = this.withReadLimit(bodySize, `function body ${i}`, () => {
        const localCount = this.readCount('local declaration count', 2);
        const locals = [];
        for (let j = 0; j < localCount; j++) {
          const count = this.readULEB('local count');
          const valType = this.readValueType('local valtype');
          locals.push({ count, valType });
        }
        const codeOffset = this.offset;
        const code = this.readBytes(this.sectionEnd - this.offset, 'function instructions');
        const decoded = decodeExpression(code, { baseOffset: codeOffset, functionBody: true });
        if (decoded.bytesRead !== code.length) {
          throw new Error(`Function body has unconsumed bytes after end at offset ${decoded.endOffset}`);
        }
        return { locals, code, codeOffset, instructions: decoded.instructions, control: decoded.control,
          offset: bodyOffset, payloadOffset, endOffset: this.offset };
      });
      this.codeSection.push(body);
    }
  }

  parseDataSection() {
    const count = this.readCount('data segment count', 2);

    for (let i = 0; i < count; i++) {
      const flags = this.readULEB('data flags');
      if (flags > 2) throw new Error(`Invalid data flags ${flags} at offset ${this.offset}`);

      const dataEntry = {
        flags,
        mode: flags === 1 ? 'passive' : 'active',
        memoryIndex: 0,
        offsetExpr: null,
        bytes: new Uint8Array(0)
      };

      if (flags === 0) {
        dataEntry.offsetExpr = this.parseExpressionBytes();
      } else if (flags === 2) {
        dataEntry.memoryIndex = this.readULEB('data memory index');
        dataEntry.offsetExpr = this.parseExpressionBytes();
      }
      if (dataEntry.offsetExpr) dataEntry.offsetExpression = this.expressions[this.expressions.length - 1];

      const size = this.readULEB('data byte count');
      dataEntry.bytes = this.readBytes(size, 'data bytes');

      this.dataSection.push(dataEntry);
    }
  }

  parseDataCountSection() {
    this.dataCountSection = this.readULEB('data count');
  }

  parseTagSection() {
    const count = this.readCount('tag count', 2);

    for (let i = 0; i < count; i++) {
      const attribute = this.readTagAttribute('tag attribute');
      const typeIdx = this.readULEB('tag type index');
      this.tagSection.push({ attribute, typeIdx });
    }
  }

  readTagAttribute(context) {
    const attribute = this.readByte(context);
    if (attribute !== 0) throw new Error(`Invalid ${context} ${attribute} at offset ${this.offset - 1}`);
    return attribute;
  }

  parseExpressionBytes() {
    const start = this.offset;
    const decoded = decodeExpression(this.buffer, { start, end: this.sectionEnd ?? this.buffer.length });
    this.offset = decoded.endOffset;
    this.expressions.push(decoded);
    return this.buffer.subarray(start, this.offset);
  }

}

function decodeModule(bytes, { copyInput = true } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('decodeModule requires a Uint8Array');
  if (typeof copyInput !== 'boolean') throw new TypeError('copyInput must be a boolean');
  return new ModuleDecoder(copyInput ? Uint8Array.from(bytes) : bytes).decode();
}

module.exports = { ModuleDecoder, decodeModule };

  };
  __modules["./vm/errors.js"] = function (module, exports, require) {
class WasmError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = this.constructor.name;
    this.code = details.code || 'WASM_ERROR';
    if (details.offset !== undefined) this.offset = details.offset;
    if (details.section !== undefined) this.section = details.section;
    if (details.functionIndex !== undefined) this.functionIndex = details.functionIndex;
    if (details.instruction !== undefined) this.instruction = details.instruction;
    if (details.opcode !== undefined) this.opcode = details.opcode;
    if (details.stackTrace !== undefined) this.stackTrace = details.stackTrace;
  }
}

class DecodeError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'DECODE_ERROR', ...details });
  }
}

class UnsupportedFeatureError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'UNSUPPORTED_FEATURE', ...details });
  }
}

class ValidationError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'VALIDATION_ERROR', ...details });
  }
}

class LinkError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'LINK_ERROR', ...details });
  }
}

class Trap extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'TRAP', ...details });
  }
}

class GuestException extends WasmError {
  constructor(tag, values = [], details = {}) {
    super(details.message || 'Uncaught WebAssembly exception', { code: 'GUEST_EXCEPTION', ...details });
    this.tag = tag;
    this.values = Array.isArray(values) ? values : [values];
  }
}

class ResourceLimitError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'RESOURCE_LIMIT_ERROR', ...details });
  }
}

class HostError extends WasmError {
  constructor(cause, details = {}) {
    const msg = cause && cause.message ? cause.message : String(cause);
    super(msg, { code: 'HOST_ERROR', cause, ...details });
    this.originalError = cause;
  }
}

function wrapDecodeError(error) {
  if (error instanceof WasmError) return error;
  const message = error && error.message ? error.message : String(error);
  const offsetMatch = /offset\s+(\d+)/i.exec(message);
  const offset = offsetMatch ? Number(offsetMatch[1]) : undefined;
  if (/^Unsupported\b/i.test(message)) {
    return new UnsupportedFeatureError(message, { offset, cause: error });
  }
  return new DecodeError(message, { offset, cause: error });
}

module.exports = {
  WasmError,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  Trap,
  GuestException,
  ResourceLimitError,
  HostError,
  wrapDecodeError
};

  };
  __modules["./vm/types.js"] = function (module, exports, require) {
const { ValTypeName, PackedTypeName, HeapTypeName, heapTypeToString } = __require("./wasm-binary.js");
const { ValidationError, Trap } = __require("./vm/errors.js");

const ABSTRACT_HEAP_TYPES = new Set([
  'func', 'extern', 'exn', 'any', 'eq', 'i31', 'struct', 'array',
  'none', 'nofunc', 'noexn', 'noextern'
]);

const CODE_TO_HEAP = {
  0x70: 'func',
  0x6f: 'extern',
  0x69: 'exn',
  0x6e: 'any',
  0x6d: 'eq',
  0x6c: 'i31',
  0x6b: 'struct',
  0x6a: 'array',
  0x71: 'none',
  0x73: 'nofunc',
  0x74: 'noexn',
  0x72: 'noextern'
};

function normalizeHeapType(ht) {
  if (typeof ht === 'string') {
    if (ABSTRACT_HEAP_TYPES.has(ht)) return ht;
    const n = Number(ht);
    if (Number.isInteger(n) && n >= 0) return n;
    throw new ValidationError(`Invalid heap type: ${ht}`);
  }
  if (typeof ht === 'number') {
    if (ht >= 0 && Number.isInteger(ht)) return ht;
    if (ht < 0) {
      const name = HeapTypeName[ht + 0x80];
      if (name) return name;
    }
    if (CODE_TO_HEAP[ht]) return CODE_TO_HEAP[ht];
  }
  if (ht && typeof ht === 'object' && typeof ht.canonicalId === 'string') {
    return ht;
  }
  throw new ValidationError(`Invalid heap type: ${JSON.stringify(ht)}`);
}

function normalizeValType(type) {
  if (!type && type !== 0) throw new ValidationError(`Invalid value type: ${type}`);
  if (typeof type === 'object') {
    if (type.kind === 'num' || type.kind === 'vec' || type.kind === 'packed' || type.kind === 'bot') {
      return type;
    }
    if (type.kind === 'ref') {
      return {
        kind: 'ref',
        nullable: Boolean(type.nullable),
        heapType: normalizeHeapType(type.heapType)
      };
    }
  }
  if (typeof type === 'number') {
    switch (type) {
      case 0x7f: return { kind: 'num', name: 'i32', code: 0x7f };
      case 0x7e: return { kind: 'num', name: 'i64', code: 0x7e };
      case 0x7d: return { kind: 'num', name: 'f32', code: 0x7d };
      case 0x7c: return { kind: 'num', name: 'f64', code: 0x7c };
      case 0x7b: return { kind: 'vec', name: 'v128', code: 0x7b };
      case 0x78: return { kind: 'packed', name: 'i8', code: 0x78 };
      case 0x77: return { kind: 'packed', name: 'i16', code: 0x77 };
      default:
        if (CODE_TO_HEAP[type]) {
          return { kind: 'ref', nullable: true, heapType: CODE_TO_HEAP[type] };
        }
    }
  }
  if (typeof type === 'string') {
    switch (type) {
      case 'i32': return { kind: 'num', name: 'i32', code: 0x7f };
      case 'i64': return { kind: 'num', name: 'i64', code: 0x7e };
      case 'f32': return { kind: 'num', name: 'f32', code: 0x7d };
      case 'f64': return { kind: 'num', name: 'f64', code: 0x7c };
      case 'v128': return { kind: 'vec', name: 'v128', code: 0x7b };
      case 'i8': return { kind: 'packed', name: 'i8', code: 0x78 };
      case 'i16': return { kind: 'packed', name: 'i16', code: 0x77 };
      case 'funcref': return { kind: 'ref', nullable: true, heapType: 'func' };
      case 'externref': return { kind: 'ref', nullable: true, heapType: 'extern' };
      case 'exnref': return { kind: 'ref', nullable: true, heapType: 'exn' };
      case 'anyref': return { kind: 'ref', nullable: true, heapType: 'any' };
      case 'eqref': return { kind: 'ref', nullable: true, heapType: 'eq' };
      case 'i31ref': return { kind: 'ref', nullable: true, heapType: 'i31' };
      case 'structref': return { kind: 'ref', nullable: true, heapType: 'struct' };
      case 'arrayref': return { kind: 'ref', nullable: true, heapType: 'array' };
      case 'nullref': return { kind: 'ref', nullable: true, heapType: 'none' };
      case 'nullfuncref': return { kind: 'ref', nullable: true, heapType: 'nofunc' };
      case 'nullexnref': return { kind: 'ref', nullable: true, heapType: 'noexn' };
      case 'nullexternref': return { kind: 'ref', nullable: true, heapType: 'noextern' };
      default:
        if (ABSTRACT_HEAP_TYPES.has(type)) {
          return { kind: 'ref', nullable: true, heapType: type };
        }
    }
  }
  throw new ValidationError(`Unknown value type: ${JSON.stringify(type)}`);
}

const BOT_TYPE = Object.freeze({ kind: 'bot', name: 'bot' });
const I32_TYPE = Object.freeze({ kind: 'num', name: 'i32', code: 0x7f });
const I64_TYPE = Object.freeze({ kind: 'num', name: 'i64', code: 0x7e });
const F32_TYPE = Object.freeze({ kind: 'num', name: 'f32', code: 0x7d });
const F64_TYPE = Object.freeze({ kind: 'num', name: 'f64', code: 0x7c });
const V128_TYPE = Object.freeze({ kind: 'vec', name: 'v128', code: 0x7b });

function formatValType(type) {
  const t = normalizeValType(type);
  if (t.kind === 'bot') return 'bot';
  if (t.kind === 'num' || t.kind === 'vec' || t.kind === 'packed') return t.name;
  if (t.kind === 'ref') {
    const ht = typeof t.heapType === 'object' ? t.heapType.canonicalId : t.heapType;
    return `(ref ${t.nullable ? 'null ' : ''}${ht})`;
  }
  return String(type);
}

function isDefaultable(type) {
  const t = normalizeValType(type);
  if (t.kind === 'num' || t.kind === 'vec' || t.kind === 'packed') return true;
  if (t.kind === 'ref') return t.nullable;
  return true;
}

function defaultValueForType(type) {
  const t = normalizeValType(type);
  if (t.kind === 'num') {
    if (t.name === 'i32') return 0;
    if (t.name === 'i64') return 0n;
    if (t.name === 'f32' || t.name === 'f64') return 0;
  }
  if (t.kind === 'packed') return 0;
  if (t.kind === 'vec') return new Uint8Array(16);
  if (t.kind === 'ref') {
    if (!t.nullable) throw new ValidationError(`Non-nullable reference type ${formatValType(t)} has no default value`);
    return null;
  }
  return 0;
}

function heapHierarchy(ht, typeEnv = null) {
  if (typeof ht === 'object' && ht !== null && ht.kind) {
    return ht.kind === 'func' ? 'func' : 'any';
  }
  const norm = normalizeHeapType(ht);
  if (typeof norm === 'number') {
    const def = typeEnv ? typeEnv.get(norm) : null;
    if (!def) throw new ValidationError(`Unknown type index ${norm}`);
    return def.kind === 'func' ? 'func' : 'any';
  }
  if (norm === 'func' || norm === 'nofunc') return 'func';
  if (norm === 'extern' || norm === 'noextern') return 'extern';
  if (norm === 'exn' || norm === 'noexn') return 'exn';
  return 'any';
}

class TypeEnvironment {
  constructor(typeSection = [], typeGroups = []) {
    this.rawTypes = typeSection;
    this.rawGroups = typeGroups.length > 0
      ? typeGroups
      : typeSection.map((_, idx) => ({ recursive: false, startIndex: idx, size: 1 }));
    this.types = [];
    this._build();
  }

  _build() {
    let groupIndex = 0;
    for (const group of this.rawGroups) {
      const { startIndex, size } = group;
      const endIndex = startIndex + size;
      if (endIndex > this.rawTypes.length) {
        throw new ValidationError(`Recursive type group exceeds type section bounds (${endIndex} > ${this.rawTypes.length})`);
      }
      // First create placeholder entries so intra-group references resolve bounds
      for (let idx = startIndex; idx < endIndex; idx++) {
        const raw = this.rawTypes[idx];
        const supertypes = raw.subtype && Array.isArray(raw.subtype.supertypes) ? raw.subtype.supertypes : [];
        if (supertypes.length > 1) {
          throw new ValidationError(`Type ${idx} has more than one supertype (${supertypes.length})`, { offset: raw.offset });
        }
        for (const sup of supertypes) {
          if (sup >= idx) {
            throw new ValidationError(`Type ${idx} references forward or self supertype ${sup}`, { offset: raw.offset });
          }
        }
        let normalized;
        if (raw.kind === 'func') {
          normalized = {
            index: idx,
            groupStart: startIndex,
            groupSize: size,
            groupOffset: idx - startIndex,
            kind: 'func',
            params: raw.params.map(normalizeValType),
            results: raw.results.map(normalizeValType),
            isFinal: raw.subtype ? Boolean(raw.subtype.isFinal) : true,
            supertypes: [...supertypes],
            offset: raw.offset
          };
        } else if (raw.kind === 'struct') {
          normalized = {
            index: idx,
            groupStart: startIndex,
            groupSize: size,
            groupOffset: idx - startIndex,
            kind: 'struct',
            fields: raw.fields.map(f => ({
              storage: normalizeValType(f.storage),
              mutable: Boolean(f.mutable)
            })),
            isFinal: raw.subtype ? Boolean(raw.subtype.isFinal) : true,
            supertypes: [...supertypes],
            offset: raw.offset
          };
        } else if (raw.kind === 'array') {
          normalized = {
            index: idx,
            groupStart: startIndex,
            groupSize: size,
            groupOffset: idx - startIndex,
            kind: 'array',
            field: {
              storage: normalizeValType(raw.field.storage),
              mutable: Boolean(raw.field.mutable)
            },
            isFinal: raw.subtype ? Boolean(raw.subtype.isFinal) : true,
            supertypes: [...supertypes],
            offset: raw.offset
          };
        } else {
          throw new ValidationError(`Unknown composite type kind ${raw.kind}`, { offset: raw.offset });
        }
        this.types[idx] = normalized;
      }

      // Verify all type indices referenced inside the group are < endIndex
      for (let idx = startIndex; idx < endIndex; idx++) {
        this._validateTypeReferencesInDef(this.types[idx], endIndex);
      }

      // Compute canonical group representation
      const groupMembersRepr = [];
      for (let idx = startIndex; idx < endIndex; idx++) {
        groupMembersRepr.push(this._serializeDefForGroup(this.types[idx], startIndex, endIndex));
      }
      const groupCanonicalId = `rec[${groupMembersRepr.join(';')}]`;
      for (let idx = startIndex; idx < endIndex; idx++) {
        const t = this.types[idx];
        t.groupCanonicalId = groupCanonicalId;
        t.canonicalId = `${groupCanonicalId}#${idx - startIndex}`;
        t.supertypeCaIds = new Set();
        for (const supIdx of t.supertypes) {
          const supDef = this.types[supIdx];
          t.supertypeCaIds.add(supDef.canonicalId);
          for (const anc of supDef.supertypeCaIds) {
            t.supertypeCaIds.add(anc);
          }
        }
      }
      groupIndex++;
    }
  }

  _validateTypeReferencesInDef(def, maxExclusive) {
    const checkType = vt => {
      if (vt.kind === 'ref' && typeof vt.heapType === 'number') {
        if (vt.heapType < 0 || vt.heapType >= maxExclusive) {
          throw new ValidationError(`Type index ${vt.heapType} out of bounds (max ${maxExclusive - 1})`, { offset: def.offset });
        }
      }
    };
    if (def.kind === 'func') {
      def.params.forEach(checkType);
      def.results.forEach(checkType);
    } else if (def.kind === 'struct') {
      def.fields.forEach(f => checkType(f.storage));
    } else if (def.kind === 'array') {
      checkType(def.field.storage);
    }
  }

  _serializeValTypeForGroup(vt, groupStart, groupEnd) {
    if (vt.kind === 'num' || vt.kind === 'vec' || vt.kind === 'packed') return vt.name;
    if (vt.kind === 'ref') {
      let htRepr;
      if (typeof vt.heapType === 'number') {
        if (vt.heapType >= groupStart && vt.heapType < groupEnd) {
          htRepr = `@self+${vt.heapType - groupStart}`;
        } else {
          htRepr = this.types[vt.heapType].canonicalId;
        }
      } else if (typeof vt.heapType === 'object' && vt.heapType.canonicalId) {
        htRepr = vt.heapType.canonicalId;
      } else {
        htRepr = String(vt.heapType);
      }
      return `ref(${vt.nullable ? 'null,' : ''}${htRepr})`;
    }
    return 'bot';
  }

  _serializeDefForGroup(def, groupStart, groupEnd) {
    const supRepr = def.supertypes.map(supIdx => {
      if (supIdx >= groupStart && supIdx < groupEnd) return `@self+${supIdx - groupStart}`;
      return this.types[supIdx].canonicalId;
    }).join(',');
    const head = `${def.isFinal ? 'final' : 'open'}(${supRepr}):${def.kind}`;
    if (def.kind === 'func') {
      const p = def.params.map(t => this._serializeValTypeForGroup(t, groupStart, groupEnd)).join(',');
      const r = def.results.map(t => this._serializeValTypeForGroup(t, groupStart, groupEnd)).join(',');
      return `${head}(${p})->(${r})`;
    }
    if (def.kind === 'struct') {
      const f = def.fields.map(field =>
        `${field.mutable ? 'mut ' : ''}${this._serializeValTypeForGroup(field.storage, groupStart, groupEnd)}`
      ).join(',');
      return `${head}{${f}}`;
    }
    if (def.kind === 'array') {
      return `${head}[${def.field.mutable ? 'mut ' : ''}${this._serializeValTypeForGroup(def.field.storage, groupStart, groupEnd)}]`;
    }
    return head;
  }

  get(index) {
    if (typeof index === 'object' && index !== null && index.canonicalId) return index;
    if (!Number.isInteger(index) || index < 0 || index >= this.types.length) {
      throw new ValidationError(`Type index ${index} out of bounds (count=${this.types.length})`);
    }
    return this.types[index];
  }

  validateSubtyping() {
    for (let i = 0; i < this.types.length; i++) {
      const sub = this.types[i];
      for (const supIdx of sub.supertypes) {
        const sup = this.types[supIdx];
        if (sup.isFinal) {
          throw new ValidationError(`Type ${i} cannot subtype final type ${supIdx}`, { offset: sub.offset });
        }
        if (!this.isCompositeSubtype(sub, sup)) {
          throw new ValidationError(`Type ${i} (${sub.kind}) does not match declared supertype ${supIdx} (${sup.kind})`, { offset: sub.offset });
        }
      }
    }
  }

  isCompositeSubtype(sub, sup) {
    if (sub.kind !== sup.kind) return false;
    if (sub.kind === 'func') {
      if (sub.params.length !== sup.params.length || sub.results.length !== sup.results.length) {
        return false;
      }
      for (let i = 0; i < sub.params.length; i++) {
        if (!this.isValueSubtype(sup.params[i], sub.params[i])) return false;
      }
      for (let i = 0; i < sub.results.length; i++) {
        if (!this.isValueSubtype(sub.results[i], sup.results[i])) return false;
      }
      return true;
    }
    if (sub.kind === 'struct') {
      if (sub.fields.length < sup.fields.length) return false;
      for (let i = 0; i < sup.fields.length; i++) {
        if (!this.isFieldSubtype(sub.fields[i], sup.fields[i])) return false;
      }
      return true;
    }
    if (sub.kind === 'array') {
      return this.isFieldSubtype(sub.field, sup.field);
    }
    return false;
  }

  isFieldSubtype(subField, supField) {
    if (subField.mutable !== supField.mutable) return false;
    if (subField.mutable) {
      return this.isStorageSubtype(subField.storage, supField.storage) &&
             this.isStorageSubtype(supField.storage, subField.storage);
    }
    return this.isStorageSubtype(subField.storage, supField.storage);
  }

  isStorageSubtype(sub, sup) {
    const a = normalizeValType(sub);
    const b = normalizeValType(sup);
    if (a.kind === 'packed' || b.kind === 'packed') {
      return a.kind === 'packed' && b.kind === 'packed' && a.name === b.name;
    }
    return this.isValueSubtype(a, b);
  }

  resolveConcreteHeapType(ht) {
    if (typeof ht === 'object' && ht !== null && ht.canonicalId) return ht;
    if (typeof ht === 'number') return this.get(ht);
    return null;
  }

  isHeapSubtype(subHt, supHt, supTypeEnv = this) {
    const a = typeof subHt === 'object' && subHt !== null && subHt.canonicalId ? subHt : normalizeHeapType(subHt);
    const b = typeof supHt === 'object' && supHt !== null && supHt.canonicalId ? supHt : normalizeHeapType(supHt);

    const aDef = typeof a === 'number' ? this.get(a) : (typeof a === 'object' ? a : null);
    const bDef = typeof b === 'number' ? supTypeEnv.get(b) : (typeof b === 'object' ? b : null);

    const aId = aDef ? aDef.canonicalId : a;
    const bId = bDef ? bDef.canonicalId : b;
    if (aId === bId) return true;

    // Bottom types
    if (a === 'none') {
      return b === 'any' || b === 'eq' || b === 'i31' || b === 'struct' || b === 'array' ||
             (bDef !== null && (bDef.kind === 'struct' || bDef.kind === 'array'));
    }
    if (a === 'nofunc') {
      return b === 'func' || (bDef !== null && bDef.kind === 'func');
    }
    if (a === 'noextern') {
      return b === 'extern';
    }
    if (a === 'noexn') {
      return b === 'exn';
    }

    // Abstract hierarchy
    if (!aDef) {
      if (a === 'i31' || a === 'struct' || a === 'array') {
        return b === 'eq' || b === 'any';
      }
      if (a === 'eq') {
        return b === 'any';
      }
      return false;
    }

    // Concrete subHt
    if (!bDef) {
      if (aDef.kind === 'func') return b === 'func';
      if (aDef.kind === 'struct') return b === 'struct' || b === 'eq' || b === 'any';
      if (aDef.kind === 'array') return b === 'array' || b === 'eq' || b === 'any';
      return false;
    }

    // Both concrete: check declared supertype chain by canonicalId
    return aDef.supertypeCaIds.has(bDef.canonicalId);
  }

  isValueSubtype(sub, sup, supTypeEnv = this) {
    const a = normalizeValType(sub);
    const b = normalizeValType(sup);
    if (a.kind === 'bot') return true;
    if (b.kind === 'bot') return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'num' || a.kind === 'vec' || a.kind === 'packed') {
      return a.name === b.name;
    }
    if (a.kind === 'ref') {
      if (a.nullable && !b.nullable) return false;
      return this.isHeapSubtype(a.heapType, b.heapType, supTypeEnv);
    }
    return false;
  }

  bindValType(vt) {
    const norm = normalizeValType(vt);
    if (norm.kind === 'ref' && typeof norm.heapType === 'number') {
      return {
        kind: 'ref',
        nullable: norm.nullable,
        heapType: this.get(norm.heapType)
      };
    }
    return norm;
  }
}

module.exports = {
  ABSTRACT_HEAP_TYPES,
  CODE_TO_HEAP,
  BOT_TYPE,
  I32_TYPE,
  I64_TYPE,
  F32_TYPE,
  F64_TYPE,
  V128_TYPE,
  normalizeHeapType,
  normalizeValType,
  formatValType,
  isDefaultable,
  defaultValueForType,
  heapHierarchy,
  TypeEnvironment
};

  };
  __modules["./vm/numeric.js"] = function (module, exports, require) {
const { Trap } = __require("./vm/errors.js");

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

  };
  __modules["./vm/memory.js"] = function (module, exports, require) {
const { Trap, ResourceLimitError } = __require("./vm/errors.js");
const { f32FromBits, f64FromBits, f32ToBits, f64ToBits } = __require("./vm/numeric.js");

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

  };
  __modules["./vm/simd.js"] = function (module, exports, require) {
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
} = __require("./vm/numeric.js");

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

  };
  __modules["./vm/gc.js"] = function (module, exports, require) {
const { Trap, ResourceLimitError } = __require("./vm/errors.js");
const { defaultValueForType, normalizeHeapType } = __require("./vm/types.js");
const { f32FromBits, f64FromBits } = __require("./vm/numeric.js");

class WasmI31 {
  constructor(value) {
    this.value = value & 0x7fffffff;
  }
  getSigned() {
    return (this.value << 1) >> 1;
  }
  getUnsigned() {
    return this.value;
  }
}

class WasmStruct {
  constructor(typeDef, fields) {
    this.typeDef = typeDef;
    this.fields = fields;
  }
}

class WasmArray {
  constructor(typeDef, elements) {
    this.typeDef = typeDef;
    this.elements = elements;
  }
}

class WasmHostAny {
  constructor(value) {
    this.value = value;
  }
}

function packStorageValue(storage, value) {
  if (storage.kind === 'packed') {
    if (storage.name === 'i8') return value & 0xff;
    if (storage.name === 'i16') return value & 0xffff;
  }
  if (storage.kind === 'num') {
    if (storage.name === 'i32') return value | 0;
    if (storage.name === 'i64') return BigInt.asIntN(64, value);
  }
  if (storage.kind === 'vec') {
    return Uint8Array.from(value);
  }
  return value;
}

function unpackStorageValue(storage, raw, mode = 'normal') {
  if (storage.kind === 'packed') {
    if (storage.name === 'i8') {
      return mode === 's' ? ((raw << 24) >> 24) : (raw & 0xff);
    }
    if (storage.name === 'i16') {
      return mode === 's' ? ((raw << 16) >> 16) : (raw & 0xffff);
    }
  }
  if (storage.kind === 'vec') {
    return Uint8Array.from(raw);
  }
  return raw;
}

function storageByteSize(storage) {
  if (storage.kind === 'packed') {
    return storage.name === 'i8' ? 1 : 2;
  }
  if (storage.kind === 'num') {
    return (storage.name === 'i64' || storage.name === 'f64') ? 8 : 4;
  }
  if (storage.kind === 'vec') {
    return 16;
  }
  throw new Trap(`Storage type ${storage.name || storage.kind} cannot be initialized from data bytes`);
}

function readStorageFromBytes(storage, view, byteOffset) {
  if (storage.kind === 'packed') {
    return storage.name === 'i8' ? view.getUint8(byteOffset) : view.getUint16(byteOffset, true);
  }
  if (storage.kind === 'num') {
    switch (storage.name) {
      case 'i32': return view.getInt32(byteOffset, true);
      case 'i64': return view.getBigInt64(byteOffset, true);
      case 'f32': return f32FromBits(view.getUint32(byteOffset, true));
      case 'f64': return f64FromBits(view.getBigUint64(byteOffset, true));
    }
  }
  if (storage.kind === 'vec') {
    return new Uint8Array(view.buffer, view.byteOffset + byteOffset, 16).slice();
  }
  throw new Trap(`Unsupported data storage type ${storage.kind}`);
}

function matchesRefType(val, targetType, typeEnv) {
  if (val === null) {
    return Boolean(targetType.nullable);
  }
  const ht = typeof targetType.heapType === 'object' && targetType.heapType !== null
    ? targetType.heapType
    : normalizeHeapType(targetType.heapType);
  const targetDef = typeof ht === 'number' ? typeEnv.get(ht) : (typeof ht === 'object' ? ht : null);

  if (ht === 'none' || ht === 'nofunc' || ht === 'noextern' || ht === 'noexn') {
    return false;
  }

  if (val instanceof WasmI31) {
    return ht === 'i31' || ht === 'eq' || ht === 'any';
  }
  if (val instanceof WasmStruct) {
    if (ht === 'struct' || ht === 'eq' || ht === 'any') return true;
    if (targetDef && targetDef.kind === 'struct') {
      return typeEnv.isHeapSubtype(val.typeDef, targetDef);
    }
    return false;
  }
  if (val instanceof WasmArray) {
    if (ht === 'array' || ht === 'eq' || ht === 'any') return true;
    if (targetDef && targetDef.kind === 'array') {
      return typeEnv.isHeapSubtype(val.typeDef, targetDef);
    }
    return false;
  }
  if (val instanceof WasmHostAny) {
    return ht === 'any';
  }
  if (val && typeof val === 'object' && val.__wasmKind === 'func') {
    if (ht === 'func') return true;
    if (targetDef && targetDef.kind === 'func') {
      return typeEnv.isHeapSubtype(val.typeDef, targetDef);
    }
    return false;
  }
  if (val && typeof val === 'object' && val.__wasmKind === 'exn') {
    return ht === 'exn';
  }
  // External JS values
  if (ht === 'extern') return true;
  return false;
}

function execGC(name, immediates, stack, instance, limits = {}) {
  const typeEnv = instance.typeEnv;
  const chargeGC = (count = 1) => {
    if (limits.maxArrayLength !== undefined && count > limits.maxArrayLength) {
      throw new ResourceLimitError(`GC array length (${count}) exceeds maxArrayLength (${limits.maxArrayLength})`);
    }
    if (instance.gcCount !== undefined && limits.maxGCObjects !== undefined) {
      if (instance.gcCount + 1 > limits.maxGCObjects) {
        throw new ResourceLimitError(`GC allocation count exceeds maxGCObjects (${limits.maxGCObjects})`);
      }
      instance.gcCount++;
    }
  };

  switch (name) {
    case 'ref.i31': {
      const v = stack.pop() | 0;
      stack.push(new WasmI31(v));
      return true;
    }
    case 'i31.get_s': {
      const ref = stack.pop();
      if (ref === null) throw new Trap('null i31 reference');
      stack.push(ref.getSigned());
      return true;
    }
    case 'i31.get_u': {
      const ref = stack.pop();
      if (ref === null) throw new Trap('null i31 reference');
      stack.push(ref.getUnsigned());
      return true;
    }
    case 'struct.new': {
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(typeDef.fields.length);
      const count = typeDef.fields.length;
      const fields = new Array(count);
      for (let i = count - 1; i >= 0; i--) {
        fields[i] = packStorageValue(typeDef.fields[i].storage, stack.pop());
      }
      stack.push(new WasmStruct(typeDef, fields));
      return true;
    }
    case 'struct.new_default': {
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(typeDef.fields.length);
      const fields = typeDef.fields.map(f => packStorageValue(f.storage, defaultValueForType(f.storage)));
      stack.push(new WasmStruct(typeDef, fields));
      return true;
    }
    case 'struct.get':
    case 'struct.get_s':
    case 'struct.get_u': {
      const ref = stack.pop();
      if (ref === null) throw new Trap('null structure reference');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const fieldDef = typeDef.fields[immediates.fieldIndex];
      const mode = name.endsWith('_s') ? 's' : name.endsWith('_u') ? 'u' : 'normal';
      stack.push(unpackStorageValue(fieldDef.storage, ref.fields[immediates.fieldIndex], mode));
      return true;
    }
    case 'struct.set': {
      const val = stack.pop();
      const ref = stack.pop();
      if (ref === null) throw new Trap('null structure reference');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const fieldDef = typeDef.fields[immediates.fieldIndex];
      ref.fields[immediates.fieldIndex] = packStorageValue(fieldDef.storage, val);
      return true;
    }
    case 'array.new': {
      const len = stack.pop() >>> 0;
      const initVal = stack.pop();
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const packed = packStorageValue(typeDef.field.storage, initVal);
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = typeDef.field.storage.kind === 'vec' ? Uint8Array.from(packed) : packed;
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_default': {
      const len = stack.pop() >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const defVal = packStorageValue(typeDef.field.storage, defaultValueForType(typeDef.field.storage));
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = typeDef.field.storage.kind === 'vec' ? Uint8Array.from(defVal) : defVal;
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_fixed': {
      const len = immediates.length >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const elements = new Array(len);
      for (let i = len - 1; i >= 0; i--) {
        elements[i] = packStorageValue(typeDef.field.storage, stack.pop());
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_data': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const seg = instance.dataSegments[immediates.dataIndex];
      const elemSize = storageByteSize(typeDef.field.storage);
      const totalBytes = BigInt(len) * BigInt(elemSize);
      const segLen = seg.dropped ? 0n : BigInt(seg.bytes.byteLength);
      if (BigInt(srcOffset) + totalBytes > segLen) {
        throw new Trap('out of bounds memory access');
      }
      const view = new DataView(seg.bytes.buffer, seg.bytes.byteOffset, seg.bytes.byteLength);
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = readStorageFromBytes(typeDef.field.storage, view, srcOffset + i * elemSize);
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_elem': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const seg = instance.elementSegments[immediates.elementIndex];
      const segLen = seg.dropped ? 0n : BigInt(seg.elements.length);
      if (BigInt(srcOffset) + BigInt(len) > segLen) {
        throw new Trap('out of bounds table access');
      }
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = seg.elements[srcOffset + i];
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.get':
    case 'array.get_s':
    case 'array.get_u': {
      const idx = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      if (idx >= arr.elements.length) throw new Trap('out of bounds array access');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const mode = name.endsWith('_s') ? 's' : name.endsWith('_u') ? 'u' : 'normal';
      stack.push(unpackStorageValue(typeDef.field.storage, arr.elements[idx], mode));
      return true;
    }
    case 'array.set': {
      const val = stack.pop();
      const idx = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      if (idx >= arr.elements.length) throw new Trap('out of bounds array access');
      const typeDef = typeEnv.get(immediates.typeIndex);
      arr.elements[idx] = packStorageValue(typeDef.field.storage, val);
      return true;
    }
    case 'array.len': {
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      stack.push(arr.elements.length | 0);
      return true;
    }
    case 'array.fill': {
      const len = stack.pop() >>> 0;
      const val = stack.pop();
      const offset = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      if (BigInt(offset) + BigInt(len) > BigInt(arr.elements.length)) {
        throw new Trap('out of bounds array access');
      }
      const typeDef = typeEnv.get(immediates.typeIndex);
      const packed = packStorageValue(typeDef.field.storage, val);
      for (let i = 0; i < len; i++) {
        arr.elements[offset + i] = typeDef.field.storage.kind === 'vec' ? Uint8Array.from(packed) : packed;
      }
      return true;
    }
    case 'array.copy': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const srcArr = stack.pop();
      const dstOffset = stack.pop() >>> 0;
      const dstArr = stack.pop();
      if (dstArr === null || srcArr === null) throw new Trap('null array reference');
      if (BigInt(dstOffset) + BigInt(len) > BigInt(dstArr.elements.length) ||
          BigInt(srcOffset) + BigInt(len) > BigInt(srcArr.elements.length)) {
        throw new Trap('out of bounds array access');
      }
      if (len === 0) return true;
      if (dstArr === srcArr && dstOffset > srcOffset) {
        for (let i = len - 1; i >= 0; i--) {
          dstArr.elements[dstOffset + i] = srcArr.elements[srcOffset + i];
        }
      } else {
        for (let i = 0; i < len; i++) {
          dstArr.elements[dstOffset + i] = srcArr.elements[srcOffset + i];
        }
      }
      return true;
    }
    case 'array.init_data': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const dstOffset = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const seg = instance.dataSegments[immediates.dataIndex];
      const elemSize = storageByteSize(typeDef.field.storage);
      const totalBytes = BigInt(len) * BigInt(elemSize);
      const segLen = seg.dropped ? 0n : BigInt(seg.bytes.byteLength);
      if (BigInt(dstOffset) + BigInt(len) > BigInt(arr.elements.length) ||
          BigInt(srcOffset) + totalBytes > segLen) {
        throw new Trap('out of bounds array or data access');
      }
      if (len === 0) return true;
      const view = new DataView(seg.bytes.buffer, seg.bytes.byteOffset, seg.bytes.byteLength);
      for (let i = 0; i < len; i++) {
        arr.elements[dstOffset + i] = readStorageFromBytes(typeDef.field.storage, view, srcOffset + i * elemSize);
      }
      return true;
    }
    case 'array.init_elem': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const dstOffset = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      const seg = instance.elementSegments[immediates.elementIndex];
      const segLen = seg.dropped ? 0n : BigInt(seg.elements.length);
      if (BigInt(dstOffset) + BigInt(len) > BigInt(arr.elements.length) ||
          BigInt(srcOffset) + BigInt(len) > segLen) {
        throw new Trap('out of bounds array or element access');
      }
      for (let i = 0; i < len; i++) {
        arr.elements[dstOffset + i] = seg.elements[srcOffset + i];
      }
      return true;
    }
    case 'ref.test':
    case 'ref.test_null': {
      const val = stack.pop();
      const target = { kind: 'ref', nullable: Boolean(immediates.nullable), heapType: immediates.heapType };
      stack.push(matchesRefType(val, target, typeEnv) ? 1 : 0);
      return true;
    }
    case 'ref.cast':
    case 'ref.cast_null': {
      const val = stack.pop();
      const target = { kind: 'ref', nullable: Boolean(immediates.nullable), heapType: immediates.heapType };
      if (!matchesRefType(val, target, typeEnv)) {
        throw new Trap('cast failure');
      }
      stack.push(val);
      return true;
    }
    case 'any.convert_extern': {
      const val = stack.pop();
      if (val === null) {
        stack.push(null);
      } else if (val instanceof WasmI31 || val instanceof WasmStruct || val instanceof WasmArray || val instanceof WasmHostAny) {
        stack.push(val);
      } else {
        stack.push(new WasmHostAny(val));
      }
      return true;
    }
    case 'extern.convert_any': {
      const val = stack.pop();
      if (val === null) {
        stack.push(null);
      } else if (val instanceof WasmHostAny) {
        stack.push(val.value);
      } else {
        stack.push(val);
      }
      return true;
    }
    default:
      return false;
  }
}

module.exports = {
  WasmI31,
  WasmStruct,
  WasmArray,
  WasmHostAny,
  packStorageValue,
  unpackStorageValue,
  matchesRefType,
  execGC
};

  };
  __modules["./vm/validate.js"] = function (module, exports, require) {
const { ValidationError, ResourceLimitError } = __require("./vm/errors.js");
const {
  BOT_TYPE,
  I32_TYPE,
  I64_TYPE,
  F32_TYPE,
  F64_TYPE,
  V128_TYPE,
  normalizeValType,
  normalizeHeapType,
  formatValType,
  isDefaultable,
  heapHierarchy,
  TypeEnvironment
} = __require("./vm/types.js");

const DEFAULT_LIMITS = Object.freeze({
  maxModuleBytes: 64 * 1024 * 1024,
  maxTypes: 100000,
  maxFunctions: 100000,
  maxTables: 100,
  maxMemories: 100,
  maxGlobals: 100000,
  maxTags: 10000,
  maxImports: 100000,
  maxExports: 100000,
  maxDataSegments: 100000,
  maxElementSegments: 100000,
  maxLocals: 50000,
  maxInstructionsPerFunction: 500000,
  maxControlDepth: 10000
});

function unpackedValType(storage) {
  const s = normalizeValType(storage);
  if (s.kind === 'packed') return I32_TYPE;
  return s;
}

function blockSignature(blockType, typeEnv) {
  if (!blockType || blockType.kind === 'empty') {
    return { params: [], results: [] };
  }
  if (blockType.kind === 'value') {
    return { params: [], results: [normalizeValType(blockType.valueType)] };
  }
  if (blockType.kind === 'type') {
    const def = typeEnv.get(blockType.typeIndex);
    if (def.kind !== 'func') {
      throw new ValidationError(`Block type index ${blockType.typeIndex} is not a function type`);
    }
    return { params: def.params, results: def.results };
  }
  throw new ValidationError(`Invalid block type: ${JSON.stringify(blockType)}`);
}

function validateConstantExpression(expr, expectedType, ctx) {
  const { typeEnv, globals, importedGlobalCount, functions, declaredFunctions } = ctx;
  const stack = [];
  const instructions = expr.instructions || [];
  if (instructions.length === 0 || instructions[instructions.length - 1].name !== 'end') {
    throw new ValidationError('Constant expression must end with end', { offset: expr.offset });
  }
  for (let i = 0; i < instructions.length - 1; i++) {
    const ins = instructions[i];
    const { name, immediates, offset } = ins;
    switch (name) {
      case 'i32.const':
        stack.push(I32_TYPE);
        break;
      case 'i64.const':
        stack.push(I64_TYPE);
        break;
      case 'f32.const':
        stack.push(F32_TYPE);
        break;
      case 'f64.const':
        stack.push(F64_TYPE);
        break;
      case 'v128.const':
        stack.push(V128_TYPE);
        break;
      case 'ref.null': {
        const ht = normalizeHeapType(immediates.heapType);
        if (typeof ht === 'number') typeEnv.get(ht);
        stack.push({ kind: 'ref', nullable: true, heapType: ht });
        break;
      }
      case 'ref.func': {
        const funcIdx = immediates.functionIndex;
        if (funcIdx < 0 || funcIdx >= functions.length) {
          throw new ValidationError(`Function index ${funcIdx} out of bounds in constant expression`, { offset });
        }
        if (declaredFunctions) declaredFunctions.add(funcIdx);
        stack.push({ kind: 'ref', nullable: false, heapType: functions[funcIdx].typeIndex });
        break;
      }
      case 'global.get': {
        const gIdx = immediates.globalIndex;
        if (gIdx < 0 || gIdx >= ctx.visibleGlobalsCount) {
          throw new ValidationError(`Global index ${gIdx} out of bounds in constant expression`, { offset });
        }
        const g = globals[gIdx];
        if (g.mutable) {
          throw new ValidationError(`Constant expression cannot reference mutable global ${gIdx}`, { offset });
        }
        stack.push(g.valType);
        break;
      }
      case 'ref.i31': {
        const top = stack.pop();
        if (!top || !typeEnv.isValueSubtype(top, I32_TYPE)) {
          throw new ValidationError('ref.i31 in constant expression requires i32', { offset });
        }
        stack.push({ kind: 'ref', nullable: false, heapType: 'i31' });
        break;
      }
      case 'struct.new': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'struct') throw new ValidationError('struct.new requires struct type', { offset });
        for (let f = def.fields.length - 1; f >= 0; f--) {
          const got = stack.pop();
          const want = unpackedValType(def.fields[f].storage);
          if (!got || !typeEnv.isValueSubtype(got, want)) {
            throw new ValidationError('struct.new field type mismatch in constant expression', { offset });
          }
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'struct.new_default': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'struct') throw new ValidationError('struct.new_default requires struct type', { offset });
        for (const field of def.fields) {
          if (!isDefaultable(field.storage)) {
            throw new ValidationError('struct.new_default on non-defaultable field', { offset });
          }
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'array.new': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'array') throw new ValidationError('array.new requires array type', { offset });
        const lenType = stack.pop();
        const elemType = stack.pop();
        if (!lenType || !typeEnv.isValueSubtype(lenType, I32_TYPE) ||
            !elemType || !typeEnv.isValueSubtype(elemType, unpackedValType(def.field.storage))) {
          throw new ValidationError('array.new type mismatch in constant expression', { offset });
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'array.new_default': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'array') throw new ValidationError('array.new_default requires array type', { offset });
        if (!isDefaultable(def.field.storage)) {
          throw new ValidationError('array.new_default on non-defaultable element', { offset });
        }
        const lenType = stack.pop();
        if (!lenType || !typeEnv.isValueSubtype(lenType, I32_TYPE)) {
          throw new ValidationError('array.new_default requires i32 length', { offset });
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'array.new_fixed': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'array') throw new ValidationError('array.new_fixed requires array type', { offset });
        const want = unpackedValType(def.field.storage);
        for (let k = 0; k < immediates.length; k++) {
          const got = stack.pop();
          if (!got || !typeEnv.isValueSubtype(got, want)) {
            throw new ValidationError('array.new_fixed element type mismatch in constant expression', { offset });
          }
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'any.convert_extern': {
        const got = stack.pop();
        if (!got || !typeEnv.isValueSubtype(got, { kind: 'ref', nullable: true, heapType: 'extern' })) {
          throw new ValidationError('any.convert_extern type mismatch in constant expression', { offset });
        }
        stack.push({ kind: 'ref', nullable: got.nullable, heapType: 'any' });
        break;
      }
      case 'extern.convert_any': {
        const got = stack.pop();
        if (!got || !typeEnv.isValueSubtype(got, { kind: 'ref', nullable: true, heapType: 'any' })) {
          throw new ValidationError('extern.convert_any type mismatch in constant expression', { offset });
        }
        stack.push({ kind: 'ref', nullable: got.nullable, heapType: 'extern' });
        break;
      }
      case 'i32.add':
      case 'i32.sub':
      case 'i32.mul': {
        const b = stack.pop(), a = stack.pop();
        if (!a || !b || !typeEnv.isValueSubtype(a, I32_TYPE) || !typeEnv.isValueSubtype(b, I32_TYPE)) {
          throw new ValidationError(`${name} requires [i32, i32] in constant expression`, { offset });
        }
        stack.push(I32_TYPE);
        break;
      }
      case 'i64.add':
      case 'i64.sub':
      case 'i64.mul': {
        const b = stack.pop(), a = stack.pop();
        if (!a || !b || !typeEnv.isValueSubtype(a, I64_TYPE) || !typeEnv.isValueSubtype(b, I64_TYPE)) {
          throw new ValidationError(`${name} requires [i64, i64] in constant expression`, { offset });
        }
        stack.push(I64_TYPE);
        break;
      }
      default:
        throw new ValidationError(`Instruction ${name} is not valid in a constant expression`, { offset, instruction: name });
    }
  }
  if (stack.length !== 1 || !typeEnv.isValueSubtype(stack[0], expectedType)) {
    throw new ValidationError(
      `Constant expression type mismatch: expected ${formatValType(expectedType)}, got ${stack.length === 1 ? formatValType(stack[0]) : `[${stack.map(formatValType).join(', ')}]`}`,
      { offset: expr.offset }
    );
  }
}

function validateFunctionBody(body, funcIndex, funcType, moduleCtx, options) {
  const {
    typeEnv,
    functions,
    tables,
    memories,
    globals,
    tags,
    dataSegments,
    elementSegments,
    dataCountSection,
    declaredFunctions
  } = moduleCtx;
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const legacyExceptions = options.legacyExceptions !== false;

  const localTypes = [...funcType.params];
  for (const decl of body.locals) {
    if (localTypes.length + decl.count > limits.maxLocals) {
      throw new ResourceLimitError(`Function ${funcIndex} exceeds maxLocals (${limits.maxLocals})`, {
        functionIndex: funcIndex,
        offset: body.offset
      });
    }
    const vt = normalizeValType(decl.valType);
    if (vt.kind === 'ref' && typeof vt.heapType === 'number') typeEnv.get(vt.heapType);
    for (let i = 0; i < decl.count; i++) localTypes.push(vt);
  }

  const instructions = body.instructions;
  if (instructions.length > limits.maxInstructionsPerFunction) {
    throw new ResourceLimitError(
      `Function ${funcIndex} instruction count (${instructions.length}) exceeds maxInstructionsPerFunction (${limits.maxInstructionsPerFunction})`,
      { functionIndex: funcIndex, offset: body.offset }
    );
  }

  // Track non-defaultable local initialization
  const initLocals = localTypes.map((vt, idx) => idx < funcType.params.length || isDefaultable(vt));

  const valStack = [];
  const ctrlStack = [];
  const jumpTable = new Array(instructions.length);

  function fail(ins, msg) {
    throw new ValidationError(`Function ${funcIndex} (${ins ? ins.name : 'body'}): ${msg}`, {
      functionIndex: funcIndex,
      instruction: ins ? ins.name : undefined,
      opcode: ins ? ins.opcode : undefined,
      offset: ins ? ins.offset : body.offset
    });
  }

  function pushCtrl(kind, params, results, startPc, extra = {}) {
    if (ctrlStack.length + 1 > limits.maxControlDepth) {
      throw new ResourceLimitError(`Control depth exceeds maxControlDepth (${limits.maxControlDepth})`, {
        functionIndex: funcIndex,
        offset: instructions[startPc]?.offset
      });
    }
    const frame = {
      kind,
      params,
      results,
      height: valStack.length,
      unreachable: false,
      startPc,
      initSnapshot: initLocals.slice(),
      ...extra
    };
    ctrlStack.push(frame);
    pushVals(params);
    return frame;
  }

  function currentCtrl() {
    return ctrlStack[ctrlStack.length - 1];
  }

  function pushVal(vt) {
    valStack.push(normalizeValType(vt));
  }

  function pushVals(types) {
    for (const t of types) pushVal(t);
  }

  function popVal(ins, expected) {
    const frame = currentCtrl();
    if (valStack.length === frame.height) {
      if (frame.unreachable) return BOT_TYPE;
      fail(ins, `type mismatch: operand stack underflow (expected ${expected ? formatValType(expected) : 'value'})`);
    }
    const actual = valStack.pop();
    if (expected !== undefined && !typeEnv.isValueSubtype(actual, expected)) {
      fail(ins, `type mismatch: expected ${formatValType(expected)}, got ${formatValType(actual)}`);
    }
    return actual;
  }

  function popVals(ins, expectedTypes) {
    const popped = new Array(expectedTypes.length);
    for (let i = expectedTypes.length - 1; i >= 0; i--) {
      popped[i] = popVal(ins, expectedTypes[i]);
    }
    return popped;
  }

  function labelTypes(frame) {
    return frame.kind === 'loop' ? frame.params : frame.results;
  }

  function markUnreachable() {
    const frame = currentCtrl();
    valStack.length = frame.height;
    frame.unreachable = true;
  }

  function getLabelFrame(ins, depth) {
    if (depth < 0 || depth >= ctrlStack.length) {
      fail(ins, `unknown label depth ${depth}`);
    }
    return ctrlStack[ctrlStack.length - 1 - depth];
  }

  function requireMemory(ins, memIdx = 0) {
    if (memIdx < 0 || memIdx >= memories.length) {
      fail(ins, `unknown memory ${memIdx}`);
    }
  }

  function requireDataCount(ins, dataIdx) {
    if (dataCountSection === null) {
      fail(ins, `${ins.name} requires a DataCount section`);
    }
    if (dataIdx < 0 || dataIdx >= dataSegments.length) {
      fail(ins, `unknown data segment ${dataIdx}`);
    }
  }

  // Push outer function control frame
  pushCtrl('function', [], funcType.results, -1);

  for (let pc = 0; pc < instructions.length; pc++) {
    const ins = instructions[pc];
    const { name, opcode, immediates } = ins;

    switch (name) {
      case 'unreachable':
        markUnreachable();
        break;
      case 'nop':
        break;
      case 'block':
      case 'loop': {
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVals(ins, sig.params);
        const frame = pushCtrl(name, sig.params, sig.results, pc);
        jumpTable[pc] = {
          kind: name,
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height
        };
        break;
      }
      case 'if': {
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVal(ins, I32_TYPE);
        popVals(ins, sig.params);
        const frame = pushCtrl('if', sig.params, sig.results, pc, { hasElse: false, elsePc: null });
        jumpTable[pc] = {
          kind: 'if',
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height,
          elsePc: null,
          endPc: null
        };
        break;
      }
      case 'else': {
        const frame = currentCtrl();
        if (frame.kind !== 'if' || frame.hasElse) {
          fail(ins, 'misplaced else');
        }
        popVals(ins, frame.results);
        if (valStack.length !== frame.height) {
          fail(ins, 'extra values on stack at else');
        }
        frame.hasElse = true;
        frame.elsePc = pc;
        frame.unreachable = false;
        for (let i = 0; i < initLocals.length; i++) initLocals[i] = frame.initSnapshot[i];
        pushVals(frame.params);
        if (jumpTable[frame.startPc]) jumpTable[frame.startPc].elsePc = pc;
        jumpTable[pc] = {
          kind: 'else',
          ifPc: frame.startPc,
          paramCount: frame.params.length,
          resultCount: frame.results.length,
          stackHeight: frame.height,
          endPc: null
        };
        break;
      }
      case 'try': {
        if (!legacyExceptions) {
          fail(ins, 'legacy try instruction is disabled');
        }
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVals(ins, sig.params);
        const frame = pushCtrl('try', sig.params, sig.results, pc, {
          inCatch: false,
          seenCatchAll: false,
          handlers: []
        });
        jumpTable[pc] = {
          kind: 'try',
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height,
          handlers: frame.handlers,
          endPc: null
        };
        break;
      }
      case 'catch':
      case 'catch_all': {
        if (!legacyExceptions) {
          fail(ins, `legacy ${name} instruction is disabled`);
        }
        const frame = currentCtrl();
        if (frame.kind !== 'try' || frame.seenCatchAll) {
          fail(ins, `misplaced ${name}`);
        }
        popVals(ins, frame.results);
        if (valStack.length !== frame.height) {
          fail(ins, `extra values on stack before ${name}`);
        }
        frame.inCatch = true;
        frame.unreachable = false;
        for (let i = 0; i < initLocals.length; i++) initLocals[i] = frame.initSnapshot[i];
        if (name === 'catch') {
          const tagIdx = immediates.tagIndex;
          if (tagIdx < 0 || tagIdx >= tags.length) fail(ins, `unknown tag ${tagIdx}`);
          const tagType = tags[tagIdx].funcType;
          pushVals(tagType.params);
          frame.handlers.push({ kind: 'catch', tagIndex: tagIdx, targetPc: pc + 1, arity: tagType.params.length });
        } else {
          frame.seenCatchAll = true;
          frame.handlers.push({ kind: 'catch_all', targetPc: pc + 1, arity: 0 });
        }
        jumpTable[pc] = {
          kind: name,
          tryPc: frame.startPc,
          resultCount: frame.results.length,
          stackHeight: frame.height,
          endPc: null
        };
        break;
      }
      case 'try_table': {
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVals(ins, sig.params);
        // Validate catch clauses in surrounding label context (before pushing try_table)
        const resolvedCatches = [];
        for (const c of immediates.catches) {
          const targetFrame = getLabelFrame(ins, c.labelIndex);
          const targetTypes = labelTypes(targetFrame);
          let expectedTypes;
          if (c.kind === 0 || c.kind === 1) {
            if (c.tagIndex < 0 || c.tagIndex >= tags.length) {
              fail(ins, `unknown tag ${c.tagIndex} in try_table`);
            }
            const tagParams = tags[c.tagIndex].funcType.params;
            expectedTypes = c.kind === 0
              ? tagParams
              : [...tagParams, { kind: 'ref', nullable: false, heapType: 'exn' }];
          } else if (c.kind === 2) {
            expectedTypes = [];
          } else if (c.kind === 3) {
            expectedTypes = [{ kind: 'ref', nullable: false, heapType: 'exn' }];
          } else {
            fail(ins, `invalid catch kind ${c.kind}`);
          }
          if (expectedTypes.length !== targetTypes.length) {
            fail(ins, `try_table catch label arity mismatch: expected ${targetTypes.length}, got ${expectedTypes.length}`);
          }
          for (let i = 0; i < expectedTypes.length; i++) {
            if (!typeEnv.isValueSubtype(expectedTypes[i], targetTypes[i])) {
              fail(ins, `try_table catch type mismatch at index ${i}`);
            }
          }
          resolvedCatches.push({
            kind: c.kind,
            tagIndex: c.tagIndex,
            labelIndex: c.labelIndex,
            targetStartPc: targetFrame.startPc,
            targetKind: targetFrame.kind,
            stackHeight: targetFrame.height,
            arity: targetTypes.length
          });
        }
        const frame = pushCtrl('try_table', sig.params, sig.results, pc, { catches: resolvedCatches });
        jumpTable[pc] = {
          kind: 'try_table',
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height,
          catches: resolvedCatches,
          endPc: null
        };
        break;
      }
      case 'end': {
        const frame = currentCtrl();
        if (frame.kind === 'if' && !frame.hasElse) {
          // Implicit empty else branch must satisfy params -> results
          if (frame.params.length !== frame.results.length) {
            fail(ins, 'if without else has mismatched parameter and result arity');
          }
          for (let i = 0; i < frame.params.length; i++) {
            if (!typeEnv.isValueSubtype(frame.params[i], frame.results[i])) {
              fail(ins, 'if without else type mismatch');
            }
          }
        }
        popVals(ins, frame.results);
        if (valStack.length !== frame.height) {
          fail(ins, `type mismatch: extra values on stack at end of ${frame.kind} (expected height ${frame.height}, got ${valStack.length})`);
        }
        ctrlStack.pop();
        for (let i = 0; i < initLocals.length; i++) initLocals[i] = frame.initSnapshot[i];
        if (frame.startPc >= 0 && jumpTable[frame.startPc]) {
          jumpTable[frame.startPc].endPc = pc;
          if (frame.kind === 'if' && frame.elsePc !== null && jumpTable[frame.elsePc]) {
            jumpTable[frame.elsePc].endPc = pc;
          }
          if (frame.kind === 'try') {
            for (let p = frame.startPc + 1; p < pc; p++) {
              if (jumpTable[p] && jumpTable[p].tryPc === frame.startPc) {
                jumpTable[p].endPc = pc;
              }
            }
          }
        }
        jumpTable[pc] = {
          kind: 'end',
          blockKind: frame.kind,
          startPc: frame.startPc,
          resultCount: frame.results.length,
          stackHeight: frame.height
        };
        if (ctrlStack.length > 0) {
          pushVals(frame.results);
        }
        break;
      }
      case 'br': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        popVals(ins, types);
        jumpTable[pc] = {
          kind: 'br',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        markUnreachable();
        break;
      }
      case 'br_if': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        popVal(ins, I32_TYPE);
        popVals(ins, types);
        pushVals(types);
        jumpTable[pc] = {
          kind: 'br_if',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        break;
      }
      case 'br_table': {
        popVal(ins, I32_TYPE);
        const defaultFrame = getLabelFrame(ins, immediates.defaultTarget);
        const defaultTypes = labelTypes(defaultFrame);
        const arity = defaultTypes.length;
        const targetsMeta = [];
        for (const depth of [...immediates.targets, immediates.defaultTarget]) {
          const tFrame = getLabelFrame(ins, depth);
          const tTypes = labelTypes(tFrame);
          if (tTypes.length !== arity) {
            fail(ins, `br_table target arity mismatch: expected ${arity}, got ${tTypes.length}`);
          }
          // Verify current stack has subtypes for each target without consuming until after loop
          for (let i = 0; i < arity; i++) {
            const stackIndex = valStack.length - arity + i;
            if (stackIndex < currentCtrl().height) {
              if (!currentCtrl().unreachable) fail(ins, 'br_table stack underflow');
            } else if (!typeEnv.isValueSubtype(valStack[stackIndex], tTypes[i])) {
              fail(ins, `br_table target type mismatch at index ${i}`);
            }
          }
          targetsMeta.push({
            labelIndex: depth,
            targetStartPc: tFrame.startPc,
            targetKind: tFrame.kind,
            arity,
            stackHeight: tFrame.height
          });
        }
        popVals(ins, defaultTypes);
        jumpTable[pc] = {
          kind: 'br_table',
          targets: targetsMeta.slice(0, -1),
          defaultTarget: targetsMeta[targetsMeta.length - 1]
        };
        markUnreachable();
        break;
      }
      case 'br_on_null': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        const refVal = popVal(ins);
        if (refVal.kind !== 'ref' && refVal.kind !== 'bot') {
          fail(ins, `br_on_null requires reference type, got ${formatValType(refVal)}`);
        }
        popVals(ins, types);
        pushVals(types);
        pushVal(refVal.kind === 'bot' ? BOT_TYPE : { kind: 'ref', nullable: false, heapType: refVal.heapType });
        jumpTable[pc] = {
          kind: 'br_on_null',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        break;
      }
      case 'br_on_non_null': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        if (types.length === 0) {
          fail(ins, 'br_on_non_null target label must expect at least one reference value');
        }
        const refVal = popVal(ins);
        if (refVal.kind !== 'ref' && refVal.kind !== 'bot') {
          fail(ins, `br_on_non_null requires reference type, got ${formatValType(refVal)}`);
        }
        const nonNullRef = refVal.kind === 'bot' ? BOT_TYPE : { kind: 'ref', nullable: false, heapType: refVal.heapType };
        const prefixTypes = types.slice(0, -1);
        const lastTargetType = types[types.length - 1];
        if (!typeEnv.isValueSubtype(nonNullRef, lastTargetType)) {
          fail(ins, `br_on_non_null reference ${formatValType(nonNullRef)} does not match target ${formatValType(lastTargetType)}`);
        }
        popVals(ins, prefixTypes);
        pushVals(prefixTypes);
        jumpTable[pc] = {
          kind: 'br_on_non_null',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        break;
      }
      case 'br_on_cast':
      case 'br_on_cast_fail': {
        const sourceType = normalizeValType(immediates.sourceType);
        const targetType = normalizeValType(immediates.targetType);
        if (!typeEnv.isValueSubtype(targetType, sourceType)) {
          fail(ins, `${name} target type ${formatValType(targetType)} is not a subtype of source type ${formatValType(sourceType)}`);
        }
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        if (types.length === 0) {
          fail(ins, `${name} target label must expect at least one value`);
        }
        const diffType = {
          kind: 'ref',
          nullable: sourceType.nullable && !targetType.nullable,
          heapType: sourceType.heapType
        };
        const branchRefType = name === 'br_on_cast' ? targetType : diffType;
        const fallthroughRefType = name === 'br_on_cast' ? diffType : targetType;
        const lastTargetType = types[types.length - 1];
        if (!typeEnv.isValueSubtype(branchRefType, lastTargetType)) {
          fail(ins, `${name} branch type ${formatValType(branchRefType)} is not a subtype of label type ${formatValType(lastTargetType)}`);
        }
        const prefixTypes = types.slice(0, -1);
        popVal(ins, sourceType);
        popVals(ins, prefixTypes);
        pushVals(prefixTypes);
        pushVal(fallthroughRefType);
        jumpTable[pc] = {
          kind: name,
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height,
          targetType
        };
        break;
      }
      case 'return': {
        popVals(ins, funcType.results);
        markUnreachable();
        break;
      }
      case 'call':
      case 'return_call': {
        const fnIdx = immediates.functionIndex;
        if (fnIdx < 0 || fnIdx >= functions.length) fail(ins, `unknown function ${fnIdx}`);
        const calleeType = functions[fnIdx].funcType;
        popVals(ins, calleeType.params);
        if (name === 'return_call') {
          if (calleeType.results.length !== funcType.results.length) {
            fail(ins, 'return_call result arity mismatch');
          }
          for (let i = 0; i < calleeType.results.length; i++) {
            if (!typeEnv.isValueSubtype(calleeType.results[i], funcType.results[i])) {
              fail(ins, 'return_call result type mismatch');
            }
          }
          markUnreachable();
        } else {
          pushVals(calleeType.results);
        }
        break;
      }
      case 'call_indirect':
      case 'return_call_indirect': {
        const tblIdx = immediates.tableIndex;
        if (tblIdx < 0 || tblIdx >= tables.length) fail(ins, `unknown table ${tblIdx}`);
        if (!typeEnv.isValueSubtype(tables[tblIdx].elemType, { kind: 'ref', nullable: true, heapType: 'func' })) {
          fail(ins, `call_indirect table ${tblIdx} element type must be a funcref subtype`);
        }
        const calleeType = typeEnv.get(immediates.typeIndex);
        if (calleeType.kind !== 'func') fail(ins, `type ${immediates.typeIndex} is not a function type`);
        popVal(ins, I32_TYPE);
        popVals(ins, calleeType.params);
        if (name === 'return_call_indirect') {
          if (calleeType.results.length !== funcType.results.length) {
            fail(ins, 'return_call_indirect result arity mismatch');
          }
          for (let i = 0; i < calleeType.results.length; i++) {
            if (!typeEnv.isValueSubtype(calleeType.results[i], funcType.results[i])) {
              fail(ins, 'return_call_indirect result type mismatch');
            }
          }
          markUnreachable();
        } else {
          pushVals(calleeType.results);
        }
        break;
      }
      case 'call_ref':
      case 'return_call_ref': {
        const calleeType = typeEnv.get(immediates.typeIndex);
        if (calleeType.kind !== 'func') fail(ins, `type ${immediates.typeIndex} is not a function type`);
        popVal(ins, { kind: 'ref', nullable: true, heapType: immediates.typeIndex });
        popVals(ins, calleeType.params);
        if (name === 'return_call_ref') {
          if (calleeType.results.length !== funcType.results.length) {
            fail(ins, 'return_call_ref result arity mismatch');
          }
          for (let i = 0; i < calleeType.results.length; i++) {
            if (!typeEnv.isValueSubtype(calleeType.results[i], funcType.results[i])) {
              fail(ins, 'return_call_ref result type mismatch');
            }
          }
          markUnreachable();
        } else {
          pushVals(calleeType.results);
        }
        break;
      }
      case 'throw': {
        const tagIdx = immediates.tagIndex;
        if (tagIdx < 0 || tagIdx >= tags.length) fail(ins, `unknown tag ${tagIdx}`);
        popVals(ins, tags[tagIdx].funcType.params);
        markUnreachable();
        break;
      }
      case 'throw_ref': {
        popVal(ins, { kind: 'ref', nullable: true, heapType: 'exn' });
        markUnreachable();
        break;
      }
      case 'rethrow': {
        if (!legacyExceptions) fail(ins, 'legacy rethrow instruction is disabled');
        const target = getLabelFrame(ins, immediates.labelIndex);
        if (target.kind !== 'try' || !target.inCatch) {
          fail(ins, 'rethrow target is not an enclosing catch block');
        }
        jumpTable[pc] = {
          kind: 'rethrow',
          labelIndex: immediates.labelIndex,
          targetTryPc: target.startPc
        };
        markUnreachable();
        break;
      }
      case 'drop':
        popVal(ins);
        break;
      case 'select': {
        popVal(ins, I32_TYPE);
        const t2 = popVal(ins);
        const t1 = popVal(ins);
        if (t1.kind === 'bot') {
          pushVal(t2);
        } else if (t2.kind === 'bot') {
          pushVal(t1);
        } else {
          const isNumOrVec1 = t1.kind === 'num' || t1.kind === 'vec';
          const isNumOrVec2 = t2.kind === 'num' || t2.kind === 'vec';
          if (!isNumOrVec1 || !isNumOrVec2 || t1.name !== t2.name) {
            fail(ins, `untyped select requires matching numeric/vector types, got ${formatValType(t1)} and ${formatValType(t2)}`);
          }
          pushVal(t1);
        }
        break;
      }
      case 'select_t': {
        if (!immediates.types || immediates.types.length !== 1) {
          fail(ins, 'select_t requires exactly 1 result type');
        }
        const expected = normalizeValType(immediates.types[0]);
        popVal(ins, I32_TYPE);
        popVal(ins, expected);
        popVal(ins, expected);
        pushVal(expected);
        break;
      }
      case 'local.get': {
        const idx = immediates.localIndex;
        if (idx < 0 || idx >= localTypes.length) fail(ins, `unknown local ${idx}`);
        if (!initLocals[idx]) fail(ins, `uninitialized non-defaultable local ${idx}`);
        pushVal(localTypes[idx]);
        break;
      }
      case 'local.set': {
        const idx = immediates.localIndex;
        if (idx < 0 || idx >= localTypes.length) fail(ins, `unknown local ${idx}`);
        popVal(ins, localTypes[idx]);
        initLocals[idx] = true;
        break;
      }
      case 'local.tee': {
        const idx = immediates.localIndex;
        if (idx < 0 || idx >= localTypes.length) fail(ins, `unknown local ${idx}`);
        popVal(ins, localTypes[idx]);
        initLocals[idx] = true;
        pushVal(localTypes[idx]);
        break;
      }
      case 'global.get': {
        const idx = immediates.globalIndex;
        if (idx < 0 || idx >= globals.length) fail(ins, `unknown global ${idx}`);
        pushVal(globals[idx].valType);
        break;
      }
      case 'global.set': {
        const idx = immediates.globalIndex;
        if (idx < 0 || idx >= globals.length) fail(ins, `unknown global ${idx}`);
        if (!globals[idx].mutable) fail(ins, `global ${idx} is immutable`);
        popVal(ins, globals[idx].valType);
        break;
      }
      case 'table.get': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, I32_TYPE);
        pushVal(tables[idx].elemType);
        break;
      }
      case 'table.set': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, tables[idx].elemType);
        popVal(ins, I32_TYPE);
        break;
      }
      case 'table.size': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        pushVal(I32_TYPE);
        break;
      }
      case 'table.grow': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, I32_TYPE);
        popVal(ins, tables[idx].elemType);
        pushVal(I32_TYPE);
        break;
      }
      case 'table.fill': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, I32_TYPE);
        popVal(ins, tables[idx].elemType);
        popVal(ins, I32_TYPE);
        break;
      }
      case 'table.copy': {
        const dst = immediates.destinationTable;
        const src = immediates.sourceTable;
        if (dst < 0 || dst >= tables.length) fail(ins, `unknown destination table ${dst}`);
        if (src < 0 || src >= tables.length) fail(ins, `unknown source table ${src}`);
        if (!typeEnv.isValueSubtype(tables[src].elemType, tables[dst].elemType)) {
          fail(ins, 'table.copy element type mismatch');
        }
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'table.init': {
        const tblIdx = immediates.tableIndex;
        const elemIdx = immediates.elementIndex;
        if (tblIdx < 0 || tblIdx >= tables.length) fail(ins, `unknown table ${tblIdx}`);
        if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
        if (!typeEnv.isValueSubtype(elementSegments[elemIdx].elemType, tables[tblIdx].elemType)) {
          fail(ins, 'table.init element type mismatch');
        }
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'elem.drop': {
        const elemIdx = immediates.elementIndex;
        if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
        break;
      }
      case 'memory.size': {
        requireMemory(ins, immediates.memoryIndex);
        pushVal(I32_TYPE);
        break;
      }
      case 'memory.grow': {
        requireMemory(ins, immediates.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(I32_TYPE);
        break;
      }
      case 'memory.fill': {
        requireMemory(ins, immediates.memoryIndex);
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'memory.copy': {
        requireMemory(ins, immediates.destinationMemory);
        requireMemory(ins, immediates.sourceMemory);
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'memory.init': {
        requireMemory(ins, immediates.memoryIndex);
        requireDataCount(ins, immediates.dataIndex);
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'data.drop': {
        requireDataCount(ins, immediates.dataIndex);
        break;
      }
      case 'ref.null': {
        const ht = normalizeHeapType(immediates.heapType);
        if (typeof ht === 'number') typeEnv.get(ht);
        pushVal({ kind: 'ref', nullable: true, heapType: ht });
        break;
      }
      case 'ref.is_null': {
        const v = popVal(ins);
        if (v.kind !== 'ref' && v.kind !== 'bot') fail(ins, 'ref.is_null requires a reference type');
        pushVal(I32_TYPE);
        break;
      }
      case 'ref.as_non_null': {
        const v = popVal(ins);
        if (v.kind === 'bot') {
          pushVal(BOT_TYPE);
        } else if (v.kind === 'ref') {
          pushVal({ kind: 'ref', nullable: false, heapType: v.heapType });
        } else {
          fail(ins, 'ref.as_non_null requires a reference type');
        }
        break;
      }
      case 'ref.eq': {
        const eqRef = { kind: 'ref', nullable: true, heapType: 'eq' };
        popVal(ins, eqRef);
        popVal(ins, eqRef);
        pushVal(I32_TYPE);
        break;
      }
      case 'ref.func': {
        const fnIdx = immediates.functionIndex;
        if (fnIdx < 0 || fnIdx >= functions.length) fail(ins, `unknown function ${fnIdx}`);
        if (declaredFunctions && !declaredFunctions.has(fnIdx)) {
          fail(ins, `undeclared function reference ${fnIdx}`);
        }
        pushVal({ kind: 'ref', nullable: false, heapType: functions[fnIdx].typeIndex });
        break;
      }

      // Constants
      case 'i32.const': pushVal(I32_TYPE); break;
      case 'i64.const': pushVal(I64_TYPE); break;
      case 'f32.const': pushVal(F32_TYPE); break;
      case 'f64.const': pushVal(F64_TYPE); break;

      // Scalar loads & stores
      case 'i32.load':
      case 'i32.load8_s':
      case 'i32.load8_u':
      case 'i32.load16_s':
      case 'i32.load16_u':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(I32_TYPE);
        break;
      case 'i64.load':
      case 'i64.load8_s':
      case 'i64.load8_u':
      case 'i64.load16_s':
      case 'i64.load16_u':
      case 'i64.load32_s':
      case 'i64.load32_u':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(I64_TYPE);
        break;
      case 'f32.load':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(F32_TYPE);
        break;
      case 'f64.load':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(F64_TYPE);
        break;
      case 'i32.store':
      case 'i32.store8':
      case 'i32.store16':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, I32_TYPE]);
        break;
      case 'i64.store':
      case 'i64.store8':
      case 'i64.store16':
      case 'i64.store32':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, I64_TYPE]);
        break;
      case 'f32.store':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, F32_TYPE]);
        break;
      case 'f64.store':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, F64_TYPE]);
        break;

      default: {
        if (opcode === 0xfb) {
          validateGCInstruction(ins, { typeEnv, dataSegments, elementSegments, requireDataCount, popVal, popVals, pushVal, fail });
        } else if (opcode === 0xfd) {
          validateSIMDInstruction(ins, { requireMemory, popVal, popVals, pushVal, fail });
        } else {
          validateScalarNumericInstruction(ins, { popVal, popVals, pushVal, fail });
        }
        break;
      }
    }
  }

  if (ctrlStack.length !== 0) {
    throw new ValidationError(`Function ${funcIndex}: unclosed control frames at end of body`, {
      functionIndex: funcIndex,
      offset: body.endOffset
    });
  }

  return {
    localTypes,
    jumpTable
  };
}

function validateScalarNumericInstruction(ins, { popVal, popVals, pushVal, fail }) {
  const { name } = ins;
  switch (name) {
    case 'i32.eqz':
    case 'i32.clz':
    case 'i32.ctz':
    case 'i32.popcnt':
    case 'i32.extend8_s':
    case 'i32.extend16_s':
      popVal(ins, I32_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i32.eq':
    case 'i32.ne':
    case 'i32.lt_s':
    case 'i32.lt_u':
    case 'i32.gt_s':
    case 'i32.gt_u':
    case 'i32.le_s':
    case 'i32.le_u':
    case 'i32.ge_s':
    case 'i32.ge_u':
    case 'i32.add':
    case 'i32.sub':
    case 'i32.mul':
    case 'i32.div_s':
    case 'i32.div_u':
    case 'i32.rem_s':
    case 'i32.rem_u':
    case 'i32.and':
    case 'i32.or':
    case 'i32.xor':
    case 'i32.shl':
    case 'i32.shr_s':
    case 'i32.shr_u':
    case 'i32.rotl':
    case 'i32.rotr':
      popVals(ins, [I32_TYPE, I32_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'i64.eqz':
    case 'i32.wrap_i64':
      popVal(ins, I64_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i64.eq':
    case 'i64.ne':
    case 'i64.lt_s':
    case 'i64.lt_u':
    case 'i64.gt_s':
    case 'i64.gt_u':
    case 'i64.le_s':
    case 'i64.le_u':
    case 'i64.ge_s':
    case 'i64.ge_u':
      popVals(ins, [I64_TYPE, I64_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'i64.clz':
    case 'i64.ctz':
    case 'i64.popcnt':
    case 'i64.extend8_s':
    case 'i64.extend16_s':
    case 'i64.extend32_s':
      popVal(ins, I64_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'i64.add':
    case 'i64.sub':
    case 'i64.mul':
    case 'i64.div_s':
    case 'i64.div_u':
    case 'i64.rem_s':
    case 'i64.rem_u':
    case 'i64.and':
    case 'i64.or':
    case 'i64.xor':
    case 'i64.shl':
    case 'i64.shr_s':
    case 'i64.shr_u':
    case 'i64.rotl':
    case 'i64.rotr':
      popVals(ins, [I64_TYPE, I64_TYPE]);
      pushVal(I64_TYPE);
      break;
    case 'f32.eq':
    case 'f32.ne':
    case 'f32.lt':
    case 'f32.gt':
    case 'f32.le':
    case 'f32.ge':
      popVals(ins, [F32_TYPE, F32_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'f64.eq':
    case 'f64.ne':
    case 'f64.lt':
    case 'f64.gt':
    case 'f64.le':
    case 'f64.ge':
      popVals(ins, [F64_TYPE, F64_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'f32.abs':
    case 'f32.neg':
    case 'f32.ceil':
    case 'f32.floor':
    case 'f32.trunc':
    case 'f32.nearest':
    case 'f32.sqrt':
      popVal(ins, F32_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f32.add':
    case 'f32.sub':
    case 'f32.mul':
    case 'f32.div':
    case 'f32.min':
    case 'f32.max':
    case 'f32.copysign':
      popVals(ins, [F32_TYPE, F32_TYPE]);
      pushVal(F32_TYPE);
      break;
    case 'f64.abs':
    case 'f64.neg':
    case 'f64.ceil':
    case 'f64.floor':
    case 'f64.trunc':
    case 'f64.nearest':
    case 'f64.sqrt':
      popVal(ins, F64_TYPE);
      pushVal(F64_TYPE);
      break;
    case 'f64.add':
    case 'f64.sub':
    case 'f64.mul':
    case 'f64.div':
    case 'f64.min':
    case 'f64.max':
    case 'f64.copysign':
      popVals(ins, [F64_TYPE, F64_TYPE]);
      pushVal(F64_TYPE);
      break;
    case 'i32.trunc_f32_s':
    case 'i32.trunc_f32_u':
    case 'i32.trunc_sat_f32_s':
    case 'i32.trunc_sat_f32_u':
    case 'i32.reinterpret_f32':
      popVal(ins, F32_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i32.trunc_f64_s':
    case 'i32.trunc_f64_u':
    case 'i32.trunc_sat_f64_s':
    case 'i32.trunc_sat_f64_u':
      popVal(ins, F64_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i64.extend_i32_s':
    case 'i64.extend_i32_u':
      popVal(ins, I32_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'i64.trunc_f32_s':
    case 'i64.trunc_f32_u':
    case 'i64.trunc_sat_f32_s':
    case 'i64.trunc_sat_f32_u':
      popVal(ins, F32_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'i64.trunc_f64_s':
    case 'i64.trunc_f64_u':
    case 'i64.trunc_sat_f64_s':
    case 'i64.trunc_sat_f64_u':
    case 'i64.reinterpret_f64':
      popVal(ins, F64_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'f32.convert_i32_s':
    case 'f32.convert_i32_u':
    case 'f32.reinterpret_i32':
      popVal(ins, I32_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f32.convert_i64_s':
    case 'f32.convert_i64_u':
      popVal(ins, I64_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f32.demote_f64':
      popVal(ins, F64_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f64.convert_i32_s':
    case 'f64.convert_i32_u':
      popVal(ins, I32_TYPE);
      pushVal(F64_TYPE);
      break;
    case 'f64.convert_i64_s':
    case 'f64.convert_i64_u':
    case 'f64.reinterpret_i64':
      popVal(ins, I64_TYPE);
      pushVal(F64_TYPE);
      break;
    case 'f64.promote_f32':
      popVal(ins, F32_TYPE);
      pushVal(F64_TYPE);
      break;
    default:
      fail(ins, `unhandled instruction ${name}`);
  }
}

function validateGCInstruction(ins, { typeEnv, elementSegments, requireDataCount, popVal, popVals, pushVal, fail }) {
  const { name, immediates } = ins;
  switch (name) {
    case 'ref.i31':
      popVal(ins, I32_TYPE);
      pushVal({ kind: 'ref', nullable: false, heapType: 'i31' });
      break;
    case 'i31.get_s':
    case 'i31.get_u':
      popVal(ins, { kind: 'ref', nullable: true, heapType: 'i31' });
      pushVal(I32_TYPE);
      break;
    case 'struct.new': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      popVals(ins, def.fields.map(f => unpackedValType(f.storage)));
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'struct.new_default': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      for (const f of def.fields) {
        if (!isDefaultable(f.storage)) fail(ins, 'struct.new_default field is not defaultable');
      }
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'struct.get':
    case 'struct.get_s':
    case 'struct.get_u': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      if (immediates.fieldIndex < 0 || immediates.fieldIndex >= def.fields.length) {
        fail(ins, `struct field index ${immediates.fieldIndex} out of bounds`);
      }
      const field = def.fields[immediates.fieldIndex];
      const isPacked = field.storage.kind === 'packed';
      if (name === 'struct.get' && isPacked) fail(ins, 'struct.get cannot read packed field; use struct.get_s/u');
      if (name !== 'struct.get' && !isPacked) fail(ins, `${name} requires packed field`);
      popVal(ins, { kind: 'ref', nullable: true, heapType: immediates.typeIndex });
      pushVal(unpackedValType(field.storage));
      break;
    }
    case 'struct.set': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      if (immediates.fieldIndex < 0 || immediates.fieldIndex >= def.fields.length) {
        fail(ins, `struct field index ${immediates.fieldIndex} out of bounds`);
      }
      const field = def.fields[immediates.fieldIndex];
      if (!field.mutable) fail(ins, `struct field ${immediates.fieldIndex} is immutable`);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        unpackedValType(field.storage)
      ]);
      break;
    }
    case 'array.new': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      popVals(ins, [unpackedValType(def.field.storage), I32_TYPE]);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_default': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!isDefaultable(def.field.storage)) fail(ins, 'array.new_default element is not defaultable');
      popVal(ins, I32_TYPE);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_fixed': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const elemType = unpackedValType(def.field.storage);
      for (let i = 0; i < immediates.length; i++) popVal(ins, elemType);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_data': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const st = def.field.storage;
      if (st.kind !== 'num' && st.kind !== 'packed' && st.kind !== 'vec') {
        fail(ins, 'array.new_data requires numeric, vector, or packed element storage');
      }
      requireDataCount(ins, immediates.dataIndex);
      popVals(ins, [I32_TYPE, I32_TYPE]);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_elem': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const elemIdx = immediates.elementIndex;
      if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
      if (!typeEnv.isValueSubtype(elementSegments[elemIdx].elemType, unpackedValType(def.field.storage))) {
        fail(ins, 'array.new_elem element type mismatch');
      }
      popVals(ins, [I32_TYPE, I32_TYPE]);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.get':
    case 'array.get_s':
    case 'array.get_u': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const isPacked = def.field.storage.kind === 'packed';
      if (name === 'array.get' && isPacked) fail(ins, 'array.get cannot read packed element; use array.get_s/u');
      if (name !== 'array.get' && !isPacked) fail(ins, `${name} requires packed element`);
      popVals(ins, [{ kind: 'ref', nullable: true, heapType: immediates.typeIndex }, I32_TYPE]);
      pushVal(unpackedValType(def.field.storage));
      break;
    }
    case 'array.set': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, `array type ${immediates.typeIndex} is immutable`);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        unpackedValType(def.field.storage)
      ]);
      break;
    }
    case 'array.len':
      popVal(ins, { kind: 'ref', nullable: true, heapType: 'array' });
      pushVal(I32_TYPE);
      break;
    case 'array.fill': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, `array type ${immediates.typeIndex} is immutable`);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        unpackedValType(def.field.storage),
        I32_TYPE
      ]);
      break;
    }
    case 'array.copy': {
      const dstDef = typeEnv.get(immediates.destinationType);
      const srcDef = typeEnv.get(immediates.sourceType);
      if (dstDef.kind !== 'array' || srcDef.kind !== 'array') fail(ins, 'array.copy requires array types');
      if (!dstDef.field.mutable) fail(ins, 'array.copy destination array is immutable');
      if (!typeEnv.isStorageSubtype(srcDef.field.storage, dstDef.field.storage)) {
        fail(ins, 'array.copy storage type mismatch');
      }
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.destinationType },
        I32_TYPE,
        { kind: 'ref', nullable: true, heapType: immediates.sourceType },
        I32_TYPE,
        I32_TYPE
      ]);
      break;
    }
    case 'array.init_data': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, 'array.init_data target array is immutable');
      const st = def.field.storage;
      if (st.kind !== 'num' && st.kind !== 'packed' && st.kind !== 'vec') {
        fail(ins, 'array.init_data requires numeric, vector, or packed element storage');
      }
      requireDataCount(ins, immediates.dataIndex);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        I32_TYPE,
        I32_TYPE
      ]);
      break;
    }
    case 'array.init_elem': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, 'array.init_elem target array is immutable');
      const elemIdx = immediates.elementIndex;
      if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
      if (!typeEnv.isValueSubtype(elementSegments[elemIdx].elemType, unpackedValType(def.field.storage))) {
        fail(ins, 'array.init_elem element type mismatch');
      }
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        I32_TYPE,
        I32_TYPE
      ]);
      break;
    }
    case 'ref.test':
    case 'ref.test_null': {
      const ht = normalizeHeapType(immediates.heapType);
      if (typeof ht === 'number') typeEnv.get(ht);
      const top = heapHierarchy(ht, typeEnv);
      popVal(ins, { kind: 'ref', nullable: true, heapType: top });
      pushVal(I32_TYPE);
      break;
    }
    case 'ref.cast':
    case 'ref.cast_null': {
      const ht = normalizeHeapType(immediates.heapType);
      if (typeof ht === 'number') typeEnv.get(ht);
      const top = heapHierarchy(ht, typeEnv);
      popVal(ins, { kind: 'ref', nullable: true, heapType: top });
      pushVal({ kind: 'ref', nullable: Boolean(immediates.nullable), heapType: ht });
      break;
    }
    case 'any.convert_extern': {
      const got = popVal(ins, { kind: 'ref', nullable: true, heapType: 'extern' });
      pushVal({ kind: 'ref', nullable: got.kind === 'bot' ? false : got.nullable, heapType: 'any' });
      break;
    }
    case 'extern.convert_any': {
      const got = popVal(ins, { kind: 'ref', nullable: true, heapType: 'any' });
      pushVal({ kind: 'ref', nullable: got.kind === 'bot' ? false : got.nullable, heapType: 'extern' });
      break;
    }
    default:
      fail(ins, `unhandled GC instruction ${name}`);
  }
}

function validateSIMDInstruction(ins, { requireMemory, popVal, popVals, pushVal, fail }) {
  const { name, immediates } = ins;
  if (name === 'v128.const') {
    pushVal(V128_TYPE);
    return;
  }
  if (name.startsWith('v128.load')) {
    requireMemory(ins, immediates.memarg.memoryIndex);
    if (name.endsWith('_lane')) {
      popVals(ins, [I32_TYPE, V128_TYPE]);
    } else {
      popVal(ins, I32_TYPE);
    }
    pushVal(V128_TYPE);
    return;
  }
  if (name.startsWith('v128.store')) {
    requireMemory(ins, immediates.memarg.memoryIndex);
    popVals(ins, [I32_TYPE, V128_TYPE]);
    return;
  }
  if (name === 'i8x16.splat' || name === 'i16x8.splat' || name === 'i32x4.splat') {
    popVal(ins, I32_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'i64x2.splat') {
    popVal(ins, I64_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f32x4.splat') {
    popVal(ins, F32_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f64x2.splat') {
    popVal(ins, F64_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'i8x16.extract_lane_s' || name === 'i8x16.extract_lane_u' ||
      name === 'i16x8.extract_lane_s' || name === 'i16x8.extract_lane_u' ||
      name === 'i32x4.extract_lane' || name === 'v128.any_true' ||
      name.endsWith('.all_true') || name.endsWith('.bitmask')) {
    popVal(ins, V128_TYPE);
    pushVal(I32_TYPE);
    return;
  }
  if (name === 'i64x2.extract_lane') {
    popVal(ins, V128_TYPE);
    pushVal(I64_TYPE);
    return;
  }
  if (name === 'f32x4.extract_lane') {
    popVal(ins, V128_TYPE);
    pushVal(F32_TYPE);
    return;
  }
  if (name === 'f64x2.extract_lane') {
    popVal(ins, V128_TYPE);
    pushVal(F64_TYPE);
    return;
  }
  if (name === 'i8x16.replace_lane' || name === 'i16x8.replace_lane' || name === 'i32x4.replace_lane' ||
      name.endsWith('.shl') || name.endsWith('.shr_s') || name.endsWith('.shr_u')) {
    popVals(ins, [V128_TYPE, I32_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'i64x2.replace_lane') {
    popVals(ins, [V128_TYPE, I64_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f32x4.replace_lane') {
    popVals(ins, [V128_TYPE, F32_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f64x2.replace_lane') {
    popVals(ins, [V128_TYPE, F64_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'v128.bitselect') {
    popVals(ins, [V128_TYPE, V128_TYPE, V128_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  const unarySIMD = new Set([
    'v128.not',
    'i8x16.abs', 'i8x16.neg', 'i8x16.popcnt',
    'i16x8.abs', 'i16x8.neg',
    'i16x8.extadd_pairwise_i8x16_s', 'i16x8.extadd_pairwise_i8x16_u',
    'i16x8.extend_low_i8x16_s', 'i16x8.extend_high_i8x16_s',
    'i16x8.extend_low_i8x16_u', 'i16x8.extend_high_i8x16_u',
    'i32x4.abs', 'i32x4.neg',
    'i32x4.extadd_pairwise_i16x8_s', 'i32x4.extadd_pairwise_i16x8_u',
    'i32x4.extend_low_i16x8_s', 'i32x4.extend_high_i16x8_s',
    'i32x4.extend_low_i16x8_u', 'i32x4.extend_high_i16x8_u',
    'i64x2.abs', 'i64x2.neg',
    'i64x2.extend_low_i32x4_s', 'i64x2.extend_high_i32x4_s',
    'i64x2.extend_low_i32x4_u', 'i64x2.extend_high_i32x4_u',
    'f32x4.abs', 'f32x4.neg', 'f32x4.sqrt', 'f32x4.ceil', 'f32x4.floor', 'f32x4.trunc', 'f32x4.nearest',
    'f64x2.abs', 'f64x2.neg', 'f64x2.sqrt', 'f64x2.ceil', 'f64x2.floor', 'f64x2.trunc', 'f64x2.nearest',
    'f32x4.demote_f64x2_zero', 'f64x2.promote_low_f32x4',
    'i32x4.trunc_sat_f32x4_s', 'i32x4.trunc_sat_f32x4_u',
    'f32x4.convert_i32x4_s', 'f32x4.convert_i32x4_u',
    'i32x4.trunc_sat_f64x2_s_zero', 'i32x4.trunc_sat_f64x2_u_zero',
    'f64x2.convert_low_i32x4_s', 'f64x2.convert_low_i32x4_u'
  ]);
  if (unarySIMD.has(name)) {
    popVal(ins, V128_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  popVals(ins, [V128_TYPE, V128_TYPE]);
  pushVal(V128_TYPE);
}

function validateModule(decoded, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };

  if (decoded.bytes && decoded.bytes.byteLength > limits.maxModuleBytes) {
    throw new ResourceLimitError(`Module size (${decoded.bytes.byteLength}) exceeds maxModuleBytes (${limits.maxModuleBytes})`);
  }
  if (decoded.typeSection.length > limits.maxTypes) {
    throw new ResourceLimitError(`Type count (${decoded.typeSection.length}) exceeds maxTypes (${limits.maxTypes})`);
  }
  if (decoded.importSection.length > limits.maxImports) {
    throw new ResourceLimitError(`Import count (${decoded.importSection.length}) exceeds maxImports (${limits.maxImports})`);
  }
  if (decoded.exportSection.length > limits.maxExports) {
    throw new ResourceLimitError(`Export count (${decoded.exportSection.length}) exceeds maxExports (${limits.maxExports})`);
  }
  if (decoded.dataSection.length > limits.maxDataSegments) {
    throw new ResourceLimitError(`Data segment count (${decoded.dataSection.length}) exceeds maxDataSegments (${limits.maxDataSegments})`);
  }
  if (decoded.elementSection.length > limits.maxElementSegments) {
    throw new ResourceLimitError(`Element segment count (${decoded.elementSection.length}) exceeds maxElementSegments (${limits.maxElementSegments})`);
  }

  if (decoded.functionSection.length !== decoded.codeSection.length) {
    throw new ValidationError(
      `Function section count (${decoded.functionSection.length}) does not match code section count (${decoded.codeSection.length})`
    );
  }
  if (decoded.dataCountSection !== null && decoded.dataCountSection !== decoded.dataSection.length) {
    throw new ValidationError(
      `DataCount section (${decoded.dataCountSection}) does not match data section count (${decoded.dataSection.length})`
    );
  }

  const typeEnv = new TypeEnvironment(decoded.typeSection, decoded.typeGroups);
  typeEnv.validateSubtyping();

  const functions = [];
  const tables = [];
  const memories = [];
  const globals = [];
  const tags = [];

  for (const imp of decoded.importSection) {
    switch (imp.kind) {
      case 0x00: {
        const def = typeEnv.get(imp.typeIdx);
        if (def.kind !== 'func') throw new ValidationError(`Imported function type ${imp.typeIdx} is not a func type`);
        functions.push({ imported: true, module: imp.module, name: imp.name, typeIndex: imp.typeIdx, funcType: def });
        break;
      }
      case 0x01: {
        const elemType = normalizeValType(imp.tableType.elemType);
        if (elemType.kind !== 'ref') throw new ValidationError('Table element type must be a reference type');
        if (typeof elemType.heapType === 'number') typeEnv.get(elemType.heapType);
        tables.push({ imported: true, module: imp.module, name: imp.name, elemType, limits: imp.tableType.limits });
        break;
      }
      case 0x02: {
        memories.push({ imported: true, module: imp.module, name: imp.name, limits: imp.memoryType });
        break;
      }
      case 0x03: {
        const valType = normalizeValType(imp.globalType.valType);
        if (valType.kind === 'ref' && typeof valType.heapType === 'number') typeEnv.get(valType.heapType);
        globals.push({ imported: true, module: imp.module, name: imp.name, valType, mutable: Boolean(imp.globalType.mutable) });
        break;
      }
      case 0x04: {
        const def = typeEnv.get(imp.typeIdx);
        if (def.kind !== 'func' || def.results.length !== 0) {
          throw new ValidationError(`Imported tag type ${imp.typeIdx} must be a function type with empty results`);
        }
        tags.push({ imported: true, module: imp.module, name: imp.name, typeIndex: imp.typeIdx, funcType: def });
        break;
      }
      default:
        throw new ValidationError(`Unknown import kind ${imp.kind}`);
    }
  }

  const importedCounts = {
    functions: functions.length,
    tables: tables.length,
    memories: memories.length,
    globals: globals.length,
    tags: tags.length
  };

  for (let i = 0; i < decoded.functionSection.length; i++) {
    const typeIdx = decoded.functionSection[i];
    const def = typeEnv.get(typeIdx);
    if (def.kind !== 'func') throw new ValidationError(`Function ${functions.length} type ${typeIdx} is not a func type`);
    functions.push({
      imported: false,
      localIndex: i,
      typeIndex: typeIdx,
      funcType: def,
      body: decoded.codeSection[i]
    });
  }

  for (const tbl of decoded.tableSection) {
    const elemType = normalizeValType(tbl.elemType);
    if (elemType.kind !== 'ref') throw new ValidationError('Table element type must be a reference type');
    if (typeof elemType.heapType === 'number') typeEnv.get(elemType.heapType);
    if (!isDefaultable(elemType)) {
      throw new ValidationError(`Defined table element type ${formatValType(elemType)} must be nullable/defaultable`);
    }
    tables.push({ imported: false, elemType, limits: tbl.limits });
  }

  for (const mem of decoded.memorySection) {
    memories.push({ imported: false, limits: mem });
  }

  for (const tag of decoded.tagSection) {
    const def = typeEnv.get(tag.typeIdx);
    if (def.kind !== 'func' || def.results.length !== 0) {
      throw new ValidationError(`Tag type ${tag.typeIdx} must be a function type with empty results`);
    }
    tags.push({ imported: false, typeIndex: tag.typeIdx, funcType: def });
  }

  if (functions.length > limits.maxFunctions) throw new ResourceLimitError(`Total functions exceed maxFunctions (${limits.maxFunctions})`);
  if (tables.length > limits.maxTables) throw new ResourceLimitError(`Total tables exceed maxTables (${limits.maxTables})`);
  if (memories.length > limits.maxMemories) throw new ResourceLimitError(`Total memories exceed maxMemories (${limits.maxMemories})`);
  if (tags.length > limits.maxTags) throw new ResourceLimitError(`Total tags exceed maxTags (${limits.maxTags})`);

  const declaredFunctions = new Set();

  // Globals: constant expression can only reference preceding globals (or imported globals)
  for (let i = 0; i < decoded.globalSection.length; i++) {
    const g = decoded.globalSection[i];
    const valType = normalizeValType(g.globalType.valType);
    if (valType.kind === 'ref' && typeof valType.heapType === 'number') typeEnv.get(valType.heapType);
    const visibleGlobalsCount = globals.length;
    validateConstantExpression(g.initializer, valType, {
      typeEnv,
      globals,
      importedGlobalCount: importedCounts.globals,
      visibleGlobalsCount,
      functions,
      declaredFunctions
    });
    globals.push({
      imported: false,
      valType,
      mutable: Boolean(g.globalType.mutable),
      initializer: g.initializer
    });
  }
  if (globals.length > limits.maxGlobals) throw new ResourceLimitError(`Total globals exceed maxGlobals (${limits.maxGlobals})`);

  // Element segments
  const elementSegments = [];
  for (let i = 0; i < decoded.elementSection.length; i++) {
    const seg = decoded.elementSection[i];
    const elemType = normalizeValType(seg.reftype);
    if (elemType.kind !== 'ref') throw new ValidationError(`Element segment ${i} type must be a reference type`);
    if (typeof elemType.heapType === 'number') typeEnv.get(elemType.heapType);

    if (seg.mode === 'active') {
      if (seg.tableIndex < 0 || seg.tableIndex >= tables.length) {
        throw new ValidationError(`Element segment ${i} references unknown table ${seg.tableIndex}`);
      }
      if (!typeEnv.isValueSubtype(elemType, tables[seg.tableIndex].elemType)) {
        throw new ValidationError(`Element segment ${i} type ${formatValType(elemType)} is not a subtype of table ${seg.tableIndex} element type`);
      }
      validateConstantExpression(seg.offsetExpression, I32_TYPE, {
        typeEnv,
        globals,
        importedGlobalCount: importedCounts.globals,
        visibleGlobalsCount: globals.length,
        functions,
        declaredFunctions: null
      });
    }

    if (seg.useExpressions) {
      for (const expr of seg.elementExpressions) {
        validateConstantExpression(expr, elemType, {
          typeEnv,
          globals,
          importedGlobalCount: importedCounts.globals,
          visibleGlobalsCount: globals.length,
          functions,
          declaredFunctions
        });
      }
    } else {
      for (const fnIdx of seg.elements) {
        if (fnIdx < 0 || fnIdx >= functions.length) {
          throw new ValidationError(`Element segment ${i} references unknown function ${fnIdx}`);
        }
        declaredFunctions.add(fnIdx);
      }
    }
    elementSegments.push({ ...seg, elemType });
  }

  // Data segments
  const dataSegments = [];
  for (let i = 0; i < decoded.dataSection.length; i++) {
    const seg = decoded.dataSection[i];
    if (seg.mode === 'active') {
      if (seg.memoryIndex < 0 || seg.memoryIndex >= memories.length) {
        throw new ValidationError(`Data segment ${i} references unknown memory ${seg.memoryIndex}`);
      }
      validateConstantExpression(seg.offsetExpression, I32_TYPE, {
        typeEnv,
        globals,
        importedGlobalCount: importedCounts.globals,
        visibleGlobalsCount: globals.length,
        functions,
        declaredFunctions: null
      });
    }
    dataSegments.push(seg);
  }

  // Exports
  const seenExports = new Set();
  for (const exp of decoded.exportSection) {
    if (seenExports.has(exp.name)) {
      throw new ValidationError(`Duplicate export name "${exp.name}"`);
    }
    seenExports.add(exp.name);
    switch (exp.kind) {
      case 0x00:
        if (exp.index < 0 || exp.index >= functions.length) throw new ValidationError(`Export "${exp.name}" references unknown function ${exp.index}`);
        declaredFunctions.add(exp.index);
        break;
      case 0x01:
        if (exp.index < 0 || exp.index >= tables.length) throw new ValidationError(`Export "${exp.name}" references unknown table ${exp.index}`);
        break;
      case 0x02:
        if (exp.index < 0 || exp.index >= memories.length) throw new ValidationError(`Export "${exp.name}" references unknown memory ${exp.index}`);
        break;
      case 0x03:
        if (exp.index < 0 || exp.index >= globals.length) throw new ValidationError(`Export "${exp.name}" references unknown global ${exp.index}`);
        break;
      case 0x04:
        if (exp.index < 0 || exp.index >= tags.length) throw new ValidationError(`Export "${exp.name}" references unknown tag ${exp.index}`);
        break;
      default:
        throw new ValidationError(`Invalid export kind ${exp.kind}`);
    }
  }

  // Start section
  if (decoded.startSection !== null) {
    const startIdx = decoded.startSection;
    if (startIdx < 0 || startIdx >= functions.length) {
      throw new ValidationError(`Start function ${startIdx} out of bounds`);
    }
    const stType = functions[startIdx].funcType;
    if (stType.params.length !== 0 || stType.results.length !== 0) {
      throw new ValidationError('Start function must have signature [] -> []');
    }
  }

  // Function bodies
  const moduleCtx = {
    typeEnv,
    functions,
    tables,
    memories,
    globals,
    tags,
    dataSegments,
    elementSegments,
    dataCountSection: decoded.dataCountSection,
    declaredFunctions
  };

  for (let i = importedCounts.functions; i < functions.length; i++) {
    const fn = functions[i];
    const compiled = validateFunctionBody(fn.body, i, fn.funcType, moduleCtx, options);
    fn.localTypes = compiled.localTypes;
    fn.jumpTable = compiled.jumpTable;
  }

  return {
    typeEnv,
    importedCounts,
    functions,
    tables,
    memories,
    globals,
    tags,
    dataSegments,
    elementSegments,
    declaredFunctions
  };
}

module.exports = {
  DEFAULT_LIMITS,
  unpackedValType,
  blockSignature,
  validateConstantExpression,
  validateFunctionBody,
  validateModule
};

  };
  __modules["./vm/interpreter.js"] = function (module, exports, require) {
const {
  Trap,
  GuestException,
  ResourceLimitError,
  HostError,
  WasmError
} = __require("./vm/errors.js");
const { defaultValueForType, normalizeValType } = __require("./vm/types.js");
const {
  f32FromBits,
  f64FromBits,
  unboxFloat,
  canonF32,
  canonF64,
  execScalarNumeric
} = __require("./vm/numeric.js");
const { execScalarMemory } = __require("./vm/memory.js");
const { execSIMD } = __require("./vm/simd.js");
const {
  WasmI31,
  WasmStruct,
  WasmArray,
  WasmHostAny,
  matchesRefType,
  execGC
} = __require("./vm/gc.js");

function coerceJSValueToWasm(val, valType, typeEnv) {
  const vt = normalizeValType(valType);
  if (vt.kind === 'num') {
    switch (vt.name) {
      case 'i32': {
        if (typeof val === 'bigint') throw new TypeError('Cannot convert BigInt to i32');
        return Number(val) | 0;
      }
      case 'i64': {
        if (typeof val === 'bigint') return BigInt.asIntN(64, val);
        if (typeof val === 'number' && Number.isInteger(val)) return BigInt.asIntN(64, BigInt(val));
        throw new TypeError(`Expected BigInt for i64, got ${typeof val}`);
      }
      case 'f32': {
        if (typeof val === 'bigint') throw new TypeError('Cannot convert BigInt to f32');
        return canonF32(Number(val));
      }
      case 'f64': {
        if (typeof val === 'bigint') throw new TypeError('Cannot convert BigInt to f64');
        return canonF64(Number(val));
      }
    }
  }
  if (vt.kind === 'vec') {
    if (val instanceof Uint8Array && val.byteLength === 16) return Uint8Array.from(val);
    throw new TypeError('Expected 16-byte Uint8Array for v128');
  }
  if (vt.kind === 'ref') {
    if (val === null) {
      if (!vt.nullable) throw new TypeError('Null reference not allowed for non-nullable reference type');
      return null;
    }
    if (typeof val === 'function' && val.__wasmFuncRef) {
      val = val.__wasmFuncRef;
    }
    if (vt.heapType === 'extern') return val;
    if (typeEnv && !matchesRefType(val, vt, typeEnv)) {
      throw new TypeError('Incompatible reference value for target reference type');
    }
    return val;
  }
  return val;
}

function exportWasmValueToJS(val, valType) {
  const vt = valType ? normalizeValType(valType) : null;
  if (vt && vt.kind === 'num') {
    if (vt.name === 'i32') return val | 0;
    if (vt.name === 'i64') return BigInt.asIntN(64, val);
    if (vt.name === 'f32' || vt.name === 'f64') return unboxFloat(val);
  }
  if (val && typeof val === 'object') {
    if (val.__wasmKind === 'func' && val.jsWrapper) return val.jsWrapper;
    if (val instanceof WasmHostAny) return val;
  }
  return unboxFloatIfBoxed(val);
}

function unboxFloatIfBoxed(val) {
  if (val && typeof val === 'object' && (val.constructor.name === 'F32Box' || val.constructor.name === 'F64Box')) {
    return NaN;
  }
  return val;
}

function isEqRefEqual(a, b) {
  if (a === null || b === null) return a === b;
  if (a instanceof WasmI31 && b instanceof WasmI31) {
    return a.value === b.value;
  }
  return a === b;
}

function createExnRef(tag, values) {
  return {
    __wasmKind: 'exn',
    tag,
    values: Array.from(values)
  };
}

function evaluateConstantExpression(expr, instance, limits = {}) {
  const stack = [];
  const instructions = expr.instructions || [];
  for (let i = 0; i < instructions.length; i++) {
    const ins = instructions[i];
    const { name, immediates } = ins;
    switch (name) {
      case 'end':
        return stack.pop();
      case 'i32.const':
        stack.push(immediates.value | 0);
        break;
      case 'i64.const':
        stack.push(BigInt.asIntN(64, immediates.value));
        break;
      case 'f32.const':
        stack.push(f32FromBits(immediates.bits));
        break;
      case 'f64.const':
        stack.push(f64FromBits(immediates.bits));
        break;
      case 'v128.const':
        stack.push(Uint8Array.from(immediates.bytes));
        break;
      case 'ref.null':
        stack.push(null);
        break;
      case 'ref.func':
        stack.push(instance.functions[immediates.functionIndex]);
        break;
      case 'global.get':
        stack.push(instance.globals[immediates.globalIndex]._getInternal());
        break;
      case 'i32.add':
      case 'i32.sub':
      case 'i32.mul':
      case 'i64.add':
      case 'i64.sub':
      case 'i64.mul':
        execScalarNumeric(name, stack);
        break;
      case 'ref.i31':
      case 'struct.new':
      case 'struct.new_default':
      case 'array.new':
      case 'array.new_default':
      case 'array.new_fixed':
      case 'any.convert_extern':
      case 'extern.convert_any':
        execGC(name, immediates, stack, instance, limits);
        break;
      default:
        throw new Trap(`Unsupported instruction ${name} in constant expression`);
    }
  }
  return stack.pop();
}

function buildWasmFrame(funcRef, args, baseStackHeight) {
  const paramCount = funcRef.typeDef.params.length;
  const localTypes = funcRef.localTypes;
  const locals = new Array(localTypes.length);
  for (let i = 0; i < paramCount; i++) {
    locals[i] = args[i];
  }
  for (let i = paramCount; i < localTypes.length; i++) {
    locals[i] = localTypes[i].kind === 'ref' ? null : defaultValueForType(localTypes[i]);
  }
  const instructions = funcRef.body.instructions;
  const endPc = instructions.length - 1;
  return {
    funcRef,
    instance: funcRef.instance,
    instructions,
    jumpTable: funcRef.jumpTable,
    locals,
    pc: 0,
    baseStackHeight,
    returnArity: funcRef.typeDef.results.length,
    ctrlFrames: [{
      kind: 'function',
      startPc: -1,
      endPc,
      stackHeight: baseStackHeight,
      paramCount: 0,
      resultCount: funcRef.typeDef.results.length,
      handlers: null,
      inCatch: false,
      caughtException: null
    }]
  };
}

function branchToDepth(frame, depth, stack) {
  const targetIdx = frame.ctrlFrames.length - 1 - depth;
  const targetCtrl = frame.ctrlFrames[targetIdx];
  const arity = targetCtrl.kind === 'loop' ? targetCtrl.paramCount : targetCtrl.resultCount;
  const values = arity > 0 ? stack.slice(stack.length - arity) : [];
  stack.length = targetCtrl.stackHeight;
  for (let i = 0; i < arity; i++) stack.push(values[i]);

  if (targetCtrl.kind === 'loop') {
    frame.ctrlFrames.length = targetIdx + 1;
    frame.pc = targetCtrl.startPc + 1;
    return false;
  }
  if (targetCtrl.kind === 'function') {
    frame.ctrlFrames.length = 0;
    return true; // function completed!
  }
  frame.ctrlFrames.length = targetIdx;
  frame.pc = targetCtrl.endPc + 1;
  return false;
}

function invokeHostFunction(funcRef, args, stack, baseStackHeight) {
  let rawResult;
  try {
    const jsArgs = args.map((v, i) => exportWasmValueToJS(v, funcRef.typeDef.params[i]));
    rawResult = funcRef.hostFn(...jsArgs);
  } catch (err) {
    if (err instanceof WasmError) throw err;
    throw new HostError(err);
  }
  stack.length = baseStackHeight;
  const results = funcRef.typeDef.results;
  if (results.length === 0) return;
  if (results.length === 1) {
    stack.push(coerceJSValueToWasm(rawResult, results[0], funcRef.instance?.typeEnv));
    return;
  }
  if (!Array.isArray(rawResult) || rawResult.length !== results.length) {
    throw new TypeError(`Host function must return an array of ${results.length} results`);
  }
  for (let i = 0; i < results.length; i++) {
    stack.push(coerceJSValueToWasm(rawResult[i], results[i], funcRef.instance?.typeEnv));
  }
}

function executeFunction(entryFuncRef, rawArgs = [], execOptions = {}) {
  const limits = {
    maxCallDepth: 1024,
    maxValueStack: 65536,
    maxFuel: Infinity,
    ...(entryFuncRef.instance?.limits || {}),
    ...(execOptions.limits || {})
  };
  let fuel = execOptions.fuel !== undefined ? execOptions.fuel : limits.maxFuel;

  const coercedArgs = entryFuncRef.typeDef.params.map((pt, idx) =>
    coerceJSValueToWasm(rawArgs[idx], pt, entryFuncRef.instance?.typeEnv)
  );

  const stack = [];
  if (entryFuncRef.isHost) {
    invokeHostFunction(entryFuncRef, coercedArgs, stack, 0);
    return formatReturnValues(stack, entryFuncRef.typeDef.results);
  }

  const callStack = [buildWasmFrame(entryFuncRef, coercedArgs, 0)];

  function chargeFuel(amount = 1, ins = null, frame = null) {
    if (fuel !== Infinity) {
      fuel -= amount;
      if (fuel < 0) {
        throw new ResourceLimitError('Execution fuel exhausted', {
          functionIndex: frame ? frame.funcRef.funcIndex : undefined,
          instruction: ins ? ins.name : undefined,
          offset: ins ? ins.offset : undefined
        });
      }
    }
  }

  function unwindException(exnRef) {
    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      while (frame.ctrlFrames.length > 0) {
        const ctrl = frame.ctrlFrames[frame.ctrlFrames.length - 1];
        if (ctrl.kind === 'try' && !ctrl.inCatch) {
          for (const h of ctrl.handlers) {
            if (h.kind === 'catch' && frame.instance.tags[h.tagIndex] === exnRef.tag) {
              ctrl.inCatch = true;
              ctrl.caughtException = exnRef;
              stack.length = ctrl.stackHeight;
              for (const v of exnRef.values) stack.push(v);
              frame.pc = h.targetPc;
              return;
            }
            if (h.kind === 'catch_all') {
              ctrl.inCatch = true;
              ctrl.caughtException = exnRef;
              stack.length = ctrl.stackHeight;
              frame.pc = h.targetPc;
              return;
            }
          }
          frame.ctrlFrames.pop();
        } else if (ctrl.kind === 'try_table') {
          frame.ctrlFrames.pop();
          for (const c of ctrl.handlers) {
            if (c.kind === 0 && frame.instance.tags[c.tagIndex] === exnRef.tag) {
              stack.length = ctrl.stackHeight;
              for (const v of exnRef.values) stack.push(v);
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
            if (c.kind === 1 && frame.instance.tags[c.tagIndex] === exnRef.tag) {
              stack.length = ctrl.stackHeight;
              for (const v of exnRef.values) stack.push(v);
              stack.push(exnRef);
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
            if (c.kind === 2) {
              stack.length = ctrl.stackHeight;
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
            if (c.kind === 3) {
              stack.length = ctrl.stackHeight;
              stack.push(exnRef);
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
          }
        } else {
          frame.ctrlFrames.pop();
        }
      }
      stack.length = frame.baseStackHeight;
      callStack.pop();
    }
    const jsValues = exnRef.values.map((v, i) => exportWasmValueToJS(v, exnRef.tag.funcType.params[i]));
    throw new GuestException(exnRef.tag, jsValues, { exnRef });
  }

  function performCall(calleeRef, isTailCall, currentFrame) {
    if (!calleeRef) throw new Trap('null function reference');
    const paramCount = calleeRef.typeDef.params.length;
    const args = paramCount > 0 ? stack.splice(stack.length - paramCount, paramCount) : [];

    if (isTailCall) {
      const baseHeight = currentFrame.baseStackHeight;
      stack.length = baseHeight;
      if (calleeRef.isHost) {
        callStack.pop();
        try {
          invokeHostFunction(calleeRef, args, stack, baseHeight);
        } catch (err) {
          if (err instanceof GuestException && err.exnRef) {
            unwindException(err.exnRef);
            return;
          }
          throw err;
        }
        return;
      }
      callStack[callStack.length - 1] = buildWasmFrame(calleeRef, args, baseHeight);
      return;
    }

    const baseHeight = stack.length;
    if (calleeRef.isHost) {
      try {
        invokeHostFunction(calleeRef, args, stack, baseHeight);
      } catch (err) {
        if (err instanceof GuestException) {
          const exnRef = err.exnRef || createExnRef(err.tag, err.values);
          unwindException(exnRef);
          return;
        }
        throw err;
      }
      return;
    }

    if (callStack.length + 1 > limits.maxCallDepth) {
      throw new ResourceLimitError(`Call stack depth exceeds maxCallDepth (${limits.maxCallDepth})`, {
        functionIndex: calleeRef.funcIndex
      });
    }
    callStack.push(buildWasmFrame(calleeRef, args, baseHeight));
  }

  while (callStack.length > 0) {
    const frame = callStack[callStack.length - 1];
    if (stack.length > limits.maxValueStack) {
      throw new ResourceLimitError(`Operand stack size (${stack.length}) exceeds maxValueStack (${limits.maxValueStack})`, {
        functionIndex: frame.funcRef.funcIndex
      });
    }
    const pc = frame.pc;
    const ins = frame.instructions[pc];
    const { name, opcode, immediates } = ins;
    chargeFuel(1, ins, frame);

    try {
      switch (name) {
        case 'nop':
          frame.pc = pc + 1;
          break;
        case 'unreachable':
          throw new Trap('unreachable executed');
        case 'block':
        case 'loop':
        case 'try':
        case 'try_table': {
          const meta = frame.jumpTable[pc];
          const stackHeight = stack.length - meta.paramCount;
          frame.ctrlFrames.push({
            kind: name,
            startPc: pc,
            endPc: meta.endPc,
            stackHeight,
            paramCount: meta.paramCount,
            resultCount: meta.resultCount,
            handlers: meta.handlers || meta.catches || null,
            inCatch: false,
            caughtException: null
          });
          frame.pc = pc + 1;
          break;
        }
        case 'if': {
          const meta = frame.jumpTable[pc];
          const cond = stack.pop() | 0;
          const stackHeight = stack.length - meta.paramCount;
          frame.ctrlFrames.push({
            kind: 'if',
            startPc: pc,
            endPc: meta.endPc,
            stackHeight,
            paramCount: meta.paramCount,
            resultCount: meta.resultCount,
            handlers: null,
            inCatch: false,
            caughtException: null
          });
          if (cond === 0) {
            frame.pc = meta.elsePc !== null ? meta.elsePc + 1 : meta.endPc;
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'else':
        case 'catch':
        case 'catch_all': {
          // Reached via normal fallthrough from preceding block body
          const ctrl = frame.ctrlFrames.pop();
          const arity = ctrl.resultCount;
          const values = arity > 0 ? stack.slice(stack.length - arity) : [];
          stack.length = ctrl.stackHeight;
          for (let i = 0; i < arity; i++) stack.push(values[i]);
          frame.pc = ctrl.endPc + 1;
          break;
        }
        case 'end': {
          const ctrl = frame.ctrlFrames.pop();
          const arity = ctrl.resultCount;
          const values = arity > 0 ? stack.slice(stack.length - arity) : [];
          stack.length = ctrl.stackHeight;
          for (let i = 0; i < arity; i++) stack.push(values[i]);
          if (frame.ctrlFrames.length === 0) {
            callStack.pop();
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br': {
          if (branchToDepth(frame, immediates.labelIndex, stack)) {
            callStack.pop();
          }
          break;
        }
        case 'br_if': {
          const cond = stack.pop() | 0;
          if (cond !== 0) {
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br_table': {
          const idx = stack.pop() >>> 0;
          const targets = immediates.targets;
          const depth = idx < targets.length ? targets[idx] : immediates.defaultTarget;
          if (branchToDepth(frame, depth, stack)) {
            callStack.pop();
          }
          break;
        }
        case 'br_on_null': {
          const ref = stack.pop();
          if (ref === null) {
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            stack.push(ref);
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br_on_non_null': {
          const ref = stack.pop();
          if (ref !== null) {
            stack.push(ref);
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br_on_cast':
        case 'br_on_cast_fail': {
          const meta = frame.jumpTable[pc];
          const ref = stack[stack.length - 1];
          const matches = matchesRefType(ref, meta.targetType, frame.instance.typeEnv);
          const shouldBranch = name === 'br_on_cast' ? matches : !matches;
          if (shouldBranch) {
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'return': {
          const arity = frame.returnArity;
          const values = arity > 0 ? stack.slice(stack.length - arity) : [];
          stack.length = frame.baseStackHeight;
          for (let i = 0; i < arity; i++) stack.push(values[i]);
          callStack.pop();
          break;
        }
        case 'call':
        case 'return_call': {
          const callee = frame.instance.functions[immediates.functionIndex];
          frame.pc = pc + 1;
          performCall(callee, name === 'return_call', frame);
          break;
        }
        case 'call_indirect':
        case 'return_call_indirect': {
          const elemIdx = stack.pop() >>> 0;
          const table = frame.instance.tables[immediates.tableIndex];
          if (elemIdx >= table.length) {
            throw new Trap('undefined element (out of bounds table index)');
          }
          const callee = table._getInternal(elemIdx);
          if (callee === null) {
            throw new Trap('uninitialized element (null function reference)');
          }
          const expectedType = frame.instance.typeEnv.get(immediates.typeIndex);
          if (!frame.instance.typeEnv.isHeapSubtype(callee.typeDef, expectedType)) {
            throw new Trap('indirect call type mismatch');
          }
          frame.pc = pc + 1;
          performCall(callee, name === 'return_call_indirect', frame);
          break;
        }
        case 'call_ref':
        case 'return_call_ref': {
          const callee = stack.pop();
          if (callee === null) {
            throw new Trap('null function reference');
          }
          frame.pc = pc + 1;
          performCall(callee, name === 'return_call_ref', frame);
          break;
        }
        case 'throw': {
          const tag = frame.instance.tags[immediates.tagIndex];
          const arity = tag.funcType.params.length;
          const values = arity > 0 ? stack.splice(stack.length - arity, arity) : [];
          unwindException(createExnRef(tag, values));
          break;
        }
        case 'throw_ref': {
          const exnRef = stack.pop();
          if (exnRef === null) throw new Trap('null exception reference');
          unwindException(exnRef);
          break;
        }
        case 'rethrow': {
          const targetIdx = frame.ctrlFrames.length - 1 - immediates.labelIndex;
          const targetCtrl = frame.ctrlFrames[targetIdx];
          const exnRef = targetCtrl.caughtException;
          if (!exnRef) throw new Trap('invalid rethrow state');
          frame.ctrlFrames.length = targetIdx;
          unwindException(exnRef);
          break;
        }
        case 'drop':
          stack.pop();
          frame.pc = pc + 1;
          break;
        case 'select':
        case 'select_t': {
          const cond = stack.pop() | 0;
          const v2 = stack.pop();
          const v1 = stack.pop();
          stack.push(cond !== 0 ? v1 : v2);
          frame.pc = pc + 1;
          break;
        }
        case 'local.get':
          stack.push(frame.locals[immediates.localIndex]);
          frame.pc = pc + 1;
          break;
        case 'local.set':
          frame.locals[immediates.localIndex] = stack.pop();
          frame.pc = pc + 1;
          break;
        case 'local.tee':
          frame.locals[immediates.localIndex] = stack[stack.length - 1];
          frame.pc = pc + 1;
          break;
        case 'global.get':
          stack.push(frame.instance.globals[immediates.globalIndex]._getInternal());
          frame.pc = pc + 1;
          break;
        case 'global.set':
          frame.instance.globals[immediates.globalIndex]._setInternal(stack.pop());
          frame.pc = pc + 1;
          break;
        case 'table.get': {
          const idx = stack.pop() >>> 0;
          const table = frame.instance.tables[immediates.tableIndex];
          stack.push(table._getInternal(idx));
          frame.pc = pc + 1;
          break;
        }
        case 'table.set': {
          const val = stack.pop();
          const idx = stack.pop() >>> 0;
          const table = frame.instance.tables[immediates.tableIndex];
          table._setInternal(idx, val);
          frame.pc = pc + 1;
          break;
        }
        case 'table.size': {
          const table = frame.instance.tables[immediates.tableIndex];
          stack.push(table.length | 0);
          frame.pc = pc + 1;
          break;
        }
        case 'table.grow': {
          const delta = stack.pop() | 0;
          const initVal = stack.pop();
          const table = frame.instance.tables[immediates.tableIndex];
          chargeFuel(Math.max(0, delta), ins, frame);
          stack.push(table._growInternal(delta, initVal) | 0);
          frame.pc = pc + 1;
          break;
        }
        case 'table.fill': {
          const len = stack.pop() >>> 0;
          const val = stack.pop();
          const dst = stack.pop() >>> 0;
          chargeFuel(len, ins, frame);
          frame.instance.tables[immediates.tableIndex]._fillInternal(dst, val, len);
          frame.pc = pc + 1;
          break;
        }
        case 'table.copy': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(len, ins, frame);
          const dstTable = frame.instance.tables[immediates.destinationTable];
          const srcTable = frame.instance.tables[immediates.sourceTable];
          srcTable.copyTo(dstTable, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'table.init': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(len, ins, frame);
          const table = frame.instance.tables[immediates.tableIndex];
          const seg = frame.instance.elementSegments[immediates.elementIndex];
          table.initFromSegment(seg, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'elem.drop': {
          frame.instance.elementSegments[immediates.elementIndex].dropped = true;
          frame.instance.elementSegments[immediates.elementIndex].elements = [];
          frame.pc = pc + 1;
          break;
        }
        case 'memory.fill': {
          const len = stack.pop() >>> 0;
          const val = stack.pop() | 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(Math.ceil(len / 64), ins, frame);
          frame.instance.memories[immediates.memoryIndex].fill(dst, val, len);
          frame.pc = pc + 1;
          break;
        }
        case 'memory.copy': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(Math.ceil(len / 64), ins, frame);
          const dstMem = frame.instance.memories[immediates.destinationMemory];
          const srcMem = frame.instance.memories[immediates.sourceMemory];
          srcMem.copyTo(dstMem, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'memory.init': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(Math.ceil(len / 64), ins, frame);
          const mem = frame.instance.memories[immediates.memoryIndex];
          const seg = frame.instance.dataSegments[immediates.dataIndex];
          mem.initFromSegment(seg, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'data.drop': {
          frame.instance.dataSegments[immediates.dataIndex].dropped = true;
          frame.instance.dataSegments[immediates.dataIndex].bytes = new Uint8Array(0);
          frame.pc = pc + 1;
          break;
        }
        case 'ref.null':
          stack.push(null);
          frame.pc = pc + 1;
          break;
        case 'ref.is_null':
          stack.push(stack.pop() === null ? 1 : 0);
          frame.pc = pc + 1;
          break;
        case 'ref.as_non_null': {
          const v = stack.pop();
          if (v === null) throw new Trap('null reference');
          stack.push(v);
          frame.pc = pc + 1;
          break;
        }
        case 'ref.eq': {
          const b = stack.pop();
          const a = stack.pop();
          stack.push(isEqRefEqual(a, b) ? 1 : 0);
          frame.pc = pc + 1;
          break;
        }
        case 'ref.func':
          stack.push(frame.instance.functions[immediates.functionIndex]);
          frame.pc = pc + 1;
          break;
        case 'i32.const':
          stack.push(immediates.value | 0);
          frame.pc = pc + 1;
          break;
        case 'i64.const':
          stack.push(BigInt.asIntN(64, immediates.value));
          frame.pc = pc + 1;
          break;
        case 'f32.const':
          stack.push(f32FromBits(immediates.bits));
          frame.pc = pc + 1;
          break;
        case 'f64.const':
          stack.push(f64FromBits(immediates.bits));
          frame.pc = pc + 1;
          break;
        default: {
          if (opcode === 0xfb) {
            execGC(name, immediates, stack, frame.instance, limits);
          } else if (opcode === 0xfd) {
            execSIMD(name, immediates, stack, frame.instance.memories);
          } else if (!execScalarMemory(name, immediates, stack, frame.instance.memories)) {
            if (!execScalarNumeric(name, stack)) {
              throw new Trap(`Unimplemented instruction ${name}`);
            }
          }
          frame.pc = pc + 1;
          break;
        }
      }
    } catch (err) {
      if (err instanceof WasmError && !(err instanceof GuestException)) {
        if (err.functionIndex === undefined) err.functionIndex = frame.funcRef.funcIndex;
        if (err.instruction === undefined) err.instruction = name;
        if (err.opcode === undefined) err.opcode = opcode;
        if (err.offset === undefined) err.offset = ins.offset;
      }
      throw err;
    }
  }

  return formatReturnValues(stack, entryFuncRef.typeDef.results);
}

function formatReturnValues(stack, resultTypes) {
  if (resultTypes.length === 0) return undefined;
  if (resultTypes.length === 1) {
    return exportWasmValueToJS(stack[0], resultTypes[0]);
  }
  return resultTypes.map((rt, idx) => exportWasmValueToJS(stack[idx], rt));
}

module.exports = {
  coerceJSValueToWasm,
  exportWasmValueToJS,
  createExnRef,
  evaluateConstantExpression,
  executeFunction
};

  };
  __modules["./vm/store.js"] = function (module, exports, require) {
const { decodeModule } = __require("./wasm-module.js");
const {
  ValidationError,
  LinkError,
  Trap,
  ResourceLimitError,
  wrapDecodeError
} = __require("./vm/errors.js");
const {
  normalizeValType,
  formatValType,
  defaultValueForType,
  TypeEnvironment
} = __require("./vm/types.js");
const { WasmMemory } = __require("./vm/memory.js");
const { matchesRefType } = __require("./vm/gc.js");
const { DEFAULT_LIMITS, validateModule } = __require("./vm/validate.js");
const {
  coerceJSValueToWasm,
  exportWasmValueToJS,
  evaluateConstantExpression,
  executeFunction
} = __require("./vm/interpreter.js");

const EXPORT_KIND_NAME = {
  0x00: 'function',
  0x01: 'table',
  0x02: 'memory',
  0x03: 'global',
  0x04: 'tag'
};

const MAX_TABLE_LEN = 10000000;

class WasmTable {
  constructor(descriptor = {}, initialValue = undefined, limits = {}) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmTable descriptor must be an object');
    }
    const elemRaw = descriptor.element !== undefined ? descriptor.element : descriptor.elemType;
    const elemType = normalizeValType(elemRaw || 'funcref');
    if (elemType.kind !== 'ref') {
      throw new TypeError(`WasmTable element type must be a reference type, got ${formatValType(elemType)}`);
    }
    const minRaw = descriptor.initial !== undefined
      ? descriptor.initial
      : (descriptor.minimum !== undefined ? descriptor.minimum : descriptor.limits?.min);
    if (!Number.isInteger(minRaw) || minRaw < 0) {
      throw new RangeError(`Invalid WasmTable initial size: ${minRaw}`);
    }
    const maxRaw = descriptor.maximum !== undefined
      ? descriptor.maximum
      : (descriptor.max !== undefined ? descriptor.max : descriptor.limits?.max);
    if (maxRaw !== undefined) {
      if (!Number.isInteger(maxRaw) || maxRaw < minRaw) {
        throw new RangeError(`Invalid WasmTable maximum size: ${maxRaw}`);
      }
    }
    const maxTableLimit = limits.maxTableElements !== undefined ? limits.maxTableElements : MAX_TABLE_LEN;
    if (minRaw > maxTableLimit) {
      throw new ResourceLimitError(`Initial table size (${minRaw}) exceeds maxTableElements (${maxTableLimit})`);
    }
    this.elemType = elemType;
    this.minimum = minRaw;
    this.maximum = maxRaw;
    this.maxTableLimit = maxTableLimit;
    this.typeEnv = descriptor.typeEnv || null;

    const fillVal = initialValue !== undefined
      ? coerceJSValueToWasm(initialValue, elemType, this.typeEnv)
      : defaultValueForType(elemType);
    this._elements = new Array(minRaw).fill(fillVal);
  }

  get length() {
    return this._elements.length;
  }

  _getInternal(index) {
    const idx = index >>> 0;
    if (idx >= this._elements.length) {
      throw new Trap('out of bounds table access');
    }
    return this._elements[idx];
  }

  _setInternal(index, value) {
    const idx = index >>> 0;
    if (idx >= this._elements.length) {
      throw new Trap('out of bounds table access');
    }
    this._elements[idx] = value;
  }

  _growInternal(delta, initValue = null) {
    const d = delta >>> 0;
    const oldLen = this._elements.length;
    const newLen = oldLen + d;
    if (newLen > 0xffffffff) return -1;
    if (this.maximum !== undefined && newLen > this.maximum) return -1;
    if (this.maxTableLimit !== undefined && newLen > this.maxTableLimit) return -1;
    for (let i = 0; i < d; i++) {
      this._elements.push(initValue);
    }
    return oldLen;
  }

  _fillInternal(dst, value, length) {
    const d = BigInt(dst >>> 0);
    const n = BigInt(length >>> 0);
    if (d + n > BigInt(this._elements.length)) {
      throw new Trap('out of bounds table access');
    }
    for (let i = 0; i < Number(n); i++) {
      this._elements[Number(d) + i] = value;
    }
  }

  copyTo(dstTable, dst, src, length) {
    const d = BigInt(dst >>> 0);
    const s = BigInt(src >>> 0);
    const n = BigInt(length >>> 0);
    if (d + n > BigInt(dstTable._elements.length) || s + n > BigInt(this._elements.length)) {
      throw new Trap('out of bounds table access');
    }
    const len = Number(n);
    const dstOff = Number(d);
    const srcOff = Number(s);
    if (len === 0) return;
    if (dstTable === this && dstOff > srcOff) {
      for (let i = len - 1; i >= 0; i--) {
        dstTable._elements[dstOff + i] = this._elements[srcOff + i];
      }
    } else {
      for (let i = 0; i < len; i++) {
        dstTable._elements[dstOff + i] = this._elements[srcOff + i];
      }
    }
  }

  initFromSegment(segment, dst, src, length) {
    const d = BigInt(dst >>> 0);
    const s = BigInt(src >>> 0);
    const n = BigInt(length >>> 0);
    const segLen = segment.dropped ? 0n : BigInt(segment.elements.length);
    if (d + n > BigInt(this._elements.length) || s + n > segLen) {
      throw new Trap('out of bounds table access');
    }
    const len = Number(n);
    const dstOff = Number(d);
    const srcOff = Number(s);
    for (let i = 0; i < len; i++) {
      this._elements[dstOff + i] = segment.elements[srcOff + i];
    }
  }

  get(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._elements.length) {
      throw new RangeError(`Table index ${index} out of bounds`);
    }
    return exportWasmValueToJS(this._elements[index], this.elemType);
  }

  set(index, value = null) {
    if (!Number.isInteger(index) || index < 0 || index >= this._elements.length) {
      throw new RangeError(`Table index ${index} out of bounds`);
    }
    this._elements[index] = coerceJSValueToWasm(value, this.elemType, this.typeEnv);
  }

  grow(delta, value = null) {
    if (!Number.isInteger(delta) || delta < 0) {
      throw new RangeError(`Invalid table grow delta: ${delta}`);
    }
    const coerced = coerceJSValueToWasm(value, this.elemType, this.typeEnv);
    const res = this._growInternal(delta, coerced);
    if (res === -1) {
      throw new RangeError(`Failed to grow table by ${delta}`);
    }
    return res;
  }
}

class WasmGlobal {
  constructor(descriptor = {}, initialValue = undefined) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmGlobal descriptor must be an object');
    }
    const rawType = descriptor.value !== undefined ? descriptor.value : descriptor.valType;
    this.valType = normalizeValType(rawType);
    this.mutable = Boolean(descriptor.mutable);
    this.typeEnv = descriptor.typeEnv || null;
    if (initialValue === undefined && descriptor._internalInit !== undefined) {
      this._value = descriptor._internalInit;
    } else if (initialValue !== undefined) {
      this._value = coerceJSValueToWasm(initialValue, this.valType, this.typeEnv);
    } else {
      this._value = defaultValueForType(this.valType);
    }
  }

  _getInternal() {
    return this._value;
  }

  _setInternal(val) {
    if (!this.mutable) {
      throw new TypeError('Cannot set immutable global');
    }
    this._value = val;
  }

  get value() {
    return exportWasmValueToJS(this._value, this.valType);
  }

  set value(val) {
    if (!this.mutable) {
      throw new TypeError('Cannot mutate an immutable WasmGlobal');
    }
    this._value = coerceJSValueToWasm(val, this.valType, this.typeEnv);
  }

  valueOf() {
    return this.value;
  }
}

class WasmTag {
  constructor(descriptor = {}) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmTag descriptor must be an object');
    }
    if (descriptor._funcType) {
      this.funcType = descriptor._funcType;
      this.parameters = this.funcType.params;
    } else {
      const params = Array.isArray(descriptor.parameters)
        ? descriptor.parameters.map(normalizeValType)
        : [];
      const env = new TypeEnvironment([{ kind: 'func', params, results: [], subtype: { explicit: false, isFinal: true, supertypes: [] } }]);
      this.funcType = env.get(0);
      this.parameters = this.funcType.params;
    }
  }
}

function createExportedFunctionWrapper(funcRef) {
  if (funcRef.jsWrapper) return funcRef.jsWrapper;
  const wrapper = function (...args) {
    return executeFunction(funcRef, args);
  };
  Object.defineProperty(wrapper, 'length', {
    value: funcRef.typeDef.params.length,
    configurable: true
  });
  Object.defineProperty(wrapper, 'name', {
    value: String(funcRef.funcIndex ?? 'wasm_func'),
    configurable: true
  });
  Object.defineProperty(wrapper, '__wasmFuncRef', {
    value: funcRef,
    enumerable: false
  });
  funcRef.jsWrapper = wrapper;
  return wrapper;
}

class WasmModule {
  constructor(bytes, options = {}) {
    let u8;
    if (bytes instanceof ArrayBuffer) {
      u8 = new Uint8Array(bytes);
    } else if (ArrayBuffer.isView(bytes)) {
      u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else {
      throw new TypeError('WasmModule requires an ArrayBuffer or ArrayBufferView (Uint8Array)');
    }
    this.options = options;
    try {
      this._decoded = decodeModule(u8, { copyInput: true });
    } catch (err) {
      throw wrapDecodeError(err);
    }
    this._validated = validateModule(this._decoded, options);
  }

  static exports(moduleObject) {
    if (!(moduleObject instanceof WasmModule)) {
      throw new TypeError('WasmModule.exports requires a WasmModule');
    }
    return moduleObject._decoded.exportSection.map(exp => ({
      name: exp.name,
      kind: EXPORT_KIND_NAME[exp.kind]
    }));
  }

  static imports(moduleObject) {
    if (!(moduleObject instanceof WasmModule)) {
      throw new TypeError('WasmModule.imports requires a WasmModule');
    }
    return moduleObject._decoded.importSection.map(imp => ({
      module: imp.module,
      name: imp.name,
      kind: EXPORT_KIND_NAME[imp.kind]
    }));
  }

  static customSections(moduleObject, sectionName) {
    if (!(moduleObject instanceof WasmModule)) {
      throw new TypeError('WasmModule.customSections requires a WasmModule');
    }
    const name = String(sectionName);
    return moduleObject._decoded.customSections
      .filter(sec => sec.name === name)
      .map(sec => sec.payload.slice().buffer);
  }
}

class WasmInstance {
  constructor(moduleObject, importObject = {}, options = {}) {
    const mod = moduleObject instanceof WasmModule
      ? moduleObject
      : new WasmModule(moduleObject, options);

    this.module = mod;
    const decoded = mod._decoded;
    const validated = mod._validated;
    this.typeEnv = validated.typeEnv;
    this.limits = { ...DEFAULT_LIMITS, ...(mod.options?.limits || {}), ...(options.limits || {}) };
    this.gcCount = 0;

    this.functions = [];
    this.tables = [];
    this.memories = [];
    this.globals = [];
    this.tags = [];
    this.dataSegments = [];
    this.elementSegments = [];

    this._resolveImports(decoded, validated, importObject);
    this._allocateDefinedEntities(decoded, validated);
    this._initializeSegments(decoded, validated);
    this.exports = this._buildExports(decoded);

    if (decoded.startSection !== null) {
      const startFn = this.functions[decoded.startSection];
      executeFunction(startFn, [], { limits: this.limits, fuel: options.fuel });
    }
  }

  _resolveImports(decoded, validated, importObject) {
    if (decoded.importSection.length > 0 && (!importObject || typeof importObject !== 'object')) {
      throw new TypeError('importObject must be an object when module has imports');
    }
    for (const imp of decoded.importSection) {
      const modNamespace = importObject ? importObject[imp.module] : undefined;
      if (!modNamespace || (typeof modNamespace !== 'object' && typeof modNamespace !== 'function')) {
        throw new LinkError(`Missing import module "${imp.module}"`);
      }
      if (!(imp.name in modNamespace) || modNamespace[imp.name] === undefined) {
        throw new LinkError(`Missing import "${imp.module}.${imp.name}"`);
      }
      const extVal = modNamespace[imp.name];
      switch (imp.kind) {
        case 0x00: { // Function
          if (typeof extVal !== 'function') {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a function`);
          }
          const expectedType = this.typeEnv.get(imp.typeIdx);
          if (extVal.__wasmFuncRef) {
            const ref = extVal.__wasmFuncRef;
            if (!this.typeEnv.isHeapSubtype(ref.typeDef, expectedType)) {
              throw new LinkError(`Imported function "${imp.module}.${imp.name}" signature mismatch`);
            }
            this.functions.push(ref);
          } else {
            const funcIndex = this.functions.length;
            const funcRef = {
              __wasmKind: 'func',
              isHost: true,
              hostFn: extVal,
              instance: this,
              funcIndex,
              typeDef: expectedType,
              jsWrapper: null
            };
            createExportedFunctionWrapper(funcRef);
            this.functions.push(funcRef);
          }
          break;
        }
        case 0x01: { // Table
          if (!(extVal instanceof WasmTable)) {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a WasmTable`);
          }
          const expectedElem = normalizeValType(imp.tableType.elemType);
          // Table element types are invariant (mutable reference slots)
          if (!this.typeEnv.isValueSubtype(extVal.elemType, expectedElem) ||
              !this.typeEnv.isValueSubtype(expectedElem, extVal.elemType)) {
            throw new LinkError(`Imported table "${imp.module}.${imp.name}" element type mismatch`);
          }
          const reqMin = imp.tableType.limits.min;
          const reqMax = imp.tableType.limits.max;
          if (extVal.length < reqMin) {
            throw new LinkError(`Imported table "${imp.module}.${imp.name}" length (${extVal.length}) is smaller than minimum (${reqMin})`);
          }
          if (reqMax !== undefined && (extVal.maximum === undefined || extVal.maximum > reqMax)) {
            throw new LinkError(`Imported table "${imp.module}.${imp.name}" maximum (${extVal.maximum}) exceeds required maximum (${reqMax})`);
          }
          this.tables.push(extVal);
          break;
        }
        case 0x02: { // Memory
          if (!(extVal instanceof WasmMemory)) {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a WasmMemory`);
          }
          const reqMin = imp.memoryType.min;
          const reqMax = imp.memoryType.max;
          if (extVal.pages < reqMin) {
            throw new LinkError(`Imported memory "${imp.module}.${imp.name}" pages (${extVal.pages}) is smaller than minimum (${reqMin})`);
          }
          if (reqMax !== undefined && (extVal.maximum === undefined || extVal.maximum > reqMax)) {
            throw new LinkError(`Imported memory "${imp.module}.${imp.name}" maximum (${extVal.maximum}) exceeds required maximum (${reqMax})`);
          }
          this.memories.push(extVal);
          break;
        }
        case 0x03: { // Global
          const expectedType = normalizeValType(imp.globalType.valType);
          const expectedMut = Boolean(imp.globalType.mutable);
          if (extVal instanceof WasmGlobal) {
            if (extVal.mutable !== expectedMut) {
              throw new LinkError(`Imported global "${imp.module}.${imp.name}" mutability mismatch`);
            }
            if (expectedMut) {
              if (!this.typeEnv.isValueSubtype(extVal.valType, expectedType) ||
                  !this.typeEnv.isValueSubtype(expectedType, extVal.valType)) {
                throw new LinkError(`Imported mutable global "${imp.module}.${imp.name}" type mismatch`);
              }
            } else if (!this.typeEnv.isValueSubtype(extVal.valType, expectedType)) {
              throw new LinkError(`Imported global "${imp.module}.${imp.name}" type mismatch`);
            }
            this.globals.push(extVal);
          } else {
            if (expectedMut) {
              throw new LinkError(`Imported mutable global "${imp.module}.${imp.name}" must be a WasmGlobal instance`);
            }
            try {
              const coerced = coerceJSValueToWasm(extVal, expectedType, this.typeEnv);
              this.globals.push(new WasmGlobal({
                valType: expectedType,
                mutable: false,
                typeEnv: this.typeEnv,
                _internalInit: coerced
              }));
            } catch (err) {
              throw new LinkError(`Invalid value for imported global "${imp.module}.${imp.name}": ${err.message}`);
            }
          }
          break;
        }
        case 0x04: { // Tag
          if (!(extVal instanceof WasmTag)) {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a WasmTag`);
          }
          const expectedType = this.typeEnv.get(imp.typeIdx);
          if (extVal.funcType.canonicalId !== expectedType.canonicalId) {
            throw new LinkError(`Imported tag "${imp.module}.${imp.name}" signature mismatch`);
          }
          this.tags.push(extVal);
          break;
        }
      }
    }
  }

  _allocateDefinedEntities(decoded, validated) {
    const importedFnCount = validated.importedCounts.functions;
    for (let i = importedFnCount; i < validated.functions.length; i++) {
      const fnMeta = validated.functions[i];
      const funcRef = {
        __wasmKind: 'func',
        isHost: false,
        instance: this,
        funcIndex: i,
        typeDef: fnMeta.funcType,
        body: fnMeta.body,
        localTypes: fnMeta.localTypes,
        jumpTable: fnMeta.jumpTable,
        jsWrapper: null
      };
      createExportedFunctionWrapper(funcRef);
      this.functions.push(funcRef);
    }

    for (const tbl of decoded.tableSection) {
      this.tables.push(new WasmTable({
        elemType: tbl.elemType,
        initial: tbl.limits.min,
        maximum: tbl.limits.max,
        typeEnv: this.typeEnv
      }, undefined, this.limits));
    }

    for (const mem of decoded.memorySection) {
      this.memories.push(new WasmMemory({
        initial: mem.min,
        maximum: mem.max
      }, this.limits));
    }

    for (const tag of decoded.tagSection) {
      this.tags.push(new WasmTag({
        _funcType: this.typeEnv.get(tag.typeIdx)
      }));
    }

    for (const g of decoded.globalSection) {
      const initVal = evaluateConstantExpression(g.initializer, this, this.limits);
      this.globals.push(new WasmGlobal({
        valType: g.globalType.valType,
        mutable: g.globalType.mutable,
        typeEnv: this.typeEnv,
        _internalInit: initVal
      }));
    }
  }

  _initializeSegments(decoded, validated) {
    // 1. Evaluate all element segments first
    for (let i = 0; i < validated.elementSegments.length; i++) {
      const seg = validated.elementSegments[i];
      const elements = seg.useExpressions
        ? seg.elementExpressions.map(expr => evaluateConstantExpression(expr, this, this.limits))
        : seg.elements.map(fnIdx => this.functions[fnIdx]);
      this.elementSegments.push({
        mode: seg.mode,
        tableIndex: seg.tableIndex,
        offsetExpression: seg.offsetExpression,
        elements,
        dropped: seg.mode === 'declarative'
      });
    }

    // 2. Prepare data segments
    for (let i = 0; i < validated.dataSegments.length; i++) {
      const seg = validated.dataSegments[i];
      this.dataSegments.push({
        mode: seg.mode,
        memoryIndex: seg.memoryIndex,
        offsetExpression: seg.offsetExpression,
        bytes: Uint8Array.from(seg.bytes),
        dropped: false
      });
    }

    // 3. Apply active element segments
    for (const seg of this.elementSegments) {
      if (seg.mode === 'active') {
        const offset = evaluateConstantExpression(seg.offsetExpression, this, this.limits) >>> 0;
        const table = this.tables[seg.tableIndex];
        table.initFromSegment(seg, offset, 0, seg.elements.length);
        seg.dropped = true;
        seg.elements = [];
      }
    }

    // 4. Apply active data segments
    for (const seg of this.dataSegments) {
      if (seg.mode === 'active') {
        const offset = evaluateConstantExpression(seg.offsetExpression, this, this.limits) >>> 0;
        const memory = this.memories[seg.memoryIndex];
        memory.initFromSegment(seg, offset, 0, seg.bytes.byteLength);
        seg.dropped = true;
        seg.bytes = new Uint8Array(0);
      }
    }
  }

  _buildExports(decoded) {
    const exportsObj = Object.create(null);
    for (const exp of decoded.exportSection) {
      switch (exp.kind) {
        case 0x00:
          exportsObj[exp.name] = createExportedFunctionWrapper(this.functions[exp.index]);
          break;
        case 0x01:
          exportsObj[exp.name] = this.tables[exp.index];
          break;
        case 0x02:
          exportsObj[exp.name] = this.memories[exp.index];
          break;
        case 0x03:
          exportsObj[exp.name] = this.globals[exp.index];
          break;
        case 0x04:
          exportsObj[exp.name] = this.tags[exp.index];
          break;
      }
    }
    return Object.freeze(exportsObj);
  }
}

module.exports = {
  WasmTable,
  WasmGlobal,
  WasmTag,
  WasmModule,
  WasmInstance,
  createExportedFunctionWrapper
};

  };
  __modules["./wasm-vm.js"] = function (module, exports, require) {
const {
  WasmError,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  Trap,
  GuestException,
  ResourceLimitError,
  HostError
} = __require("./vm/errors.js");
const { WasmMemory } = __require("./vm/memory.js");
const { WasmI31, WasmStruct, WasmArray } = __require("./vm/gc.js");
const { DEFAULT_LIMITS } = __require("./vm/validate.js");
const {
  WasmTable,
  WasmGlobal,
  WasmTag,
  WasmModule,
  WasmInstance
} = __require("./vm/store.js");

const CAPABILITIES = Object.freeze({
  mvp: true,
  multiValue: true,
  signExtension: true,
  nonTrappingFloatToInt: true,
  bulkMemory: true,
  referenceTypes: true,
  multiMemory: true,
  tailCall: true,
  fixedWidthSIMD: true,
  typedFunctionReferences: true,
  gc: true,
  exceptionHandling: true,
  legacyExceptions: true,
  extendedConstantExpressions: true,
  threadsAndAtomics: false,
  memory64: false,
  relaxedSIMD: false,
  componentModel: false
});

function isBufferSource(input) {
  return input instanceof ArrayBuffer || ArrayBuffer.isView(input);
}

function validate(bytes, options = {}) {
  if (!isBufferSource(bytes)) {
    throw new TypeError('validate requires an ArrayBuffer or ArrayBufferView');
  }
  try {
    new WasmModule(bytes, options);
    return true;
  } catch (err) {
    if (err instanceof DecodeError || err instanceof ValidationError || err instanceof UnsupportedFeatureError) {
      return false;
    }
    throw err;
  }
}

function validateDetailed(bytes, options = {}) {
  if (!isBufferSource(bytes)) {
    throw new TypeError('validateDetailed requires an ArrayBuffer or ArrayBufferView');
  }
  try {
    const module = new WasmModule(bytes, options);
    return { valid: true, module };
  } catch (error) {
    return { valid: false, error };
  }
}

function compileSync(bytes, options = {}) {
  return new WasmModule(bytes, options);
}

function compile(bytes, options = {}) {
  return Promise.resolve().then(() => compileSync(bytes, options));
}

function instantiateSync(source, importObject = {}, options = {}) {
  if (source instanceof WasmModule) {
    return new WasmInstance(source, importObject, options);
  }
  const module = new WasmModule(source, options);
  const instance = new WasmInstance(module, importObject, options);
  return { module, instance };
}

function instantiate(source, importObject = {}, options = {}) {
  return Promise.resolve().then(() => instantiateSync(source, importObject, options));
}

class WasmVM {
  constructor(options = {}) {
    this.options = {
      legacyExceptions: true,
      ...options,
      limits: { ...DEFAULT_LIMITS, ...(options.limits || {}) }
    };
  }

  capabilities() {
    return {
      ...CAPABILITIES,
      legacyExceptions: this.options.legacyExceptions !== false
    };
  }

  validate(bytes, overrides = {}) {
    return validate(bytes, { ...this.options, ...overrides });
  }

  validateDetailed(bytes, overrides = {}) {
    return validateDetailed(bytes, { ...this.options, ...overrides });
  }

  compileSync(bytes, overrides = {}) {
    return compileSync(bytes, { ...this.options, ...overrides });
  }

  compile(bytes, overrides = {}) {
    return compile(bytes, { ...this.options, ...overrides });
  }

  instantiateSync(source, importObject = {}, overrides = {}) {
    return instantiateSync(source, importObject, { ...this.options, ...overrides });
  }

  instantiate(source, importObject = {}, overrides = {}) {
    return instantiate(source, importObject, { ...this.options, ...overrides });
  }

  static capabilities() {
    return { ...CAPABILITIES };
  }

  static validate(bytes, options) {
    return validate(bytes, options);
  }

  static validateDetailed(bytes, options) {
    return validateDetailed(bytes, options);
  }

  static compileSync(bytes, options) {
    return compileSync(bytes, options);
  }

  static compile(bytes, options) {
    return compile(bytes, options);
  }

  static instantiateSync(source, importObject, options) {
    return instantiateSync(source, importObject, options);
  }

  static instantiate(source, importObject, options) {
    return instantiate(source, importObject, options);
  }

  static createWebAssemblyPolyfill(options = {}) {
    const vm = new WasmVM(options);
    return {
      Module: WasmModule,
      Instance: WasmInstance,
      Memory: WasmMemory,
      Table: WasmTable,
      Global: WasmGlobal,
      Tag: WasmTag,
      CompileError: ValidationError,
      LinkError,
      RuntimeError: Trap,
      Exception: GuestException,
      validate: bytes => vm.validate(bytes),
      compile: bytes => vm.compile(bytes),
      instantiate: (src, imports) => vm.instantiate(src, imports)
    };
  }
}

WasmVM.Module = WasmModule;
WasmVM.Instance = WasmInstance;
WasmVM.Memory = WasmMemory;
WasmVM.Table = WasmTable;
WasmVM.Global = WasmGlobal;
WasmVM.Tag = WasmTag;

const exportedApi = {
  WasmVM,
  WasmModule,
  WasmInstance,
  WasmMemory,
  WasmTable,
  WasmGlobal,
  WasmTag,
  WasmI31,
  WasmStruct,
  WasmArray,
  WasmError,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  Trap,
  GuestException,
  ResourceLimitError,
  HostError,
  CAPABILITIES,
  DEFAULT_LIMITS,
  validate,
  validateDetailed,
  compile,
  compileSync,
  instantiate,
  instantiateSync,
  // Standard WebAssembly-compatible aliases
  Module: WasmModule,
  Instance: WasmInstance,
  Memory: WasmMemory,
  Table: WasmTable,
  Global: WasmGlobal,
  Tag: WasmTag,
  CompileError: ValidationError,
  RuntimeError: Trap
};

if (typeof globalThis !== 'undefined') {
  globalThis.MaiaWasmVM = exportedApi;
}

module.exports = exportedApi;

  };
  return __require("./wasm-vm.js");
});
