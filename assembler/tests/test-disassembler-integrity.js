'use strict';

const assert = require('assert');
const WatAssembler = require('../wat-assembler.js');
const { WasmDisassembler, disassembleWASM } = require('../wasm-disassembler.js');

const HEADER = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

function section(id, payload) {
  const bytes = Buffer.from(payload);
  assert.ok(bytes.length < 128, 'test section length must fit in one LEB byte');
  return Buffer.concat([Buffer.from([id, bytes.length]), bytes]);
}

function binary(...sections) {
  return Buffer.concat([HEADER, ...sections]);
}

function moduleWithCode(code) {
  const body = Buffer.from([0, ...code]);
  return binary(
    section(1, [1, 0x60, 0, 0]),
    section(3, [1, 0]),
    section(10, [1, body.length, ...body])
  );
}

const decode = bytes => new WasmDisassembler(HEADER).decodeInstructions(Buffer.from(bytes), []);

assert.throws(() => disassembleWASM(binary(section(14, []))), /Unknown section 14 at offset 8/);
assert.throws(() => disassembleWASM(binary(section(255, []))), /Unknown section 255/);

for (const id of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13]) {
  const empty = section(id, [0]);
  assert.throws(
    () => disassembleWASM(binary(empty, empty)),
    new RegExp(`Duplicate section ${id} at offset`)
  );
  assert.throws(
    () => disassembleWASM(binary(section(id, [0, 0]))),
    new RegExp(`Section ${id} has unconsumed bytes`)
  );
}
assert.throws(
  () => disassembleWASM(binary(section(8, [0]), section(8, [0]))),
  /Duplicate section 8/
);
assert.throws(() => disassembleWASM(binary(section(8, [0, 0]))), /Section 8 has unconsumed bytes/);
assert.throws(
  () => disassembleWASM(binary(section(2, [0]), section(1, [0]))),
  /Section 1 out of order/
);
assert.throws(
  () => disassembleWASM(binary(section(6, [0]), section(13, [0]))),
  /Section 13 out of order/
);
assert.throws(
  () => disassembleWASM(binary(section(10, [0]), section(12, [0]))),
  /Section 12 out of order/
);
assert.throws(() => disassembleWASM(binary(section(1, []))), /bounds|Truncated|overread/i);

const order = [1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11];
const custom = section(0, [1, 0x78, 0xff, 0x00]);
const ordered = binary(
  custom,
  ...order.flatMap(id => [section(id, [0]), custom])
);
const orderedDisassembler = new WasmDisassembler(ordered);
assert.ok(orderedDisassembler.disassemble().includes('(start 0)'));
assert.strictEqual(orderedDisassembler.customSections.length, order.length + 1);
assert.strictEqual(orderedDisassembler.sectionEnd, null);
console.log('PASS section_integrity_and_non_numeric_order');

const asm = new WatAssembler();
const taggedModule = asm.assemble(
  '(module (type $t (func)) (tag $e (type $t)) (global i32 (i32.const 0)) (func))'
);
const taggedDisassembler = new WasmDisassembler(taggedModule);
taggedDisassembler.disassemble();
assert.deepStrictEqual([...taggedDisassembler.seenSections], [1, 3, 13, 6, 10]);
assert.ok(WebAssembly.validate(taggedModule), 'assembler tag section order must produce valid WASM');
console.log('PASS assembler_tag_section_precedes_globals');

assert.deepStrictEqual(decode([0xfb, 0x0f]), ['array.len']);
assert.deepStrictEqual(decode([0xfb, 0x0f, 0x0b]), ['array.len', 'end']);
assert.deepStrictEqual(decode([0xfb, 0x0f, 0x41, 1, 0x0b]), ['array.len', 'i32.const 1', 'end']);
assert.ok(disassembleWASM(moduleWithCode([0xfb, 0x0f, 0x0b])).includes('    array.len\n'));
console.log('PASS array_len_consumes_no_immediate');

for (const code of [[0xff], [0xfc, 0x12], [0xfb, 0x7f], [0xfd, 0x80, 0x02]]) {
  assert.throws(() => decode(code), /Unknown opcode .*code offset 0/);
  assert.throws(() => disassembleWASM(moduleWithCode(code)), /Unknown opcode/);
}
assert.throws(() => decode([0x01, 0xff]), /code offset 1/);
for (const prefix of [0xfb, 0xfc, 0xfd]) {
  assert.throws(() => decode([prefix]), /ULEB128/);
  assert.throws(() => decode([prefix, 0x80]), /Truncated ULEB128/);
}
console.log('PASS unknown_and_truncated_prefixed_opcodes_rejected');

