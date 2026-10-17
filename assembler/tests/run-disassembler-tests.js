'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const TESTS = [
  'tests/test-disassembler.js',
  'tests/test-disassembler-roundtrip.js',
  'tests/test-disassembler-negative.js',
  'tests/test-disassembler-integrity.js',
  'tests/test-disassembler-bounds.js',
  'tests/test-disassembler-types.js',
  'tests/test-disassembler-memory.js',
  'tests/test-disassembler-strings.js',
  'tests/test-disassembler-floats.js',
  'tests/test-instruction-decoder.js',
  'tests/test-module-decoder.js',
  'tests/test-control-validation.js',
  'tests/test-disassembler-proposal-binary.js',
  'tests/test-disassembler-immediates.js',
  'tests/test-disassembler-primitives.js',
  'tests/test-disassembler-custom-sections.js',
  'tests/test-disassembler-external-wabt.js'
];

let failed = 0;

console.log('Running disassembler test suite...\n');

for (const script of TESTS) {
  process.stdout.write(`  ${script} ... `);

  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8'
  });

  if (r.status === 0) {
    console.log('PASS');
    continue;
  }

  failed += 1;
  console.log('FAIL');
  const details = (r.stderr || r.stdout || 'Unknown test failure').trim();
  const firstLine = details.split('\n')[0];
  console.log(`    ${firstLine}`);
}

console.log(`\nSummary: ${TESTS.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
