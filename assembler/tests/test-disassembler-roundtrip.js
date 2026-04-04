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

    console.log('PASS');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(`    ${error.message.split('\n')[0]}`);
  }
}

console.log(`\nSummary: ${stableFixtures.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
