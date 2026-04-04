'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WatAssembler = require('../wat-assembler.js');
const { disassembleWASM } = require('../wasm-disassembler.js');

const asm = new WatAssembler();
const suiteDir = path.join(__dirname, '..', 'examples', 'c89-mini-suite');
const outDir = path.join(__dirname, 'outputs', 'emscripten-c89-roundtrip');
const emsdkDir = path.join(os.homedir(), 'emsdk');
const emsdkEnv = path.join(emsdkDir, 'emsdk_env.sh');

if (!fs.existsSync(suiteDir)) {
  console.error('Missing C89 mini-suite folder:', suiteDir);
  process.exit(1);
}

if (!fs.existsSync(emsdkEnv)) {
  console.error('Emscripten environment script not found:', emsdkEnv);
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const cFiles = fs.readdirSync(suiteDir)
  .filter(name => name.endsWith('.c'))
  .sort();

if (cFiles.length === 0) {
  console.error('No C files found in mini-suite.');
  process.exit(1);
}

function runShell(command) {
  const r = spawnSync('bash', ['-lc', command], { encoding: 'utf8' });
  return r;
}

let failed = 0;
console.log('Running Emscripten C89 roundtrip validation...\n');

for (const cFile of cFiles) {
  process.stdout.write(`  ${cFile} ... `);

  try {
    const base = cFile.slice(0, -2);
    const cPath = path.join(suiteDir, cFile);
    const wasmPath = path.join(outDir, `${base}.wasm`);
    const watPath = path.join(outDir, `${base}.wat`);
    const roundtripWasmPath = path.join(outDir, `${base}.roundtrip.wasm`);

    const compileCmd = [
      'export EMSDK_QUIET=1',
      '&&',
      `source \"${emsdkEnv}\" >/dev/null`,
      '&& emcc',
      `\"${cPath}\"`,
      '-std=c89',
      '-O0',
      '-sWASM=1',
      '-sSTANDALONE_WASM=1',
      '-Wl,--no-entry',
      '-Wl,--export=test_entry',
      `-o \"${wasmPath}\"`
    ].join(' ');

    const compile = runShell(compileCmd);
    if (compile.status !== 0) {
      throw new Error(`emcc failed: ${(compile.stderr || compile.stdout || '').trim().split('\n')[0]}`);
    }

    const wasm = fs.readFileSync(wasmPath);
    if (!WebAssembly.validate(new Uint8Array(wasm))) {
      throw new Error('original emcc wasm is invalid');
    }

    const wat = disassembleWASM(wasm);
    if (wat.includes('unknown_')) {
      throw new Error('disassembler emitted unknown opcode(s)');
    }
    fs.writeFileSync(watPath, wat, 'utf8');

    const roundtripWasm = asm.assemble(wat);
    fs.writeFileSync(roundtripWasmPath, Buffer.from(roundtripWasm));

    if (!WebAssembly.validate(new Uint8Array(roundtripWasm))) {
      throw new Error('roundtrip wasm is invalid');
    }

    console.log('PASS');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(`    ${String(error.message || error).split('\n')[0]}`);
  }
}

console.log(`\nSummary: ${cFiles.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
