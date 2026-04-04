'use strict';

const assert = require('assert');
const WatAssembler = require('../wat-assembler.js');
const { disassembleWASM } = require('../wasm-disassembler.js');

const asm = new WatAssembler();

function runCase(name, wat, checks) {
  const wasm = asm.assemble(wat);
  const out = disassembleWASM(Buffer.from(wasm));

  for (const check of checks) {
    assert.ok(out.includes(check), `${name}: expected output to include "${check}"`);
  }

  assert.ok(!out.includes('unknown_'), `${name}: output contains unknown opcode`);
  console.log(`PASS ${name}`);
}

runCase(
  'basic_add',
  '(module (func $add (param i32 i32) (result i32) local.get 0 local.get 1 i32.add) (export "add" (func $add)))',
  ['(type (func', '(export "add" (func 0))', 'local.get 0', 'local.get 1', 'i32.add']
);

runCase(
  'memory_ops',
  '(module (memory 1) (func $store (param i32 i32) local.get 0 local.get 1 i32.store) (func $load (param i32) (result i32) local.get 0 i32.load) (export "store" (func $store)) (export "load" (func $load)))',
  ['(memory 1)', 'i32.store', 'i32.load']
);

runCase(
  'control_flow',
  '(module (func $f (param i32) (result i32) block local.get 0 i32.eqz br_if 0 i32.const 1 return end i32.const 0) (export "f" (func $f)))',
  ['block', 'br_if 0', 'i32.eqz', 'return', 'end']
);

runCase(
  'bulk_memory_fc',
  '(module (memory 1) (data "a") (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 memory.init 0 0 data.drop 0) (export "ops" (func $ops)))',
  ['memory.init 0', 'data.drop 0']
);

const emptyModule = disassembleWASM(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
assert.strictEqual(emptyModule.trim(), '(module\n)', 'empty module disassembly mismatch');
console.log('PASS empty_module');

console.log('\nAll disassembler smoke tests passed.');