for (const subopcode of [0x0c, 0x0d]) {
  for (let length = 0; length < 16; length++) {
    const code = [0xfd, subopcode, ...Array(length).fill(0)];
    assert.throws(() => decode(code), /Truncated instruction immediate/);
    assert.throws(() => disassembleWASM(moduleWithCode(code)), /Truncated instruction immediate/);
  }
}
assert.deepStrictEqual(
  decode([0xfd, 0x0c, ...Array(16).fill(255), 0x01]),
  [`v128.const i8x16 ${Array(16).fill(255).join(' ')}`, 'nop']
);
assert.deepStrictEqual(
  decode([0xfd, 0x0d, ...Array.from({ length: 16 }, (_, i) => i + 16), 0x01]),
  [`i8x16.shuffle ${Array.from({ length: 16 }, (_, i) => i + 16).join(' ')}`, 'nop']
);
for (let position = 0; position < 16; position++) {
  const lanes = Array(16).fill(0);
  lanes[position] = 32;
  assert.throws(() => decode([0xfd, 0x0d, ...lanes]), /Invalid i8x16.shuffle lane 32/);
}

const registerLanes = [
  [21, 16], [22, 16], [23, 16],
  [24, 8], [25, 8], [26, 8],
  [27, 4], [28, 4], [29, 2], [30, 2],
  [31, 4], [32, 4], [33, 2], [34, 2]
];
const memoryLanes = [[84, 16], [85, 8], [86, 4], [87, 2], [88, 16], [89, 8], [90, 4], [91, 2]];
for (const [subopcode, laneCount] of [...registerLanes, ...memoryLanes]) {
  const prefix = [0xfd, subopcode, ...(subopcode >= 84 ? [0, 0] : [])];
  assert.throws(() => decode(prefix), /Truncated instruction immediate .*lane/);
  for (const invalidLane of [laneCount, 255]) {
    assert.throws(() => decode([...prefix, invalidLane]), /Invalid .* lane/);
  }
  for (let lane = 0; lane < laneCount; lane++) {
    const out = decode([...prefix, lane, 0x01]);
    assert.ok(out[0].endsWith(` ${lane}`));
    assert.strictEqual(out[1], 'nop', 'lane immediate must consume exactly one byte');
  }
}
for (const subopcode of [84, 85, 86, 87, 88, 89, 90, 91]) {
  assert.throws(() => decode([0xfd, subopcode]), /ULEB128/);
  assert.throws(() => decode([0xfd, subopcode, 0]), /ULEB128/);
  assert.throws(() => decode([0xfd, subopcode, 0x80]), /Truncated ULEB128/);
}
console.log('PASS simd_immediate_lengths_and_lane_ranges');

const reusable = new WasmDisassembler(Buffer.concat([taggedModule, custom]));
const firstOutput = reusable.disassemble();
assert.strictEqual(reusable.disassemble(), firstOutput);
assert.strictEqual(reusable.typeSection.length, 1);
assert.strictEqual(reusable.functionSection.length, 1);
assert.strictEqual(reusable.codeSection.length, 1);
assert.strictEqual(reusable.globalSection.length, 1);
assert.strictEqual(reusable.tagSection.length, 1);
assert.strictEqual(reusable.customSections.length, 1);

reusable.buffer = moduleWithCode([0xff]);
assert.throws(() => reusable.disassemble(), /Unknown opcode/);
reusable.buffer = Buffer.concat([taggedModule, custom]);
assert.strictEqual(reusable.disassemble(), firstOutput, 'retry after an instruction error must reset state');

reusable.buffer = binary(section(1, [0, 0]));
assert.throws(() => reusable.disassemble(), /unconsumed bytes/);
assert.strictEqual(reusable.sectionEnd, null, 'section bound must be restored after failure');
reusable.buffer = HEADER;
assert.strictEqual(reusable.disassemble(), '(module\n)');
for (const field of [
  'typeSection', 'typeGroups', 'importSection', 'functionSection', 'tableSection', 'memorySection',
  'globalSection', 'exportSection', 'elementSection', 'codeSection', 'dataSection',
  'tagSection', 'customSections', 'expressions', 'sections'
]) {
  assert.deepStrictEqual(reusable[field], [], `${field} must be reset`);
}
assert.strictEqual(reusable.startSection, null);
assert.strictEqual(reusable.dataCountSection, null);
assert.strictEqual(reusable.nameSection.moduleName, null);
assert.strictEqual(reusable.nameSection.functionNames.size, 0);
assert.strictEqual(reusable.nameSection.localNames.size, 0);
assert.strictEqual(reusable.seenSections.size, 0);
assert.strictEqual(reusable.lastSectionOrder, 0);
console.log('PASS disassembler_reuse_and_recovery');

console.log('\nAll disassembler binary-integrity tests passed.');
