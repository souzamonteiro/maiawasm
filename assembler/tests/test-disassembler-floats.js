'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const WatAssembler = require('../wat-assembler.js');
const { WasmDisassembler, disassembleWASM } = require('../wasm-disassembler.js');
const { quoteWatFloat, encodeWatFloat } = require('../wasm-floats.js');

const HEADER = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const asm = new WatAssembler();
function uleb(value) {
  const bytes = [];
  do {
    const byte = value & 0x7f;
    value >>>= 7;
    bytes.push(byte | (value ? 0x80 : 0));
  } while (value);
  return bytes;
}
const section = (id, bytes) => Buffer.from([id, ...uleb(bytes.length), ...bytes]);
const binary = (...sections) => Buffer.concat([HEADER, ...sections]);
function raw(bits, width) {
  const bytes = Buffer.alloc(width / 8);
  if (width === 32) bytes.writeUInt32LE(Number(bits));
  else bytes.writeBigUInt64LE(bits);
  return bytes;
}
function parse(bytes) {
  const dis = new WasmDisassembler(bytes);
  dis.disassemble();
  return dis;
}
const code = wat => parse(asm.assemble(wat)).codeSection[0].code;
const edges = new Map([
  [32, [0n, 1n, 0x7fffffn, 0x800000n, 0x800001n, 0x3f000000n, 0x3f800000n,
    0x3f800001n, 0x7f7fffffn, 0x7f800000n, 0x7f800001n, 0x7f80000bn, 0x7fbfffffn,
    0x7fc00000n, 0x7fffffffn]],
  [64, [0n, 1n, 0xfffffffffffffn, 0x10000000000000n, 0x10000000000001n,
    0x3fe0000000000000n, 0x3ff0000000000000n, 0x3ff0000000000001n,
    0x7fefffffffffffffn, 0x7ff0000000000000n, 0x7ff0000000000001n, 0x7ff000000000000bn,
    0x7ff7ffffffffffffn, 0x7ff8000000000000n, 0x7fffffffffffffffn]]
]);
const binaryCases = [];

for (const [width, positive] of edges) {
  const patterns = [...positive, ...positive.map(bits => bits | (1n << BigInt(width - 1)))];
  const constant = width === 32 ? 0x43 : 0x44;
  const reinterpret = width === 32 ? 0xbc : 0xbd;
  const valueType = width === 32 ? 0x7f : 0x7e;
  const bodies = patterns.map(bits => {
    const body = [0, constant, ...raw(bits, width), reinterpret, 0x0b];
    return [...uleb(body.length), ...body];
  });
  const source = binary(
    section(1, [1, 0x60, 0, 1, valueType]),
    section(3, [patterns.length, ...patterns.map(() => 0)]),
    section(6, [patterns.length, ...patterns.flatMap(bits =>
      [width === 32 ? 0x7d : 0x7c, 0, constant, ...raw(bits, width), 0x0b])]),
    section(7, [patterns.length, ...patterns.flatMap((_, i) => {
      const name = Buffer.from(`f${i}`);
      return [name.length, ...name, 0, i];
    })]),
    section(10, [patterns.length, ...bodies.flat()])
  );
  const wat = disassembleWASM(source);
  binaryCases.push({ width, source, wat });
  const rebuilt = asm.assemble(wat);
  assert.deepStrictEqual(rebuilt, source, `f${width}: function/global byte identity`);
  for (const bytes of [source, rebuilt]) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    patterns.forEach((bits, i) => {
      const result = instance.exports[`f${i}`]();
      const actual = width === 32 ? BigInt(result >>> 0) : BigInt.asUintN(64, result);
      assert.strictEqual(actual, bits, `f${width}: reinterpret ${bits.toString(16)}`);
    });
  }
  const native = globalThis.WebAssembly;
  try {
    globalThis.WebAssembly = undefined;
    assert.deepStrictEqual(asm.assemble(disassembleWASM(source)), source);
  } finally {
    globalThis.WebAssembly = native;
  }
  for (let length = 0; length < width / 8; length++) {
    assert.throws(() => new WasmDisassembler(HEADER).decodeInstructions(
      Buffer.from([constant, ...Buffer.alloc(length)]), []), /bounds|Truncated/);
  }
}
console.log('PASS_scalar_global_function_float_bits_signed_zero_infinities_nan_payloads_and_reinterpret');

let state = 0x12345678;
function randomU32() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
for (const width of [32, 64]) {
  for (let i = 0; i < 4096; i++) {
    const bits = width === 32 ? BigInt(randomU32()) : BigInt(randomU32()) << 32n | BigInt(randomU32());
    const bytes = raw(bits, width);
    const padded = Buffer.concat([Buffer.from([0xaa]), bytes, Buffer.from([0xbb])]);
    assert.deepStrictEqual(encodeWatFloat(quoteWatFloat(padded, 1, width), width), bytes);
  }
}
console.log('PASS_8192_deterministic_raw_bit_roundtrips_with_nonzero_offsets');

