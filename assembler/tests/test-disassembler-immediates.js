'use strict';

const assert = require('assert');
const { WasmDisassembler } = require('../wasm-disassembler.js');

const d = new WasmDisassembler(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

function runCase(name, codeBytes, expectedContains) {
  const out = d.decodeInstructions(Buffer.from(codeBytes), []);
  for (const needle of expectedContains) {
    assert.ok(out.some(i => i.includes(needle)), `${name}: expected instruction containing "${needle}", got: ${out.join(' | ')}`);
  }
  assert.ok(!out.some(i => i.includes('unknown_')), `${name}: contains unknown opcode(s): ${out.join(' | ')}`);
  console.log(`PASS ${name}`);
}

// Base family (single-byte)
runCase('base_index_immediates', [0x10, 0x03, 0x20, 0x01, 0x24, 0x02], ['call 3', 'local.get 1', 'global.set 2']);
runCase('base_blocktype_valtype', [0x02, 0x7f, 0x0b], ['block (result i32)']);
runCase('base_blocktype_typeidx', [0x02, 0x00, 0x0b], ['block (type 0)']);
runCase('base_br_table', [0x0e, 0x02, 0x00, 0x01, 0x02], ['br_table 0 1 2']);
runCase('base_call_indirect', [0x11, 0x02, 0x01], ['call_indirect 1 (type 2)']);
runCase('base_memarg', [0x28, 0x02, 0x10], ['i32.load offset=16 align=4']);
runCase('base_ref_null_heaptype', [0xd0, 0x6f], ['ref.null extern']);
runCase('base_select_t', [0x1c, 0x01, 0x7e], ['select (result i64)']);
runCase('base_try_table_header', [0x1f, 0x40, 0x00, 0x0b], ['try_table', 'end']);

// FC family
runCase('fc_memory_and_table', [
  0xfc, 0x08, 0x02, 0x00, // memory.init data=2 mem=0
  0xfc, 0x09, 0x03,       // data.drop 3
  0xfc, 0x0a, 0x00, 0x01, // memory.copy 0 1
  0xfc, 0x0c, 0x01, 0x02, // table.init 1 2
  0xfc, 0x0f, 0x01        // table.grow 1
], ['memory.init 2', 'data.drop 3', 'memory.copy 0 1', 'table.init 1 2', 'table.grow 1']);

// FB family
runCase('fb_struct_and_array', [
  0xfb, 0x02, 0x01, 0x02, // struct.get 1 2
  0xfb, 0x08, 0x02, 0x03  // array.new_fixed 2 3
], ['struct.get 1 2', 'array.new_fixed 2 3']);

runCase('fb_ref_and_cast', [
  0xfb, 0x14, 0x01, 0x70,       // ref.test null func
  0xfb, 0x15, 0x00, 0x6f,       // ref.cast extern
  0xfb, 0x18, 0x01, 0x03, 0x70, 0x6f // br_on_cast 1 null func null extern
], ['ref.test null func', 'ref.cast extern', 'br_on_cast 1 null func null extern']);

runCase('fb_ref_and_cast_typeidx_heaptype', [
  0xfb, 0x14, 0x01, 0x80, 0x01,             // ref.test null (heaptype typeidx 128)
  0xfb, 0x19, 0x02, 0x00, 0x80, 0x01, 0x01  // br_on_cast_fail 2 128 1
], ['ref.test null 128', 'br_on_cast_fail 2 128 1']);

runCase('fb_array_data_elem_copy', [
  0xfb, 0x09, 0x03, 0x01, // array.new_data 3 1
  0xfb, 0x13, 0x03, 0x02, // array.init_elem 3 2
  0xfb, 0x11, 0x03, 0x04  // array.copy 3 4
], ['array.new_data 3 1', 'array.init_elem 3 2', 'array.copy 3 4']);

// FD family
runCase('fd_v128_const_and_shuffle', [
  0xfd, 0x0c,
  1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xfd, 0x0d,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
], ['v128.const i8x16 1 2 3 4', 'i8x16.shuffle 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15']);
runCase('fd_memarg_lane', [0xfd, 0x56, 0x02, 0x08, 0x03], ['v128.load32_lane offset=8 align=4 3']);
runCase('base_ref_null_heaptype_typeidx', [0xd0, 0x80, 0x01], ['ref.null 128']);

console.log('\nAll disassembler immediate-format tests passed.');
