'use strict';
const WatAssembler = require('./wat-assembler.js');
const asm = new WatAssembler();

// Each entry: { label, wat, expectError? }
// Note: the WAT parser has a known lexer ordering issue where decimal float
// literals (e.g. 3.14) are tokenized as nat+garbage. Use integer form instead.
const TESTS = [
  ['add function',
    '(module (func $add (param i32 i32) (result i32) local.get 0 local.get 1 i32.add) (export "add" (func $add)))'],
  ['import + memory + data + global',
    '(module (import "env" "log" (func $log (param i32))) (memory 1) (global $g (mut i32) (i32.const 0)) (data (i32.const 0) "hello") (func $run (result i32) i32.const 42 global.set $g global.get $g) (export "run" (func $run)) (export "mem" (memory 0)))'],
  ['block + br_if',
    '(module (func $f (param i32) (result i32) block local.get 0 i32.eqz br_if 0 i32.const 1 return end i32.const 0) (export "f" (func $f)))'],
  ['loop + named locals',
    '(module (func $f (param i32) (result i32) (local $acc i32) i32.const 0 local.set $acc loop local.get $acc local.get 0 i32.add local.set $acc br 0 end local.get $acc) (export "f" (func $f)))'],
  ['if-else',
    '(module (func $abs (param i32) (result i32) local.get 0 i32.const 0 i32.lt_s if (result i32) i32.const 0 local.get 0 i32.sub else local.get 0 end) (export "abs" (func $abs)))'],
  ['table + call_indirect',
    '(module (type $t (func (param i32) (result i32))) (table 1 funcref) (func $double (param i32) (result i32) local.get 0 i32.const 2 i32.mul) (elem (i32.const 0) func $double) (func $call (param i32 i32) (result i32) local.get 0 local.get 1 call_indirect (type $t)) (export "call" (func $call)))'],
  ['memory load/store',
    '(module (memory 1) (func $store (param i32 i32) local.get 0 local.get 1 i32.store) (func $load (param i32) (result i32) local.get 0 i32.load) (export "store" (func $store)) (export "load" (func $load)))'],
  ['f64 integer const',
    '(module (func $f (result f64) f64.const 42) (export "f" (func $f)))'],
  ['i32 comparisons',
    '(module (func $f (param i32 i32) (result i32) local.get 0 local.get 1 i32.lt_s) (export "f" (func $f)))'],
  ['sign-extension i32.extend8_s',
    '(module (func $f (param i32) (result i32) local.get 0 i32.extend8_s) (export "f" (func $f)))'],
  ['global mut read/write',
    '(module (global $x (mut i32) (i32.const 7)) (func $set (param i32) local.get 0 global.set $x) (func $get (result i32) global.get $x) (export "set" (func $set)) (export "get" (func $get)))'],
  ['start section',
    '(module (func $init) (start $init))'],
  ['elem passive func',
    '(module (func $f) (elem func $f))'],
  ['elem declare func',
    '(module (func $f) (elem declare func $f))'],
  ['elem active tableUse + offset',
    '(module (table 2 funcref) (func $f) (elem (table 0) (offset (i32.const 0)) func $f))'],
  ['elem passive expr list',
    '(module (table 1 funcref) (elem funcref (item (ref.null func))))'],
  ['tag local definition',
    '(module (type $t (func)) (tag $e (type $t)))'],
  ['struct type definition',
    '(module (type $s (struct (field i32) (field i16 (mut)))))'],
  ['array type definition',
    '(module (type $a (array (field i8 (mut)))))'],
  ['func + struct + array mixed types',
    '(module (type $f (func (param i32) (result i32))) (type $s (struct (field i32))) (type $a (array (field i8 (mut)))) (func (type $f) local.get 0))'],
  ['named block labels + br',
    '(module (func block $outer block $inner br $outer end end))'],
  ['typed select (result i32)',
    '(module (func $f (param i32 i32 i32) (result i32) local.get 0 local.get 1 local.get 2 select (result i32)) (export "f" (func $f)))'],
  ['bulk memory: memory.copy + memory.fill',
    '(module (memory 1) (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 memory.copy local.get 0 local.get 1 local.get 2 memory.fill) (export "ops" (func $ops)))'],
  ['bulk memory: memory.init + data.drop',
    '(module (memory 1) (data "a") (data "b") (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 memory.init 1 0 data.drop 1) (export "ops" (func $ops)))'],
  ['bulk memory: memory.init shorthand memidx default',
    '(module (memory 1) (data "a") (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 memory.init 0) (export "ops" (func $ops)))'],
  ['bulk memory: data.drop shorthand default',
    '(module (memory 1) (data "a") (func $ops data.drop) (export "ops" (func $ops)))'],
  ['bulk memory: table.init + elem.drop with explicit indices',
    '(module (table 2 funcref) (table 2 funcref) (func $f) (func $g) (elem (table 0) (offset (i32.const 0)) func $f) (elem (table 1) (offset (i32.const 0)) func $g) (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 table.init 1 0 elem.drop 1) (export "ops" (func $ops)))'],
  ['bulk memory: table.copy shorthand defaults',
    '(module (table 2 funcref) (func $f) (elem (i32.const 0) func $f) (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 table.copy) (export "ops" (func $ops)))'],
  ['bulk memory: table.init shorthand memidx default',
    '(module (table 1 funcref) (func $f) (elem (i32.const 0) func $f) (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 table.init 0) (export "ops" (func $ops)))'],
  ['bulk memory: table.copy with explicit indices',
    '(module (table 2 funcref) (table 2 funcref) (func $f) (elem (table 0) (offset (i32.const 0)) func $f) (func $ops (param i32 i32 i32) local.get 0 local.get 1 local.get 2 table.copy 0 1) (export "ops" (func $ops)))'],
  ['non-trapping conversion: i32.trunc_sat_f64_s',
    '(module (func $f (param f64) (result i32) local.get 0 i32.trunc_sat_f64_s) (export "f" (func $f)))'],
];

let pass = 0;
for (const [label, wat] of TESTS) {
  try {
    const wasm = asm.assemble(wat);
    const valid = WebAssembly.validate(wasm);
    console.log((valid ? 'VALID  ' : 'INVALID') + ' [' + label + '] ' + wasm.length + 'B');
    if (valid) pass++;
  } catch (e) {
    console.error('ERROR  [' + label + ']: ' + e.message);
  }
}
console.log('\n' + pass + '/' + TESTS.length + ' WASM modules valid');
process.exit(pass === TESTS.length ? 0 : 1);
