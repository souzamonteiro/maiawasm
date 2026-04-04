'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WatAssembler = require('../wat-assembler.js');
const { disassembleWASM } = require('../wasm-disassembler.js');

function hasCommand(cmd) {
  const probe = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return !probe.error;
}

function runTool(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    throw new Error(`${cmd} failed: ${(r.stderr || r.stdout || '').trim()}`);
  }
}

function sanitizeWat(source) {
  return source
    .split('\n')
    .map(line => line.replace(/;;.*$/, ''))
    .join('\n')
    .trim();
}

if (!hasCommand('wat2wasm') || !hasCommand('wasm2wat')) {
  console.log('SKIP external_wabt_validation (wat2wasm/wasm2wat not found in PATH)');
  process.exit(0);
}

const asm = new WatAssembler();
const fixturesDir = path.join(__dirname, 'fixtures');
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-wabt-'));

let failed = 0;
console.log('Running external WABT validation...\n');

for (const fixture of stableFixtures) {
  process.stdout.write(`  ${fixture} ... `);
  try {
    const fixturePath = path.join(fixturesDir, fixture);
    const source = sanitizeWat(fs.readFileSync(fixturePath, 'utf8'));

    const wasm = asm.assemble(source);
    assert.ok(WebAssembly.validate(new Uint8Array(wasm)), 'baseline wasm must validate');

    const disassembled = disassembleWASM(Buffer.from(wasm));
    assert.ok(!(disassembled.includes('unknown_')), 'disassembled output contains unknown opcodes');

    const watPath = path.join(tmpDir, `${fixture}.roundtrip.wat`);
    const wasmPath = path.join(tmpDir, `${fixture}.roundtrip.wasm`);
    const watBackPath = path.join(tmpDir, `${fixture}.back.wat`);

    fs.writeFileSync(watPath, disassembled, 'utf8');

    runTool('wat2wasm', [watPath, '-o', wasmPath]);
    runTool('wasm2wat', [wasmPath, '-o', watBackPath]);

    const watBack = fs.readFileSync(watBackPath, 'utf8');
    assert.ok(watBack.includes('(module'), 'wasm2wat output must contain module');

    console.log('PASS');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(`    ${String(error.message || error).split('\n')[0]}`);
  }
}

console.log(`\nSummary: ${stableFixtures.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
