'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const WatAssembler = require('../wat-assembler.js');
const { WasmDisassembler, disassembleWASM } = require('../wasm-disassembler.js');
const { WasmLinker } = require('../wasm-linker.js');

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
const decode = bytes => new WasmDisassembler(HEADER).decodeInstructions(Buffer.from(bytes), []);
function parsed(bytes) {
  const dis = new WasmDisassembler(bytes);
  dis.disassemble();
  return dis;
}
const assembledCode = wat => [...parsed(asm.assemble(wat)).codeSection[0].code];

for (const op of [0x3f, 0x40]) {
  const name = op === 0x3f ? 'memory.size' : 'memory.grow';
  for (const index of [0, 1, 127, 128, 0xffffffff]) {
    assert.deepStrictEqual(decode([op, ...uleb(index), 1]), [`${name}${index ? ` ${index}` : ''}`, 'nop']);
    assert.deepStrictEqual(assembledCode(`(module (func ${name} ${index}))`),
      [op, ...uleb(index), 0x0b]);
  }
  assert.deepStrictEqual(decode([op, 0x80, 0, 1]), [name, 'nop']);
  assert.throws(() => decode([op, 0x80]), /Truncated/);
  assert.throws(() => decode([op, 0xff, 0xff, 0xff, 0xff, 0x10]), /range/);
}
console.log('PASS_memory_size_grow_complete_u32_indices_and_padding');

const scalar = [
  [0x28, 'i32.load', 2], [0x29, 'i64.load', 3], [0x2a, 'f32.load', 2], [0x2b, 'f64.load', 3],
  [0x2c, 'i32.load8_s', 0], [0x2d, 'i32.load8_u', 0],
  [0x2e, 'i32.load16_s', 1], [0x2f, 'i32.load16_u', 1],
  [0x30, 'i64.load8_s', 0], [0x31, 'i64.load8_u', 0],
  [0x32, 'i64.load16_s', 1], [0x33, 'i64.load16_u', 1],
  [0x34, 'i64.load32_s', 2], [0x35, 'i64.load32_u', 2],
  [0x36, 'i32.store', 2], [0x37, 'i64.store', 3], [0x38, 'f32.store', 2], [0x39, 'f64.store', 3],
  [0x3a, 'i32.store8', 0], [0x3b, 'i32.store16', 1],
  [0x3c, 'i64.store8', 0], [0x3d, 'i64.store16', 1], [0x3e, 'i64.store32', 2]
];
const vector = [
  [0, 'v128.load', 4], [1, 'v128.load8x8_s', 3], [2, 'v128.load8x8_u', 3],
  [3, 'v128.load16x4_s', 3], [4, 'v128.load16x4_u', 3],
  [5, 'v128.load32x2_s', 3], [6, 'v128.load32x2_u', 3],
  [7, 'v128.load8_splat', 0], [8, 'v128.load16_splat', 1],
  [9, 'v128.load32_splat', 2], [10, 'v128.load64_splat', 3],
  [11, 'v128.store', 4],
  [84, 'v128.load8_lane', 0, 15], [85, 'v128.load16_lane', 1, 7],
  [86, 'v128.load32_lane', 2, 3], [87, 'v128.load64_lane', 3, 1],
  [88, 'v128.store8_lane', 0, 15], [89, 'v128.store16_lane', 1, 7],
  [90, 'v128.store32_lane', 2, 3], [91, 'v128.store64_lane', 3, 1],
  [92, 'v128.load32_zero', 2], [93, 'v128.load64_zero', 3]
];
for (const [family, cases] of [[null, scalar], [0xfd, vector]]) {
  for (const [opcode, name, natural, lane] of cases) {
    const prefix = family === null ? [opcode] : [family, ...uleb(opcode)];
    const suffix = lane === undefined ? [] : [lane];
    for (const memory of [0, 1, 128]) {
      const bytes = [...prefix, natural | (memory ? 0x40 : 0), ...(memory ? uleb(memory) : []), 0x82, 1, ...suffix];
      const wat = `${name}${memory ? ` ${memory}` : ''} offset=130 align=${2 ** natural}${lane === undefined ? '' : ` ${lane}`}`;
      assert.deepStrictEqual(decode([...bytes, 1]), [wat, 'nop']);
      assert.deepStrictEqual(assembledCode(`(module (func ${wat}))`), [...bytes, 0x0b]);
    }
    const minimal = `${name}${lane === undefined ? '' : ` ${lane}`}`;
    assert.deepStrictEqual(assembledCode(`(module (func ${minimal}))`),
      [...prefix, natural, 0, ...suffix, 0x0b], `${name}: natural default alignment`);
    for (let align = 0; align <= natural; align++) {
      const wat = `${name} 1 align=${2 ** align}${lane === undefined ? '' : ` ${lane}`}`;
      assert.deepStrictEqual(assembledCode(`(module (func ${wat}))`),
        [...prefix, align | 0x40, 1, 0, ...suffix, 0x0b]);
    }
    assert.throws(() => decode([...prefix, natural + 1, 0, ...suffix]), /alignment/);
    assert.throws(() => decode([...prefix, 0x80, 1, 0]), /memarg flags/);
    assert.throws(() => decode([...prefix, 0x40]), /bounds|Truncated/);
    assert.throws(() => decode([...prefix, 0x40, 1]), /bounds|Truncated/);
  }
}
assert.deepStrictEqual(decode([0x28, 0x42, 0, 0, 1]), ['i32.load offset=0 align=4', 'nop']);
assert.deepStrictEqual(decode([0x28, 0, ...Array(9).fill(0x80), 0, 1]),
  ['i32.load offset=0 align=1', 'nop']);
