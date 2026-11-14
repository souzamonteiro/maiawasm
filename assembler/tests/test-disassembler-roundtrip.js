'use strict';

const fs = require('fs');
const path = require('path');
const WatAssembler = require('../wat-assembler.js');
const { disassembleWASM } = require('../wasm-disassembler.js');

const asm = new WatAssembler();
const fixturesDir = path.join(__dirname, 'fixtures');

function sanitizeWat(source) {
  return source
    .split('\n')
    .map(line => line.replace(/;;.*$/, ''))
    .join('\n')
    .trim();
}

const stableFixtures = [
  '01-basic-module.wat',
  '02-arithmetic.wat',
  '03-control-flow.wat',
  '04-memory.wat',
  '05-table.wat',
  '06-globals.wat',
  '07-float.wat',
  '08-simd.wat',
  '09-complex.wat'
];

let failed = 0;

console.log('Running disassembler round-trip tests (stable set)...\n');

for (const fixture of stableFixtures) {
  const fixturePath = path.join(fixturesDir, fixture);
  process.stdout.write(`  ${fixture} ... `);

  try {
    const source = sanitizeWat(fs.readFileSync(fixturePath, 'utf8'));

    const wasm1 = asm.assemble(source);
    const baselineValid = WebAssembly.validate(new Uint8Array(wasm1));
    if (!baselineValid) {
      throw new Error('baseline assembled wasm is invalid');
    }

    const wat2 = disassembleWASM(Buffer.from(wasm1));
    const unknownCount = (wat2.match(/unknown_/g) || []).length;
    if (unknownCount !== 0) {
      throw new Error(`disassembler output contains ${unknownCount} unknown opcodes`);
    }

    const wasm2 = asm.assemble(wat2);
    const roundtripValid = WebAssembly.validate(new Uint8Array(wasm2));
    if (!roundtripValid) {
      throw new Error('round-trip wasm is invalid');
    }
    if (!Buffer.from(wasm1).equals(Buffer.from(wasm2))) {
      throw new Error('round-trip wasm bytes differ from baseline');
    }

    console.log('PASS');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(`    ${error.message.split('\n')[0]}`);
  }
}

const { OPCODE_NAME, OPCODE_FC_NAME, OPCODE_FB_NAME, OPCODE_FD_NAME } = require('../wasm-binary.js');

function extractCases(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const match = src.match(/const (TESTS|CASES) = \[[\s\S]*?\r?\n\];/);
  if (!match) throw new Error(`TESTS/CASES not found in ${filePath}`);
  return Function(`"use strict"; ${match[0]} return ${match[1]};`)();
}

const assemblerCases = [
  ...extractCases(path.join(__dirname, '../test-assembler.js')),
  ...extractCases(path.join(__dirname, '../test-assembler-proposals.js')),
];

// Additional exhaustive byte-exact round-trip checks covering every construct
// and opcode family produced by WatAssembler.
const extraCases = [
  ...assemblerCases,
  ['elem active table 0 (flags=2)',
    '(module (table 1 funcref) (func $f) (elem (table 0) (offset (i32.const 0)) func $f))'],
  ['elem active table 0 expr funcref (flags=6)',
    '(module (table 1 funcref) (func $f) (elem (table 0) (offset (i32.const 0)) funcref (item (ref.func $f))))'],
  ['i64.const 64-bit and negative values in func and global',
    '(module (global i64 (i64.const -1)) (func (result i64) i64.const -9223372036854775808 drop i64.const 4294967296 drop i64.const 9223372036854775807))'],
  ['legacy try / catch / catch_all / rethrow round-trip',
    '(module (type $t (func)) (tag $e (type $t)) (func try $l (result i32) i32.const 1 catch $e i32.const 2 catch_all rethrow $l end drop))'],
  ['GC array.new_data and array.init_data DataCount section',
    '(module (type $arr (array (mut i8))) (data "hello") (func (result (ref $arr)) i32.const 0 i32.const 5 array.new_data $arr 0))'],
  ['multi-value and parameterized blockType',
    '(module (func (param i32) (result i32) local.get 0 block (param i32) (result i32) end block (result i32 i64) i32.const 1 i64.const 2 end drop drop))'],
  ['inline exports on func, memory, table, global, tag',
    '(module (type $t (func)) (memory (export "mem") 1) (table (export "tbl") 1 funcref) (global (export "g") i32 (i32.const 7)) (tag (export "tg") (type $t)) (func (export "fn") (result i32) i32.const 42))'],
];

for (const [label, wat] of extraCases) {
  process.stdout.write(`  ${label} ... `);
  try {
    const wasm1 = Buffer.from(asm.assemble(wat));
    const wat2 = disassembleWASM(wasm1);
    const wasm2 = Buffer.from(asm.assemble(wat2));
    if (!wasm1.equals(wasm2)) {
      throw new Error(`byte mismatch: ${wasm1.toString('hex')} vs ${wasm2.toString('hex')}`);
    }
    console.log('PASS');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(`    ${error.message.split('\n')[0]}`);
  }
}

