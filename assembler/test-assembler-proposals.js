'use strict';

const WatAssembler = require('./wat-assembler.js');
const asm = new WatAssembler();

// Proposal-oriented coverage: these cases may not validate in the host runtime
// yet, so this suite only asserts successful assembly and WASM magic/version.
const CASES = [
  ['try_table catch_all',
    '(module (func (param i32) try_table (catch_all $L) local.get 0 end))'],
  ['try_table catch',
    '(module (type $t (func)) (tag $e (type $t)) (func (param i32) try_table (catch $e $L) local.get 0 end))'],
  ['try_table catch_ref',
    '(module (type $t (func)) (tag $e (type $t)) (func (param i32) try_table (catch_ref $e $L) local.get 0 end))'],
  ['try_table catch_all_ref',
    '(module (func (param i32) try_table (catch_all_ref $L) local.get 0 end))'],
  ['subtype final + supertype',
    '(module (type $a (sub (func))) (type $b (sub final (type $a) (func (param i32) (result i32)))))'],
  ['recursive rec group',
    '(module (type $r (rec (sub (func)) (sub final (func (param i64) (result i64))))))'],
];

let pass = 0;
for (const [label, wat] of CASES) {
  try {
    const wasm = asm.assemble(wat);
    const okMagic = wasm.length >= 8
      && wasm[0] === 0x00
      && wasm[1] === 0x61
      && wasm[2] === 0x73
      && wasm[3] === 0x6d
      && wasm[4] === 0x01
      && wasm[5] === 0x00
      && wasm[6] === 0x00
      && wasm[7] === 0x00;

    console.log((okMagic ? 'OK     ' : 'INVALID') + ' [' + label + '] ' + wasm.length + 'B');
    if (okMagic) pass++;
  } catch (e) {
    console.error('ERROR  [' + label + ']: ' + e.message);
  }
}

console.log('\n' + pass + '/' + CASES.length + ' proposal modules assembled');
process.exit(pass === CASES.length ? 0 : 1);