assert.throws(() => decode([0x28, 0, 0x80, 0x80, 0x80, 0x80, 0x10]), /memory32.*u32/);
assert.throws(() => decode([0x28, 0, ...Array(10).fill(0x80), 0]), /large/);
for (const attrs of ['align=0', 'align=3', 'align=8', 'offset=4294967296']) {
  assert.throws(() => asm.assemble(`(module (func i32.load ${attrs}))`), /Invalid/);
}
assert.throws(() => asm.assemble('(module (func i32.load $missing))'), /Unknown memory/);
assert.deepStrictEqual(assembledCode('(module (memory $a 1) (memory $b 1) (func i32.load $b))'),
  [0x28, 0x42, 1, 0, 0x0b]);
assert.deepStrictEqual(assembledCode('(module (func i32.load offset=7))'), [0x28, 2, 7, 0x0b]);
assert.deepStrictEqual(assembledCode('(module (func i32.load align=1))'), [0x28, 0, 0, 0x0b]);
assert.deepStrictEqual(assembledCode('(module (func v128.load32_lane 1 offset=8 align=4 3))'),
  [0xfd, 86, 0x42, 1, 8, 3, 0x0b]);
console.log('PASS_all_45_scalar_simd_memargs_indices_alignment_and_lane_operands');

for (const flags of [2, 3, 4, 5, 0x80]) {
  for (const [id, prefix] of [[5, [1]], [4, [1, 0x70]], [2, [1, 0, 0, 2]]]) {
    assert.throws(() => disassembleWASM(binary(section(id, [...prefix, flags, 0, 0]))), /Unsupported limits flags/);
  }
}
for (const limits of [[1, 2, 1], [0, ...uleb(65537)], [1, 0, ...uleb(65537)]]) {
  assert.throws(() => disassembleWASM(binary(section(5, [1, ...limits]))), /limits|65536/);
}
for (const wat of ['(module (memory 2 1))', '(module (memory 65537))', '(module (table 2 1 funcref))']) {
  assert.throws(() => asm.assemble(wat), /limits/);
}
assert.strictEqual(parsed(binary(section(5, [1, 1, ...uleb(65536), ...uleb(65536)]))).memorySection[0].max, 65536);
assert.strictEqual(parsed(binary(section(4, [1, 0x70, 0, ...uleb(0xffffffff)]))).tableSection[0].limits.min, 0xffffffff);
assert.strictEqual(parsed(binary(section(5, [1, 0, ...Array(9).fill(0x80), 0]))).memorySection[0].min, 0);
assert.throws(() => disassembleWASM(binary(section(5, [1, 0, 0x80, 0x80, 0x80, 0x80, 0x10]))), /limits require u32/);
console.log('PASS_memory32_table32_limits_and_unsupported_address_shared_flags');