const literals = [
  [32, '0', 0n], [32, '-0', 0x80000000n], [32, '+inf', 0x7f800000n],
  [32, '+3', 0x40400000n], [32, '-3', 0xc0400000n], [32, '3.', 0x40400000n],
  [32, '0x1.8_0p+0_1', 0x40400000n], [32, '1_0.5', 0x41280000n],
  [32, 'nan:0x40_0000', 0x7fc00000n],
  [32, '-nan:0x1', 0xff800001n], [32, 'nan', 0x7fc00000n],
  [32, '0x1.8p+1', 0x40400000n], [32, '-0x1.8p+1', 0xc0400000n],
  [32, '1.000000059604644775390625', 0x3f800000n],
  [32, '1.000000059604644775390626', 0x3f800001n],
  [32, '1.000000059604644775390624', 0x3f800000n],
  [32, '1.000000178813934326171875', 0x3f800002n],
  [32, '0x1p-150', 0n], [32, '-0x1p-150', 0x80000000n],
  [32, '0x1.0000000000001p-150', 1n],
  [32, '0xffffffp-150', 0x800000n], [32, '0xffffffp+104', 0x7f7fffffn],
  [64, '-0', 0x8000000000000000n], [64, '-inf', 0xfff0000000000000n],
  [64, '+nan:0x1', 0x7ff0000000000001n], [64, '-nan', 0xfff8000000000000n],
  [64, '0x1.8p+1', 0x4008000000000000n],
  [64, '0x20000000000001p-53', 0x3ff0000000000000n],
  [64, '0x2000000000000100001p-73', 0x3ff0000000000001n],
  [64, '0x20000000000003p-53', 0x3ff0000000000002n],
  [64, '0x1p-1075', 0n], [64, '0x1.0001p-1075', 1n],
  [64, '0x1fffffffffffffp-1075', 0x10000000000000n],
  [64, '0x1fffffffffffffp+971', 0x7fefffffffffffffn],
  [32, '1e-999999999999999999', 0n], [64, '-1e-999999999999999999', 0x8000000000000000n],
  [64, '0e+999999999999999999', 0n], [64, '1.7976931348623157e308', 0x7fefffffffffffffn]
];
for (const [width, text, bits] of literals) {
  assert.deepStrictEqual(encodeWatFloat(text, width), raw(bits, width), `${width}: ${text}`);
  let actual;
  assert.doesNotThrow(() => { actual = code(`(module (func f${width}.const ${text}))`); }, `${width}: ${text}`);
  assert.deepStrictEqual(actual,
    Buffer.from([width === 32 ? 0x43 : 0x44, ...raw(bits, width), 0x0b]), `assembler ${width}: ${text}`);
}
for (const width of [32, 64]) {
  for (const text of ['nan:0x0', `nan:0x${width === 32 ? '800000' : '10000000000000'}`,
    '1e999999999999999999', '0x1p999999999999999999']) {
    assert.throws(() => asm.assemble(`(module (func f${width}.const ${text}))`), /payload|overflow/);
  }
  assert.throws(() => encodeWatFloat('1', 16), /Unsupported/);
  assert.throws(() => quoteWatFloat(Buffer.alloc(8), -1, 32), /bounds/);
  assert.throws(() => quoteWatFloat(Buffer.alloc(8), NaN, 32), /bounds/);
  assert.throws(() => asm.assemble(`(module (func f${width}.const))`), /Parse failed/);
  for (const text of ['junk', '1.0tail', 'nan:0x', '1__0.0']) {
    assert.throws(() => encodeWatFloat(text, width), /Invalid/);
  }
}
assert.throws(() => encodeWatFloat('0x1ffffffp+103', 32), /overflow/);
assert.throws(() => encodeWatFloat('0x3fffffffffffffp+970', 64), /overflow/);
const midpoint32 = Buffer.alloc(4);
midpoint32.writeFloatLE(0xffffff * 2 ** -150);
assert.deepStrictEqual(midpoint32, raw(0x800000n, 32));
const decimalMidpoint64 = ((2n ** 53n - 1n) * 5n ** 1075n).toString().padStart(1075, '0');
const midpoint64 = Buffer.alloc(8);
midpoint64.writeDoubleLE(Number(`0.${decimalMidpoint64}`));
assert.deepStrictEqual(midpoint64, raw(0x10000000000000n, 64));
assert.deepStrictEqual(encodeWatFloat(`0.${decimalMidpoint64}`, 64), midpoint64);
for (let i = 0; i < 512; i++) {
  const text = `${randomU32()}.${randomU32()}e${(randomU32() % 600) - 300}`;
  for (const width of [32, 64]) {
    const value = width === 32 ? Math.fround(Number(text)) : Number(text);
    if (!Number.isFinite(value)) {
      assert.throws(() => encodeWatFloat(text, width), /overflow/);
    } else {
      const expected = Buffer.alloc(width / 8);
      if (width === 32) expected.writeFloatLE(value);
      else expected.writeDoubleLE(value);
      assert.deepStrictEqual(encodeWatFloat(text, width), expected, `native decimal ${width}: ${text}`);
    }
  }
}
console.log('PASS_exact_single_rounding_ties_even_subnormals_hex_floats_and_explicit_errors');

