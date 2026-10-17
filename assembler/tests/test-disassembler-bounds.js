'use strict';

const assert = require('assert');
const { WasmDisassembler, disassembleWASM } = require('../wasm-disassembler.js');

const HEADER = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const SENTINEL = Buffer.from([0, 2, 1, 0x78]);

function section(id, payload) {
  assert.ok(payload.length < 128);
  return Buffer.from([id, payload.length, ...payload]);
}

function binary(...sections) {
  return Buffer.concat([HEADER, ...sections]);
}

function rejectAtBoundary(id, payload, pattern = /bounds|Truncated|unconsumed|Unterminated/i) {
  const bytes = section(id, payload);
  const dis = new WasmDisassembler(binary(bytes, SENTINEL));
  dis.offset = HEADER.length;
  assert.throws(() => dis.parseSection(), pattern);
  assert.ok(dis.offset <= HEADER.length + bytes.length, 'parser must not consume the following section');
  assert.strictEqual(dis.sectionEnd, null, 'outer limit must be restored after failure');
  return dis;
}

// Each prefix retains the original vector counts but loses required payload bytes.
const payloads = [
  [1, [1, 0x60, 1, 0x7f, 1, 0x7f]],
  [1, [1, 0x50, 1, 0, 0x60, 0, 0]],
  [1, [1, 0x5f, 1, 0x7f, 1]],
  [1, [1, 0x5e, 0x7f, 0]],
  [2, [1, 1, 0x6d, 1, 0x66, 0, 0]],
  [2, [1, 0, 0, 1, 0x70, 1, 0, 1]],
  [2, [1, 0, 0, 2, 1, 0, 1]],
  [2, [1, 0, 0, 3, 0x7f, 0]],
  [2, [1, 0, 0, 4, 0, 0]],
  [3, [1, 0x80, 0]],
  [4, [1, 0x70, 1, 0, 1]],
  [5, [1, 1, 0, 1]],
  [6, [1, 0x7f, 0, 0x41, 0, 0x0b]],
  [7, [1, 1, 0x66, 0, 0]],
  [8, [0x80, 0]],
  [9, [1, 5, 0x63, 0, 1, 0xd0, 0, 0x0b]],
  [10, [1, 5, 1, 1, 0x7f, 1, 0x0b]],
  [11, [1, 1, 3, 0xaa, 0xbb, 0xcc]],
  [12, [0x80, 0]],
  [13, [1, 0, 0x80, 0]]
];
let truncations = 0;
for (const [id, payload] of payloads) {
  for (let length = 0; length < payload.length; length++) {
    rejectAtBoundary(id, payload.slice(0, length));
    truncations++;
  }
}
console.log(`PASS ${truncations}_section_payload_truncations`);

for (const id of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13]) {
  rejectAtBoundary(id, [0xff, 0xff, 0xff, 0xff, 0x0f], /bounds/i);
}
rejectAtBoundary(1, [1, 0x60, 0xff, 0xff, 0xff, 0xff, 0x0f], /bounds/i);
rejectAtBoundary(9, [1, 1, 0, 0xff, 0xff, 0xff, 0xff, 0x0f], /bounds/i);
rejectAtBoundary(11, [1, 1, 0xff, 0xff, 0xff, 0xff, 0x0f], /bounds/i);
rejectAtBoundary(11, [1, 3, 0], /Invalid data flags/);
console.log('PASS vector_counts_and_byte_lengths_checked_before_iteration_or_slicing');

for (const [opcode, width] of [[0x43, 4], [0x44, 8]]) {
  for (let size = 0; size < width; size++) {
    rejectAtBoundary(6, [1, opcode === 0x43 ? 0x7d : 0x7c, 0, opcode, ...Array(size).fill(0)]);
  }
}
for (const opcode of [0x41, 0x42, 0x23, 0xd0, 0xd2]) {
  rejectAtBoundary(6, [1, 0x7f, 0, opcode, 0x80], /Truncated/);
}
console.log('PASS initializer_immediates_cannot_read_following_sections');