assert.deepStrictEqual(decode([0xfc, 8, 2, 1, 1]), ['memory.init 1 2', 'nop']);
assert.deepStrictEqual(assembledCode('(module (func memory.init 1 2))'), [0xfc, 8, 2, 1, 0x0b]);
assert.deepStrictEqual(assembledCode('(module (func memory.init 2))'), [0xfc, 8, 2, 0, 0x0b]);
assert.deepStrictEqual(assembledCode('(module (func memory.init 2 nop))'), [0xfc, 8, 2, 0, 1, 0x0b]);
assert.deepStrictEqual(assembledCode('(module (memory $a 1) (memory $b 1) (data $d "x") (func memory.init $b $d))'),
  [0xfc, 8, 0, 1, 0x0b]);
for (const instruction of ['memory.size $bad', 'memory.grow $bad', 'memory.fill $bad',
  'memory.copy $bad 0', 'memory.init $bad 0']) {
  assert.throws(() => asm.assemble(`(module (func ${instruction}))`), /Unknown memory/);
}
console.log('PASS_standard_memory_init_text_memory_then_data_binary_data_then_memory');

const program = [
  0x41, 0, 0x41, 0, 0x41, 1, 0xfc, 8, 2, 1,
  0x41, 1, 0x41, 0, 0x41, 1, 0xfc, 10, 1, 0,
  0x41, 2, 0x41, 51, 0x41, 1, 0xfc, 11, 1,
  0x41, 1, 0x40, 1, 0x1a,
  0x41, 0, 0x2d, 0x40, 1, 0, 0x3f, 1, 0x6a, 0x0b
];
const original = binary(
  section(1, [1, 0x60, 0, 1, 0x7f]),
  section(3, [1, 0]),
  section(5, [2, 1, 1, 3, 1, 1, 3]),
  section(7, [3, 3, 114, 117, 110, 0, 0, 1, 97, 2, 0, 1, 98, 2, 1]),
  section(12, [3]),
  section(10, [1, program.length + 1, 0, ...program]),
  section(11, [3, 0, 0x41, 0, 0x0b, 1, 17, 1, 1, 0xaa, 1, 1, 42])
);
const multiMemory = WebAssembly.validate(binary(section(5, [2, 0, 0, 0, 0])));
const rebuilt = asm.assemble(disassembleWASM(original));
const native = globalThis.WebAssembly;
try {
  globalThis.WebAssembly = undefined;
  assert.strictEqual(disassembleWASM(asm.assemble(disassembleWASM(original))), disassembleWASM(rebuilt));
} finally {
  globalThis.WebAssembly = native;
}
console.log('PASS_multi_memory_roundtrip_without_native_webassembly');
function execute(bytes) {
  assert.ok(WebAssembly.validate(bytes), disassembleWASM(bytes));
  const { exports } = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  assert.strictEqual(exports.run(), 44);
  assert.deepStrictEqual([...new Uint8Array(exports.b.buffer, 0, 3)], [42, 17, 51]);
  assert.strictEqual(new Uint8Array(exports.a.buffer)[0], 17);
  assert.strictEqual(exports.b.buffer.byteLength, 2 * 65536);
}
if (multiMemory) {
  execute(original);
  execute(rebuilt);
  for (const [, name, , lane] of vector) {
    const wat = `(module (memory 1) (memory 1) (func unreachable ${name} 1 offset=0 align=1${lane === undefined ? '' : ` ${lane}`} drop))`;
    assert.ok(WebAssembly.validate(asm.assemble(wat)), wat);
  }
  const trap = asm.assemble('(module (memory 1) (memory 1) (func (result i32) i32.const 1 i32.load 1 offset=4294967295) (export "f" (func 0)))');
  assert.throws(() => new WebAssembly.Instance(new WebAssembly.Module(trap)).exports.f(), WebAssembly.RuntimeError);
  const lane = asm.assemble(`(module (memory 1) (memory 1)
    (data (memory 1) (offset i32.const 8) "\\44\\33\\22\\11")
    (func (result i32) i32.const 0
      v128.const i8x16 ${Array(16).fill(0).join(' ')}
      v128.load32_lane 1 offset=8 align=4 3
      i32x4.extract_lane 3)
    (export "f" (func 0)))`);
  for (const bytes of [lane, asm.assemble(disassembleWASM(lane))]) {
    assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.f(), 0x11223344);
  }
  console.log('PASS_native_multi_memory_results_growth_bulk_effects_simd_and_traps');
} else {
  console.log('SKIP native multi-memory oracles: engine lacks support');
}

