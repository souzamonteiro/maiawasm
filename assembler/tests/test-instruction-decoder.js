'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { BinaryReader } = require('../wasm-reader.js');
const { decodeInstruction, decodeInstructions, decodeExpression } = require('../wasm-instructions.js');
const { instructionToWat } = require('../wasm-instruction-wat.js');
const { OPCODE_NAME, OPCODE_FC_NAME, OPCODE_FB_NAME, OPCODE_FD_NAME } = require('../wasm-binary.js');
const { WasmDisassembler, disassembleWASM } = require('../wasm-disassembler.js');
const WatAssembler = require('../wat-assembler.js');
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
function parse(bytes) {
  const dis = new WasmDisassembler(bytes);
  dis.disassemble();
  return dis;
}
const decoded = bytes => decodeInstructions(Uint8Array.from(bytes));

const indexBase = new Set([0x07, 0x08, 0x09, 0x0c, 0x0d, 0x10, 0x12, 0x14, 0x15,
  0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x3f, 0x40, 0xd2, 0xd5, 0xd6]);
function baseImmediate(opcode) {
  if ([2, 3, 4, 6].includes(opcode)) return [0x40];
  if (opcode === 0x1f) return [0x40, 0];
  if (indexBase.has(opcode)) return [0x8b, 0];
  if (opcode === 0x0e) return [1, 11, 12];
  if (opcode === 0x11 || opcode === 0x13) return [11, 12];
  if (opcode === 0x1c) return [1, 0x63, 0x70];
  if (opcode >= 0x28 && opcode <= 0x3e) return [0x40, 11, 12];
  if (opcode === 0x41 || opcode === 0x42) return [0x8b, 0];
  if (opcode === 0x43) return [11, 12, 13, 14];
  if (opcode === 0x44) return [11, 12, 13, 14, 15, 16, 17, 18];
  if (opcode === 0xd0) return [0x8b, 0];
  return [];
}
function fcImmediate(opcode) {
  if ([8, 10, 12, 14].includes(opcode)) return [11, 12];
  if (opcode >= 8) return [11];
  return [];
}
function fbImmediate(opcode) {
  if ([2, 3, 4, 5, 8, 9, 10, 17, 18, 19].includes(opcode)) return [11, 12];
  if ([0, 1, 6, 7, 11, 12, 13, 14, 16].includes(opcode)) return [11];
  if (opcode >= 20 && opcode <= 23) return [0x8b, 0];
  if (opcode === 24 || opcode === 25) return [3, 11, 0x8b, 0, 0x70];
  return [];
}
function fdImmediate(opcode) {
  if (opcode <= 11 || (opcode >= 92 && opcode <= 93)) return [0x40, 11, 12];
  if (opcode === 12 || opcode === 13) return Array.from({ length: 16 }, (_, i) => i);
  if (opcode >= 21 && opcode <= 34) return [0];
  if (opcode >= 84 && opcode <= 91) return [0x40, 11, 12, 0];
  return [];
}

let variants = 0;
let truncations = 0;
for (const [prefix, table, immediates] of [
  [null, OPCODE_NAME, baseImmediate], [0xfc, OPCODE_FC_NAME, fcImmediate],
  [0xfb, OPCODE_FB_NAME, fbImmediate], [0xfd, OPCODE_FD_NAME, fdImmediate]
]) {
  for (const [key, name] of Object.entries(table)) {
    const opcode = Number(key);
    const head = prefix === null ? [opcode] : [prefix, ...uleb(opcode)];
    const bytes = [...head, ...immediates(opcode)];
    const records = decoded([...bytes, 1]);
    assert.strictEqual(records.length, 2, name);
    assert.strictEqual(records[0].name, name);
    assert.strictEqual(records[0].opcode, prefix === null ? opcode : prefix);
    if (prefix !== null) assert.strictEqual(records[0].subopcode, opcode);
    assert.deepStrictEqual([records[0].offset, records[0].endOffset], [0, bytes.length], name);
    assert.strictEqual(records[1].name, 'nop', name);
    assert.strictEqual(records[1].offset, bytes.length, name);
    assert.strictEqual(typeof instructionToWat(records[0]), 'string');
    assert.deepStrictEqual(new WasmDisassembler(HEADER).decodeInstructions(Buffer.from(bytes), []),
      [instructionToWat(records[0])]);
    for (let end = 1; end < bytes.length; end++) {
      assert.throws(() => decoded(bytes.slice(0, end)), /bounds|Truncated|large|range/i, `${name} prefix ${end}`);
      truncations++;
    }
    variants++;
  }
}
assert.strictEqual(variants, 483);
console.log(`PASS_all_${variants}_opcode_variants_and_${truncations}_truncated_prefixes`);