for (const body of [[], [1], [1, 0x80], [1, 1]]) {
  const code = section(10, [2, body.length, ...body, 2, 0, 0x0b]);
  const dis = new WasmDisassembler(binary(code, SENTINEL));
  dis.offset = HEADER.length;
  assert.throws(() => dis.parseSection(), /bounds|Truncated/i);
  assert.ok(dis.offset <= HEADER.length + 4 + body.length, 'locals must not consume the next function body');
  assert.strictEqual(dis.codeSection.length, 0, 'incomplete bodies must not be published');
  assert.strictEqual(dis.sectionEnd, null);
}
const truncatedInstruction = binary(
  section(1, [1, 0x60, 0, 0]), section(3, [2, 0, 0]),
  section(10, [2, 2, 0, 0x41, 2, 0, 0x0b])
);
assert.throws(() => disassembleWASM(truncatedInstruction), /SLEB128.*bounds|Truncated/i);
console.log('PASS function_locals_and_instructions_are_body_bounded');

const namePrefix = [4, 0x6e, 0x61, 0x6d, 0x65];
for (const [id, payload] of [
  [0, []], [0, [0x80]], [0, [1]], [0, [2, 0x61]],
  [1, [1]], [1, [1, 0x80]], [1, [1, 0, 2, 0x61]],
  [2, [1]], [2, [1, 0, 1]], [2, [1, 0, 1, 0, 2, 0x61]]
]) {
  const first = [id, payload.length, ...payload];
  const following = [0, 2, 1, 0x7a];
  const dis = new WasmDisassembler(binary(section(0, [...namePrefix, ...first, ...following])));
  dis.offset = HEADER.length;
  assert.throws(() => dis.parseSection(), /bounds|Truncated/i);
  assert.ok(dis.offset <= HEADER.length + 2 + namePrefix.length + first.length,
    'name fields must not consume the following subsection');
  assert.strictEqual(dis.sectionEnd, null);
}
rejectAtBoundary(0, [...namePrefix, 0, 2, 0, 0], /name subsection 0 has unconsumed bytes/);
rejectAtBoundary(0, [...namePrefix, 1, 2, 0, 0], /name subsection 1 has unconsumed bytes/);
rejectAtBoundary(0, [...namePrefix, 2, 2, 0, 0], /name subsection 2 has unconsumed bytes/);
rejectAtBoundary(0, [...namePrefix, 9, 5, 0], /bounds/i);
console.log('PASS name_subsection_bounds_and_exact_consumption');

const valid = binary(
  section(1, [1, 0x60, 0, 0]),
  section(3, [1, 0]),
  section(10, [1, 7, 0x81, 0, 0x81, 0, 0x7f, 1, 0x0b]),
  section(11, [1, 1, 0]),
  section(0, [...namePrefix, 9, 3, 0xff, 0x80, 0, 0, 2, 1, 0x7a])
);
assert.ok(WebAssembly.validate(valid), 'independent padded-LEB fixture must validate');
const dis = new WasmDisassembler(valid);
const wat = dis.disassemble();
assert.ok(wat.includes('(local i32)'));
assert.deepStrictEqual(dis.codeSection[0].locals, [{ count: 1, valType: 0x7f }]);
assert.strictEqual(dis.nameSection.moduleName, 'z');
assert.strictEqual(dis.dataSection[0].bytes.length, 0);
assert.strictEqual(dis.disassemble(), wat);
assert.strictEqual(dis.sectionEnd, null);

dis.buffer = binary(section(0, [...namePrefix, 0, 0, 0, 2, 1, 0x7a]));
assert.throws(() => dis.disassemble(), /bounds/i);
assert.strictEqual(dis.sectionEnd, null);
dis.buffer = valid;
assert.strictEqual(dis.disassemble(), wat, 'nested parse failures must not poison retries');
console.log('PASS legal_padding_opaque_subsections_and_nested_error_recovery');

console.log('\nAll nested binary-boundary regressions passed.');