const vectors = [
  ['f32x4', ['-0', 'nan:0x1', '-inf', '0x1p-149'], [0x80000000n, 0x7f800001n, 0xff800000n, 1n], 32],
  ['f64x2', ['-nan:0x1', '0x1p-1074'], [0xfff0000000000001n, 1n], 64],
  ['i8x16', Array(16).fill('-1'), Array(16).fill(255n), 8],
  ['i16x8', Array(8).fill('-2'), Array(8).fill(65534n), 16],
  ['i32x4', ['1', '2', '3', '4'], [1n, 2n, 3n, 4n], 32],
  ['i64x2', ['-1', '18446744073709551615'], [0xffffffffffffffffn, 0xffffffffffffffffn], 64]
];
for (const [shape, values, patterns, width] of vectors) {
  const expected = Buffer.concat(patterns.map(bits => {
    if (width >= 32) return raw(bits, width);
    const bytes = Buffer.alloc(width / 8);
    bytes.writeUIntLE(Number(bits), 0, width / 8);
    return bytes;
  }));
  const wat = `(module (func (result v128) v128.const ${shape} ${values.join(' ')}))`;
  const bytes = asm.assemble(wat);
  assert.deepStrictEqual(parse(bytes).codeSection[0].code, Buffer.from([0xfd, 12, ...expected, 0x0b]), shape);
  assert.deepStrictEqual(asm.assemble(disassembleWASM(bytes)), bytes);
  assert.ok(WebAssembly.validate(bytes), shape);
  const stored = asm.assemble(`(module (memory 1)
    (func i32.const 0 v128.const ${shape} ${values.join(' ')} v128.store)
    (export "mem" (memory 0)) (export "run" (func 0)))`);
  for (const moduleBytes of [stored, asm.assemble(disassembleWASM(stored))]) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(moduleBytes));
    instance.exports.run();
    assert.deepStrictEqual(Buffer.from(instance.exports.mem.buffer, 0, 16), expected, `${shape}: stored lane bytes`);
  }
}
assert.throws(() => asm.assemble(`(module (func v128.const i8x16 256 ${Array(15).fill(0).join(' ')}))`), /Invalid i8x16 lane/);
assert.throws(() => asm.assemble('(module (func v128.const f64x2 nan:0x0 0.0))'), /payload/);
assert.throws(() => asm.assemble('(module (func v128.const f32x4 1e999 0.0 0.0 0.0))'), /overflow/);
console.log('PASS_simd_float_payloads_and_shape_aware_integer_lane_encoding');

const wabt = spawnSync('wat2wasm', ['--version'], { encoding: 'utf8' });
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP_wabt_float_oracle: wat2wasm unavailable');
} else {
  assert.ifError(wabt.error);
  assert.strictEqual(wabt.status, 0, wabt.stderr);
  for (const { width, source, wat } of binaryCases) {
    const oracle = spawnSync('wat2wasm', ['-', '-o', '/dev/stdout'], { input: wat });
    assert.ifError(oracle.error);
    assert.strictEqual(oracle.status, 0, oracle.stderr.toString());
    assert.deepStrictEqual(oracle.stdout, source, `WABT f${width}: disassembled module byte identity`);
  }
  for (const [width, text] of literals.filter(([, text]) => !text.includes('999999999999999999'))) {
    const wat = `(module (func (result f${width}) f${width}.const ${text}))`;
    const oracle = spawnSync('wat2wasm', ['-', '-o', '/dev/stdout'], { input: wat });
    assert.ifError(oracle.error);
    assert.strictEqual(oracle.status, 0, oracle.stderr.toString());
    const actual = parse(oracle.stdout).codeSection[0].code;
    const expected = code(wat);
    if (!actual.equals(expected) && wabt.stdout.trim() === '1.0.39' &&
        (text === '0xffffffp-150' || text === '0x1fffffffffffffp-1075')) {
      // WABT 1.0.39 rounds this normal/subnormal tie down rather than to even.
      const lower = width === 32 ? 0x7fffffn : 0xfffffffffffffn;
      assert.deepStrictEqual(actual, Buffer.from([width === 32 ? 0x43 : 0x44, ...raw(lower, width), 0x0b]));
      console.log(`KNOWN_WABT_1_0_39_MIDPOINT_DISAGREEMENT: f${width} ${text}; native IEEE rounding verified separately`);
    } else {
      assert.deepStrictEqual(actual, expected, `WABT ${width}: ${text}`);
    }
  }
  for (const [shape, values] of vectors) {
    const wat = `(module (func (result v128) v128.const ${shape} ${values.join(' ')}))`;
    const oracle = spawnSync('wat2wasm', ['-', '-o', '/dev/stdout'], { input: wat });
    assert.ifError(oracle.error);
    assert.strictEqual(oracle.status, 0, oracle.stderr.toString());
    assert.deepStrictEqual(parse(oracle.stdout).codeSection[0].code, code(wat), `WABT ${shape}`);
  }
  console.log('PASS_independent_wabt_scalar_rounding_and_simd_bit_identity');
}
console.log('\nAll raw float fidelity regressions passed.');