const im = bytes => decoded(bytes)[0].immediates;
assert.deepStrictEqual(im([0x42, 0x7f]), { value: -1n });
assert.deepStrictEqual(im([0x43, 1, 0, 128, 255]), { bits: 0xff800001 });
assert.deepStrictEqual(im([0x44, 1, 0, 0, 0, 0, 0, 240, 255]), { bits: 0xfff0000000000001n });
assert.deepStrictEqual(im([0x02, 0x63, 0xc0, 0]), {
  blockType: { kind: 'value', valueType: { kind: 'ref', nullable: true, heapType: 64 } }
});
assert.deepStrictEqual(im([0x02, 0xc0, 0]), { blockType: { kind: 'type', typeIndex: 64 } });
assert.deepStrictEqual(im([0xd0, 0x70]), { heapType: -16 });
assert.deepStrictEqual(im([0x1c, 1, 0x64, 0x70]), { types: [{ kind: 'ref', nullable: false, heapType: -16 }] });
assert.deepStrictEqual(im([0x28, 0x42, 0x8b, 0, 0x8c, 0]), {
  memarg: { alignment: 2, memoryIndex: 11, offset: 12n, explicitMemory: true }
});
assert.deepStrictEqual(im([0xfc, 8, 11, 12]), { dataIndex: 11, memoryIndex: 12 });
assert.deepStrictEqual(im([0xfc, 12, 11, 12]), { elementIndex: 11, tableIndex: 12 });
assert.deepStrictEqual(im([0xfb, 24, 3, 11, 0x70, 0xc0, 0]), {
  labelIndex: 11, sourceType: { kind: 'ref', nullable: true, heapType: -16 },
  targetType: { kind: 'ref', nullable: true, heapType: 64 }
});
assert.deepStrictEqual(im([0x1f, 0x40, 4, 0, 11, 12, 1, 13, 14, 2, 15, 3, 16]), {
  blockType: { kind: 'empty' },
  catches: [{ kind: 0, tagIndex: 11, labelIndex: 12 }, { kind: 1, tagIndex: 13, labelIndex: 14 },
    { kind: 2, labelIndex: 15 }, { kind: 3, labelIndex: 16 }]
});
console.log('PASS_named_numeric_immediates_raw_bits_heap_types_memargs_and_catch_records');

const backing = Uint8Array.from([255, 255, 0x43, 1, 0, 128, 255, 0x0b, 255]);
const subview = backing.subarray(2, 8);
const located = decodeExpression(subview, { baseOffset: 100 });
assert.deepStrictEqual([located.offset, located.endOffset, located.bytesRead], [100, 106, 6]);
assert.strictEqual(located.instructions[0].immediates.bits, 0xff800001);
assert.strictEqual(located.instructions[1].offset, 105);
const ownedVector = Uint8Array.from([0xfd, 12, ...Array(16).fill(11)]);
const vectorRecord = decodeInstructions(ownedVector)[0];
ownedVector.fill(0);
assert.deepStrictEqual([...vectorRecord.immediates.bytes], Array(16).fill(11));
const reader = new BinaryReader(subview, { start: 1, end: 5, baseOffset: 100 });
assert.strictEqual(reader.readFloatBits(32), 0xff800001);
assert.throws(() => reader.readByte('past view'), /Truncated.*105/);
assert.throws(() => decodeInstructions(subview, { end: 4 }), /Truncated/);
assert.throws(() => decodeInstructions(Uint8Array.from([0x41, 0x80, 0]), { end: 2 }), /Truncated/);
assert.throws(() => decodeInstructions(Uint8Array.from([0xfd, 0x80, 0]), { end: 2 }), /Truncated/);
for (const options of [{ start: -1 }, { start: 7 }, { end: 7 }, { start: 3, end: 2 },
  { baseOffset: -1 }, { baseOffset: Number.MAX_SAFE_INTEGER }, { end: NaN }]) {
  assert.throws(() => new BinaryReader(subview, options), /bounds/);
}
assert.throws(() => new BinaryReader(null), /Uint8Array/);
assert.throws(() => new BinaryReader([1]), /Uint8Array/);
assert.throws(() => reader.readFloatBits(16), /Unsupported/);
assert.throws(() => decoded([2, 0x7a]), /Invalid block/);
assert.throws(() => decoded([0xd0, 0x68]), /Invalid abstract heap/);
assert.throws(() => decoded([0x0e, 0xff, 0xff, 0xff, 0xff, 0x0f]), /Truncated/);
assert.throws(() => decoded([0x1f, 0x40, 0xff, 0xff, 0xff, 0xff, 0x0f]), /Truncated/);
const singleReader = new BinaryReader(Uint8Array.from([1, 1]));
assert.strictEqual(decodeInstruction(singleReader).endOffset, 1);
assert.strictEqual(singleReader.offset, 1);
console.log('PASS_uint8array_subviews_dataview_offsets_nested_bounds_and_count_preflight');