// Verify all 483 opcodes across base, 0xFC, 0xFB, and 0xFD tables round-trip byte-exactly
process.stdout.write('  all 483 opcodes round-trip ... ');
try {
  const allOps = [
    ...Object.values(OPCODE_NAME),
    ...Object.values(OPCODE_FC_NAME),
    ...Object.values(OPCODE_FB_NAME),
    ...Object.values(OPCODE_FD_NAME),
  ];
  let opcodeCount = 0;
  for (const op of allOps) {
    if (['else', 'end', 'catch', 'catch_all'].includes(op)) {
      opcodeCount++;
      continue;
    }
    let instrWat;
    if (op === 'block' || op === 'loop' || op === 'if') instrWat = `${op} end`;
    else if (op === 'try') instrWat = 'try catch 0 catch_all rethrow 0 end';
    else if (op === 'try_table') instrWat = 'try_table (catch 0 0) (catch_ref 0 0) (catch_all 0) (catch_all_ref 0) end';
    else if (op === 'rethrow') instrWat = 'try catch_all rethrow 0 end';
    else if (op === 'br_table') instrWat = 'br_table 0 0';
    else if (['br', 'br_if', 'br_on_null', 'br_on_non_null', 'local.get', 'local.set', 'local.tee',
      'global.get', 'global.set', 'table.get', 'table.set', 'table.grow', 'table.size', 'table.fill',
      'elem.drop', 'data.drop', 'call', 'return_call', 'call_ref', 'return_call_ref', 'throw',
      'ref.func', 'struct.new', 'struct.new_default', 'array.new', 'array.new_default',
      'array.get', 'array.get_s', 'array.get_u', 'array.set', 'array.fill'].includes(op)) instrWat = `${op} 0`;
    else if (['struct.get', 'struct.get_s', 'struct.get_u', 'struct.set', 'array.new_fixed',
      'array.new_data', 'array.init_data', 'array.new_elem', 'array.init_elem',
      'array.copy', 'table.init', 'table.copy'].includes(op)) instrWat = `${op} 1 0`;
    else if (op === 'memory.init') instrWat = 'memory.init 0';
    else if (['memory.copy', 'memory.fill', 'memory.size', 'memory.grow'].includes(op)) instrWat = op;
    else if (op === 'call_indirect' || op === 'return_call_indirect') instrWat = `${op} (type 0)`;
    else if (op === 'select_t') instrWat = 'select (result i32)';
    else if (op === 'ref.null') instrWat = 'ref.null func';
    else if (op === 'ref.test' || op === 'ref.cast') instrWat = `${op} (ref func)`;
    else if (op === 'ref.test_null' || op === 'ref.cast_null') instrWat = `${op.replace(/_null$/, '')} (ref null func)`;
    else if (op === 'br_on_cast' || op === 'br_on_cast_fail') instrWat = `${op} 0 (ref any) (ref eq)`;
    else if (op === 'i32.const' || op === 'i64.const') instrWat = `${op} -7`;
    else if (op === 'f32.const' || op === 'f64.const') instrWat = `${op} 1.5`;
    else if (op === 'v128.const') instrWat = 'v128.const i8x16 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15';
    else if (op === 'i8x16.shuffle') instrWat = 'i8x16.shuffle 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15';
    else if (/^(?:[if](8|16|32|64)x\d+\.(?:extract_lane|replace_lane)|v128\.(?:load|store)(8|16|32|64)_lane)/.test(op)) instrWat = `${op} 0`;
    else instrWat = op;

    const fullWat = `(module
      (type (func))
      (type (struct (field (mut i8))))
      (type (array (mut i8)))
      (table 1 funcref)
      (memory 1)
      (tag (type 0))
      (global (mut i32) (i32.const 0))
      (elem func 0)
      (data "a")
      (func (type 0) (local i32)
        ${instrWat}
      )
    )`;
    const w1 = Buffer.from(asm.assemble(fullWat));
    const wat2 = disassembleWASM(w1);
    const w2 = Buffer.from(asm.assemble(wat2));
    if (!w1.equals(w2)) {
      throw new Error(`opcode ${op} round-trip byte mismatch`);
    }
    opcodeCount++;
  }
  console.log(`PASS (${opcodeCount}/${allOps.length})`);
} catch (error) {
  failed += 1;
  console.log('FAIL');
  console.log(`    ${error.message.split('\n')[0]}`);
}

const totalTests = stableFixtures.length + extraCases.length + 1;
console.log(`\nSummary: ${totalTests - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
