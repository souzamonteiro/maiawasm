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

function section(id, bytes) {
  return Buffer.from([id, ...uleb(bytes.length), ...bytes]);
}

function moduleBytes(...sections) {
  return Buffer.concat([HEADER, ...sections]);
}

function instructions(bytes) {
  return new WasmDisassembler(HEADER).decodeInstructions(Buffer.from(bytes), []);
}

function assembledInstructions(source) {
  const dis = new WasmDisassembler(asm.assemble(source));
  dis.disassemble();
  assert.strictEqual(dis.codeSection.length, 1);
  return [...dis.codeSection[0].code];
}

const indices = [
  [0, [0]], [63, [63]], [64, [0xc0, 0]], [111, [0xef, 0]],
  [112, [0xf0, 0]], [127, [0xff, 0]], [128, [0x80, 1]],
  [0xffffffff, [0xff, 0xff, 0xff, 0xff, 0x0f]]
];
for (const [index, encoded] of indices) {
  assert.deepStrictEqual(instructions([0xd0, ...encoded, 0x01]), [`ref.null ${index}`, 'nop']);
  assert.deepStrictEqual(
    assembledInstructions(`(module (func ref.null ${index} drop))`),
    [0xd0, ...encoded, 0x1a, 0x0b]
  );
  for (const [opcode, name, nullable] of [
    [0x14, 'ref.test', false], [0x15, 'ref.test', true],
    [0x16, 'ref.cast', false], [0x17, 'ref.cast', true]
  ]) {
    const ref = `(ref ${nullable ? 'null ' : ''}${index})`;
    assert.deepStrictEqual(instructions([0xfb, opcode, ...encoded, 0x01]), [`${name} ${ref}`, 'nop']);
    assert.deepStrictEqual(
      assembledInstructions(`(module (func ${name} ${ref} drop))`),
      [0xfb, opcode, ...encoded, 0x1a, 0x0b]
    );
  }
}
assert.deepStrictEqual(instructions([0xd0, 0x69]), ['ref.null exn']);
assert.deepStrictEqual(assembledInstructions('(module (func ref.null exn drop))'), [0xd0, 0x69, 0x1a, 0x0b]);
assert.throws(() => instructions([0xd0, 0x68]), /Invalid abstract heap type/);
assert.throws(() => instructions([0xfb, 0x16, 0x68]), /Invalid abstract heap type/);
assert.deepStrictEqual(
  assembledInstructions('(module (type $t (func)) (func ref.null $t drop))'),
  [0xd0, 0, 0x1a, 0x0b]
);
assert.throws(() => asm.assemble('(module (func ref.null $missing drop))'), /Unknown heap type/);

for (const [opcode, op] of [[0x18, 'br_on_cast'], [0x19, 'br_on_cast_fail']]) {
  for (let flags = 0; flags <= 3; flags++) {
    const source = `(ref ${flags & 1 ? 'null ' : ''}any)`;
    const target = `(ref ${flags & 2 ? 'null ' : ''}eq)`;
    const bytes = [0xfb, opcode, flags, 0x82, 1, 0x6e, 0x6d];
    const wat = `${op} 130 ${source} ${target}`;
    assert.deepStrictEqual(instructions([...bytes, 0x01]), [wat, 'nop']);
    assert.deepStrictEqual(
      assembledInstructions(`(module (func ${'block '.repeat(130)}${wat} ${'end '.repeat(130)}))`),
      [...Array.from({ length: 130 }, () => [2, 0x40]).flat(), ...bytes, ...Array(131).fill(11)]
    );
  }
  assert.throws(() => instructions([0xfb, opcode, 4, 0, 0x6e, 0x6d]), /Invalid .* flags/);
  assert.throws(() => instructions([0xfb, opcode]), /Truncated/);
  assert.throws(() => instructions([0xfb, opcode, 0, 0, 0x6e]), /bounds|Truncated/);
}
assert.deepStrictEqual(
  assembledInstructions('(module (func ref.test funcref drop ref.cast externref drop))'),
  [0xfb, 0x15, 0x70, 0x1a, 0xfb, 0x17, 0x6f, 0x1a, 0x0b]
);
console.log('PASS standard_gc_variants_and_signed_heap_indices');

const catches = [0, 2, 5, 1, 3, 6, 2, 7, 3, 8];
const tryBytes = [0x1f, 0x40, 4, ...catches, 0x0b];
const tryWat = 'try_table (catch 2 5) (catch_ref 3 6) (catch_all 7) (catch_all_ref 8)';
assert.deepStrictEqual(instructions(tryBytes), [tryWat, 'end']);
assert.deepStrictEqual(
  assembledInstructions(`(module (func ${'block '.repeat(8)}${tryWat} end ${'end '.repeat(8)}))`),
  [...Array.from({ length: 8 }, () => [2, 0x40]).flat(), ...tryBytes, ...Array(9).fill(11)]
);
for (const bytes of [
  [0x1f, 0x40, 1], [0x1f, 0x40, 1, 0], [0x1f, 0x40, 1, 0, 2],
  [0x1f, 0x40, 1, 1, 2], [0x1f, 0x40, 1, 2], [0x1f, 0x40, 1, 3]
]) {
  assert.throws(() => instructions(bytes), /bounds|Truncated/);
}
assert.throws(() => instructions([0x1f, 0x40, 1, 4, 0]), /Invalid try_table catch kind/);
assert.deepStrictEqual(
  assembledInstructions('(module (func block $outer try_table (catch_all $outer) end end))'),
  [0x02, 0x40, 0x1f, 0x40, 1, 2, 0, 0x0b, 0x0b, 0x0b]
);
console.log('PASS try_table_catch_order_preservation_and_bounds');