const nested = decodeExpression(Uint8Array.from([2, 0x40, 0x41, 11, 0x0b, 0x0b, 1]));
assert.strictEqual(nested.bytesRead, 6);
assert.deepStrictEqual(nested.instructions.map(i => i.name), ['block', 'i32.const', 'end', 'end']);
assert.throws(() => decodeExpression(Uint8Array.from([2, 0x40, 0x0b])), /Unterminated/);
assert.throws(() => decodeExpression(Uint8Array.from([0x41, 11])), /Unterminated/);
const vectorBytes = [11, 255, 11, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const vectorExpr = [0xfd, 12, ...vectorBytes, 0x0b];
const globalModule = binary(section(6, [2, 0x7b, 0, ...vectorExpr, 0x7f, 0, 0x41, 11, 0x0b]));
const globals = parse(globalModule);
assert.deepStrictEqual([...globals.globalSection[0].initExpr], vectorExpr);
assert.strictEqual(globals.globalSection[1].initExpr[1], 11);
assert.strictEqual(globals.expressions.length, 2);
assert.strictEqual(globals.expressions[0].endOffset, globals.expressions[1].offset - 2);
assert.deepStrictEqual([...globals.expressions[0].instructions[0].immediates.bytes], vectorBytes);
assert.ok(WebAssembly.validate(globalModule));
assert.deepStrictEqual(asm.assemble(disassembleWASM(globalModule)), globalModule);
const dataModule = binary(section(5, [1, 0, 1]), section(11, [1, 0, 0x41, 11, 0x0b, 1, 0xab]));
assert.strictEqual(parse(dataModule).expressions[0].instructions[0].immediates.value, 11);
const extended = binary(
  section(5, [1, 0, 1]),
  section(6, [1, 0x7f, 0, 0x41, 5, 0x41, 6, 0x6a, 0x0b]),
  section(7, [2, 1, 0x67, 3, 0, 1, 0x6d, 2, 0]),
  section(11, [1, 0, 0x41, 5, 0x41, 6, 0x6a, 0x0b, 1, 0xab])
);
const nativeExtended = WebAssembly.validate(extended);
if (!nativeExtended) console.log('SKIP_native_extended_const_oracle: extended constant expressions unavailable');
for (const bytes of [extended, asm.assemble(disassembleWASM(extended))]) {
  assert.deepStrictEqual(bytes, extended);
  if (nativeExtended) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    assert.strictEqual(instance.exports.g.value, 11);
    assert.strictEqual(new Uint8Array(instance.exports.m.buffer)[11], 0xab);
  }
}
const elemModule = binary(section(9, [1, 5, 0x70, 1, 0xd0, 0x70, 0x0b]));
assert.strictEqual(parse(elemModule).expressions[0].instructions[0].immediates.heapType, -16);
const gcModule = binary(
  section(1, [12, ...Array.from({ length: 12 }, () => [0x5f, 0]).flat()]),
  section(6, [1, 0x64, 11, 0, 0xfb, 0, 11, 0x0b])
);
assert.strictEqual(parse(gcModule).expressions[0].instructions[0].immediates.typeIndex, 11);
if (WebAssembly.validate(gcModule)) new WebAssembly.Module(gcModule);
else console.log('SKIP_native_gc_initializer_oracle: GC unavailable');
assert.deepStrictEqual(asm.assemble(disassembleWASM(gcModule)), gcModule);
for (const expression of [[0xff, 0x0b], [0xfd, 12, 11, 0x0b], [0xfb, 0, 0x80]]) {
  const dis = new WasmDisassembler(binary(section(6, [1, 0x7b, 0, ...expression]), section(0, [0, 11, 0])));
  assert.throws(() => dis.disassemble(), /Unknown opcode|Truncated/);
  assert.strictEqual(dis.sectionEnd, null);
  dis.buffer = globalModule;
  dis.disassemble();
  assert.strictEqual(dis.expressions.length, 2);
}
const funcModule = code => {
  const body = [0, ...code];
  return binary(section(1, [1, 0x60, 0, 0]), section(3, [1, 0]), section(10, [1, body.length, ...body]));
};
assert.throws(() => disassembleWASM(funcModule([1])), /Unterminated/);
assert.throws(() => disassembleWASM(funcModule([2, 0x40, 11])), /Unterminated/);
assert.throws(() => disassembleWASM(funcModule([11, 1])), /unconsumed bytes after end/);
const parsedBody = parse(funcModule([2, 0x40, 11, 11])).codeSection[0];
assert.strictEqual(parsedBody.instructions[0].offset, parsedBody.codeOffset);
assert.strictEqual(parsedBody.instructions[2].endOffset, parsedBody.codeOffset + parsedBody.code.length);
console.log('PASS_unified_function_global_data_element_gc_expression_boundaries_and_error_recovery');