const wabt = spawnSync('wat2wasm', ['--version'], { encoding: 'utf8' });
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP independent WABT memory oracle: wat2wasm unavailable');
} else {
  assert.ifError(wabt.error);
  assert.strictEqual(wabt.status, 0, wabt.stderr);
  const result = spawnSync('wat2wasm', ['--enable-multi-memory', '-', '-o', '/dev/stdout'], { input: disassembleWASM(original) });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, String(result.stderr));
  if (multiMemory) execute(result.stdout);
  console.log('PASS_independent_wabt_multi_memory_encoding');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-memory-link-'));
const files = ['first.wasm', 'app.wasm'].map(name => path.join(tempDir, name));
try {
  fs.writeFileSync(files[0], asm.assemble('(module (memory 1) (data (i32.const 0) "\\11"))'));
  fs.writeFileSync(files[1], asm.assemble('(module (memory 1) (data (i32.const 0) "\\25") (func (result i32) i32.const 0 i32.load8_u) (export "run" (func 0)))'));
  const result = new WasmLinker().linkStatic(files, { entry: 'app' }).wasm;
  assert.ok(disassembleWASM(result).includes('i32.load8_u 1 offset=0 align=1'));
  if (multiMemory) {
    assert.ok(WebAssembly.validate(result));
    assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(result)).exports.run(), 37);
  }
  fs.writeFileSync(files[1], original);
  const linked = new WasmLinker().linkStatic([files[1]], { entry: 'app' }).wasm;
  if (multiMemory) execute(linked);
  const passiveOnly = asm.assemble('(module (data "x"))');
  fs.writeFileSync(files[1], passiveOnly);
  assert.strictEqual(parsed(new WasmLinker().linkStatic([files[1]]).wasm).dataSection[0].mode, 'passive');
  const paddedBody = [0, 0x41, 0, 0x2d, 0, ...Array(9).fill(0x80), 0, 0x0b];
  const paddedOffset = binary(
    section(1, [1, 0x60, 0, 1, 0x7f]), section(3, [1, 0]), section(5, [1, 0, 1]),
    section(10, [1, paddedBody.length, ...paddedBody]));
  fs.writeFileSync(files[1], paddedOffset);
  const paddedLinked = parsed(new WasmLinker().linkStatic([files[1]]).wasm);
  assert.deepStrictEqual([...paddedLinked.codeSection[0].code], paddedBody.slice(1));
  console.log('PASS_static_linker_implicit_and_explicit_memory_index_remapping');
} finally {
  for (const file of files) if (fs.existsSync(file)) fs.unlinkSync(file);
  fs.rmdirSync(tempDir);
}
console.log('\nAll memory32/multi-memory binary regressions passed.');
