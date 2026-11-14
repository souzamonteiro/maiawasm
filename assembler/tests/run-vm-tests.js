#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const WatAssembler = require('../wat-assembler.js');
const { WasmVM } = require('../wasm-vm.js');

const asm = new WatAssembler();

const SUITES = [
  'vm/test-vm-numeric-control.js',
  'vm/test-vm-memory-tables-host.js',
  'vm/test-vm-simd.js',
  'vm/test-vm-gc-types.js',
  'vm/test-vm-exceptions.js',
  'vm/test-vm-validation-limits-env.js',
  'test-emscripten-c89-roundtrip.js',
];

console.log('=== MaiaWASM Pure-JS VM Test Runner ===\n');

// 1. Assemble and validate all 9 stable WAT fixtures in assembler/tests/fixtures
const fixturesDir = path.join(__dirname, 'fixtures');
const fixtureFiles = [
  '01-basic-module.wat',
  '02-arithmetic.wat',
  '03-control-flow.wat',
  '04-memory.wat',
  '05-table.wat',
  '06-globals.wat',
  '07-float.wat',
  '08-simd.wat',
  '09-complex.wat',
];
console.log(`Checking ${fixtureFiles.length} WAT fixtures with WasmVM.validate vs WebAssembly.validate...`);
for (const file of fixtureFiles) {
  const source = fs
    .readFileSync(path.join(fixturesDir, file), 'utf8')
    .split('\n')
    .map(line => line.replace(/;;.*$/, ''))
    .join('\n')
    .trim();
  const bytes = new Uint8Array(asm.assemble(source));
  const vmValid = WasmVM.validate(bytes);
  const natValid = WebAssembly.validate(bytes);
  if (vmValid !== natValid || !vmValid) {
    console.error(`  FAIL fixture ${file}: vm=${vmValid} nat=${natValid}`);
    process.exit(1);
  }
  console.log(`  PASS fixture ${file}`);
}

console.log('');

// 2. Run all VM test suites
let passed = 0;
for (const rel of SUITES) {
  const fullPath = path.join(__dirname, rel);
  process.stdout.write(`Running ${rel} ... `);
  try {
    execFileSync(process.execPath, [fullPath], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe',
    });
    console.log('PASS');
    passed++;
  } catch (err) {
    console.log('FAIL');
    if (err.stdout) process.stdout.write(err.stdout.toString());
    if (err.stderr) process.stderr.write(err.stderr.toString());
    process.exit(1);
  }
}

console.log(`\nALL ${passed}/${SUITES.length} VM TEST SUITES + ${fixtureFiles.length} FIXTURES PASSED.`);