const tableWat = `(module
  (type (func (result i32))) (table 1 funcref) (table 1 funcref)
  (func (type 0) i32.const 42)
  (elem func 0) (elem func 0)
  (func (result i32)
    i32.const 0 i32.const 0 i32.const 1 table.init 1 0
    i32.const 0 call_indirect 1 (type 0))
  (export "run" (func 1)))`;
const tables = asm.assemble(tableWat);
const tableRecords = parse(tables).codeSection[1].instructions;
assert.deepStrictEqual(tableRecords.find(i => i.name === 'table.init').immediates, { elementIndex: 0, tableIndex: 1 });
assert.ok(parse(tables).codeSection[1].code.includes(Buffer.from([0xfc, 12, 0, 1])));
for (const bytes of [tables, asm.assemble(disassembleWASM(tables))]) {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  assert.strictEqual(instance.exports.run(), 42);
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-decoder-'));
const tableFile = path.join(directory, 'tables.wasm');
try {
  fs.writeFileSync(tableFile, tables);
  const linked = new WasmLinker().linkStatic([tableFile], { entry: 'tables' }).wasm;
  assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(linked)).exports.run(), 42);
} finally {
  if (fs.existsSync(tableFile)) fs.unlinkSync(tableFile);
  fs.rmdirSync(directory);
}
const native = globalThis.WebAssembly;
try {
  globalThis.WebAssembly = undefined;
  assert.deepStrictEqual(asm.assemble(disassembleWASM(globalModule)), globalModule);
  assert.strictEqual(decodeExpression(subview).instructions[0].immediates.bits, 0xff800001);
} finally {
  globalThis.WebAssembly = native;
}
const independent = spawnSync(process.execPath, ['-e', `
  globalThis.WebAssembly = undefined;
  globalThis.Buffer = undefined;
  const assert = require('assert');
  const { decodeExpression } = require(${JSON.stringify(require.resolve('../wasm-instructions.js'))});
  const result = decodeExpression(Uint8Array.from([0x43, 1, 0, 128, 255, 11]), { baseOffset: 100 });
  assert.strictEqual(result.instructions[0].immediates.bits, 0xff800001);
  assert.strictEqual(result.endOffset, 106);
`], { encoding: 'utf8' });
assert.ifError(independent.error);
assert.strictEqual(independent.status, 0, independent.stderr);
const wabt = spawnSync('wat2wasm', ['--version'], { encoding: 'utf8' });
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP_wabt_table_init_oracle: wat2wasm unavailable');
} else {
  assert.ifError(wabt.error);
  assert.strictEqual(wabt.status, 0, wabt.stderr);
  const oracle = spawnSync('wat2wasm', ['-', '-o', '/dev/stdout'], { input: tableWat });
  assert.ifError(oracle.error);
  assert.strictEqual(oracle.status, 0, oracle.stderr.toString());
  assert.deepStrictEqual(parse(oracle.stdout).codeSection[1].code, parse(tables).codeSection[1].code);
  assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(oracle.stdout)).exports.run(), 42);
  const extendedOracle = spawnSync('wat2wasm', ['--enable-extended-const', '-', '-o', '/dev/stdout'], { input: disassembleWASM(extended) });
  assert.ifError(extendedOracle.error);
  assert.strictEqual(extendedOracle.status, 0, extendedOracle.stderr.toString());
  assert.deepStrictEqual(extendedOracle.stdout, extended);
}
console.log('PASS_table_init_distinct_indices_native_static_link_and_independent_wabt');
console.log('\nAll shared instruction decoder regressions passed.');
