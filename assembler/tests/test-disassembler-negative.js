'use strict';

const assert = require('assert');
const { disassembleWASM } = require('../wasm-disassembler.js');

const MAGIC_VERSION = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

function mustFail(name, buffer, pattern) {
  let failed = false;
  try {
    disassembleWASM(buffer);
  } catch (error) {
    failed = true;
    if (pattern) {
      assert.ok(pattern.test(error.message), `${name}: unexpected error message: ${error.message}`);
    }
  }
  assert.ok(failed, `${name}: expected disassembly failure`);
  console.log(`PASS ${name}`);
}

// 1) Too small input.
mustFail('too_small_buffer', Buffer.from([0x00, 0x61]), /too small|Invalid WASM/i);

// 2) Invalid magic/version.
mustFail('invalid_magic', Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]), /Invalid WASM/i);

// 3) Section length larger than available bytes.
const sectionLengthOverflow = Buffer.concat([
  MAGIC_VERSION,
  Buffer.from([0x01, 0x05, 0x00]),
]);
mustFail('section_length_overflow', sectionLengthOverflow, /exceeds buffer bounds|Out-of-bounds/i);

// 4) Truncated ULEB in section payload.
const truncatedUleb = Buffer.concat([
  MAGIC_VERSION,
  Buffer.from([0x01, 0x01, 0x80]),
]);
mustFail('truncated_uleb', truncatedUleb, /Truncated ULEB128/i);

// 5) Unterminated initializer expression in global section.
const unterminatedExpr = Buffer.concat([
  MAGIC_VERSION,
  Buffer.from([0x06, 0x05, 0x01, 0x7f, 0x00, 0x41, 0x00]),
]);
mustFail('unterminated_expression', unterminatedExpr, /Unterminated expression/i);

// 6) Truncated instruction immediate in code section (i32.const without immediate).
const truncatedImmediate = Buffer.concat([
  MAGIC_VERSION,
  Buffer.from([0x01, 0x04, 0x01, 0x60, 0x00, 0x00]),
  Buffer.from([0x03, 0x02, 0x01, 0x00]),
  Buffer.from([0x0a, 0x04, 0x01, 0x02, 0x00, 0x41]),
]);
mustFail('truncated_instruction_immediate', truncatedImmediate, /Truncated SLEB128|Truncated instruction immediate|SLEB128 read out of bounds/i);

console.log('\nAll disassembler negative tests passed.');