const prefix = [
  section(1, [1, 0x60, 0, 0]),
  section(3, [1, 0]),
  section(4, [2, 0x70, 0, 1, 0x70, 0, 1])
];
const functionCode = section(10, [1, 2, 0, 0x0b]);
const offset = [0x41, 0, 0x0b];
const refFunc = [0xd2, 0, 0x0b];
const segments = [
  [0, ...offset, 1, 0],
  [1, 0, 1, 0],
  [2, 1, ...offset, 0, 1, 0],
  [3, 0, 1, 0],
  [4, ...offset, 1, ...refFunc],
  [5, 0x70, 1, ...refFunc],
  [6, 1, ...offset, 0x70, 1, ...refFunc],
  [7, 0x70, 1, ...refFunc]
];
for (let flags = 0; flags <= 7; flags++) {
  const original = moduleBytes(...prefix, section(9, [1, ...segments[flags]]), functionCode);
  assert.ok(WebAssembly.validate(original), `independent element fixture ${flags} must validate`);
  const dis = new WasmDisassembler(original);
  const wat = dis.disassemble();
  assert.strictEqual(dis.elementSection.length, 1);
  assert.strictEqual(dis.elementSection[0].flags, flags);
  assert.strictEqual(dis.elementSection[0].elements.length, 1);
  const rebuilt = asm.assemble(wat);
  assert.ok(WebAssembly.validate(rebuilt), `roundtrip element fixture ${flags} must validate`);
  const again = new WasmDisassembler(rebuilt);
  again.disassemble();
  assert.strictEqual(again.elementSection[0].mode, dis.elementSection[0].mode);
  assert.strictEqual(again.elementSection[0].tableIndex, dis.elementSection[0].tableIndex);
  assert.strictEqual(again.elementSection[0].useExpressions, dis.elementSection[0].useExpressions);
  assert.deepStrictEqual(again.elementSection[0].elements, dis.elementSection[0].elements);
}
const allSegments = moduleBytes(...prefix, section(9, [8, ...segments.flat()]), functionCode);
const allWat = disassembleWASM(allSegments);
assert.strictEqual((allWat.match(/\(elem/g) || []).length, 8);
assert.ok(WebAssembly.validate(asm.assemble(allWat)));
for (const flag of [1, 2, 3]) {
  const bytes = [1, flag, ...(flag === 2 ? [0, ...offset] : []), 1, 0];
  assert.throws(() => disassembleWASM(moduleBytes(section(9, bytes))), /Invalid element kind/);
}
assert.throws(() => disassembleWASM(moduleBytes(section(9, [1, 8]))), /Invalid element flags/);
assert.throws(() => disassembleWASM(moduleBytes(section(9, [1, 5, 0x7f, 0]))), /Invalid reference type/);
assert.throws(() => disassembleWASM(moduleBytes(section(9, [1, 5, 0x63]))), /bounds|Truncated/);

for (const reftype of [[0x70], [0x63, 0x70], [0x63, 0]]) {
  const original = moduleBytes(...prefix, section(9, [1, 5, ...reftype, 1, ...refFunc]), functionCode);
  const rebuilt = asm.assemble(disassembleWASM(original));
  assert.ok(WebAssembly.validate(rebuilt));
}
for (const wat of [
  '(module (table 1 externref) (elem (offset i32.const 0) externref (item ref.null extern)))',
  '(module (func) (table 1 funcref) (elem (offset i32.const 0) funcref (ref.func 0)))',
  '(module (func) (table 1 funcref) (elem (offset i32.const 0) (ref null func) (item ref.func 0)))'
]) {
  const wasm = asm.assemble(wat);
  assert.ok(WebAssembly.validate(wasm), `element assembler encoding: ${wat}`);
  assert.ok(WebAssembly.validate(asm.assemble(disassembleWASM(wasm))));
}
console.log('PASS all_element_modes_types_and_expression_forms');

// Runtime checks use the native engine only as an independent test oracle.
const gcProbe = moduleBytes(
  section(1, [1, 0x60, 0, 1, 0x7f]), section(3, [1, 0]),
  section(10, [1, 7, 0, 0xd0, 0x6e, 0xfb, 0x15, 0x6d, 0x0b])
);
if (WebAssembly.validate(gcProbe)) {
  for (const [op, expected] of [
    ['ref.test (ref eq)', 0], ['ref.test (ref null eq)', 1]
  ]) {
    const wasm = asm.assemble(`(module (func (result i32) ref.null any ${op}) (export "test" (func 0)))`);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm));
    assert.strictEqual(instance.exports.test(), expected);
  }
  for (const [op, traps] of [
    ['ref.cast (ref eq)', true], ['ref.cast (ref null eq)', false]
  ]) {
    const wasm = asm.assemble(`(module (func ref.null any ${op} drop) (export "test" (func 0)))`);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm));
    if (traps) assert.throws(() => instance.exports.test(), WebAssembly.RuntimeError);
    else instance.exports.test();
  }
  console.log('PASS native_oracle_gc_results_and_cast_traps');
} else {
  console.log('SKIP native_oracle_gc (engine lacks required GC support)');
}
const ehSource = '(module (type $t (func)) (tag $a (type $t)) (tag $b (type $t)) (func block $outer try_table (catch 1 $outer) throw 1 end unreachable end) (export "test" (func 0)))';
const ehBinary = asm.assemble(ehSource);
const ehWat = disassembleWASM(ehBinary);
assert.ok(ehWat.includes('(catch 1 0)'));
const options = spawnSync(process.execPath, ['--v8-options'], { encoding: 'utf8' });
if (options.error) throw options.error;
assert.strictEqual(options.status, 0);
if (WebAssembly.validate(ehBinary) || options.stdout.includes('--experimental-wasm-exnref')) {
  const flags = WebAssembly.validate(ehBinary) ? [] : ['--experimental-wasm-exnref'];
  const run = spawnSync(process.execPath, [...flags, '-e', `
    const modules = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    for (const bytes of modules) {
      const instance = new WebAssembly.Instance(new WebAssembly.Module(Buffer.from(bytes)));
      instance.exports.test();
    }
  `], { input: JSON.stringify([[...ehBinary], [...asm.assemble(ehWat)]]) });
  if (run.error) throw run.error;
  assert.strictEqual(run.status, 0, run.stderr.toString());
  console.log('PASS native_oracle_eh_handler_roundtrip');
} else {
  console.log('SKIP native_oracle_eh (engine lacks modern EH support)');
}

const wabt = spawnSync('wat2wasm', ['--version']);
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP independent_wabt_element_encoding (wat2wasm unavailable)');
} else {
  if (wabt.error) throw wabt.error;
  assert.strictEqual(wabt.status, 0);
  const result = spawnSync('wat2wasm', ['-', '-o', '/dev/stdout'], { input: allWat });
  if (result.error) throw result.error;
  assert.strictEqual(result.status, 0, result.stderr.toString());
  assert.ok(WebAssembly.validate(result.stdout));
  const external = new WasmDisassembler(result.stdout);
  external.disassemble();
  assert.strictEqual(external.elementSection.length, 8);
  assert.deepStrictEqual(external.elementSection.map(s => s.mode), [
    'active', 'passive', 'active', 'declarative', 'active', 'passive', 'active', 'declarative'
  ]);
  console.log('PASS independent_wabt_element_encoding');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-proposal-link-'));
const fixturePaths = ['segments.wasm', 'typed.wasm', 'preceding.wasm'].map(name => path.join(tempDir, name));
try {
  fs.writeFileSync(fixturePaths[0], allSegments);
  const linker = new WasmLinker();
  const linked = linker.linkStatic([fixturePaths[0]]).wasm;
  assert.ok(WebAssembly.validate(linked), 'static linking must preserve all eight element forms');
  const linkedDis = new WasmDisassembler(linked);
  linkedDis.disassemble();
  assert.deepStrictEqual(linkedDis.elementSection.map(s => s.mode), [
    'active', 'passive', 'active', 'declarative', 'active', 'passive', 'active', 'declarative'
  ]);
  const typed = moduleBytes(...prefix,
    section(9, [1, 5, 0x63, 0, 2, ...refFunc, 0xd0, 0, 0x0b]),
    section(10, [1, 5, 0, 0xd0, 0, 0x1a, 0x0b]));
  fs.writeFileSync(fixturePaths[1], typed);
  fs.writeFileSync(fixturePaths[2], asm.assemble('(module (func (result i32) i32.const 42))'));
  const remapped = linker.linkStatic([fixturePaths[2], fixturePaths[1]]).wasm;
  assert.ok(WebAssembly.validate(remapped), 'static linking must remap typed element heap indices');
  const remappedDis = new WasmDisassembler(remapped);
  remappedDis.disassemble();
  assert.deepStrictEqual(remappedDis.elementSection[0].reftypeBytes, Buffer.from([0x63, 1]));
  assert.deepStrictEqual(remappedDis.elementSection[0].elements[0], Buffer.from([0xd2, 1, 0x0b]));
  assert.deepStrictEqual(remappedDis.elementSection[0].elements[1], Buffer.from([0xd0, 1, 0x0b]));
  assert.deepStrictEqual(remappedDis.codeSection[1].code, Buffer.from([0xd0, 1, 0x1a, 0x0b]));
  console.log('PASS static_linker_element_modes_and_typed_heap_remapping');
} finally {
  for (const file of fixturePaths) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmdirSync(tempDir);
}

console.log('\nAll proposal binary regressions passed.');
