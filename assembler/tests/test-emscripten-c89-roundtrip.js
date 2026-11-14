'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WatAssembler = require('../wat-assembler.js');
const { disassembleWASM } = require('../wasm-disassembler.js');
const { WasmVM } = require('../wasm-vm.js');

const asm = new WatAssembler();
const suiteDir = path.join(__dirname, '..', 'examples', 'c89-mini-suite');
const outDir = path.join(__dirname, 'outputs', 'emscripten-c89-roundtrip');
const emsdkDir = path.join(os.homedir(), 'emsdk');
const emsdkEnv = path.join(emsdkDir, 'emsdk_env.sh');
const hasEmsdk = fs.existsSync(emsdkEnv);

if (!fs.existsSync(suiteDir)) {
  console.error('Missing C89 mini-suite folder:', suiteDir);
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
  return spawnSync('bash', ['-lc', command], { encoding: 'utf8' });
}

let failed = 0;
console.log(`Running Emscripten C89 roundtrip & VM execution validation (${hasEmsdk ? 'emcc live' : 'cached wasm'})...\n`);

for (const cFile of cFiles) {
  process.stdout.write(`  ${cFile} ... `);

  try {
    const base = cFile.slice(0, -2);
    const cPath = path.join(suiteDir, cFile);
    const wasmPath = path.join(outDir, `${base}.wasm`);
    const watPath = path.join(outDir, `${base}.wat`);
    const roundtripWasmPath = path.join(outDir, `${base}.roundtrip.wasm`);

    if (hasEmsdk) {
      const compileCmd = [
        'export EMSDK_QUIET=1',
        '&&',
        `source "${emsdkEnv}" >/dev/null`,
        '&& emcc',
        `"${cPath}"`,
        '-std=c89',
        '-O0',
        '-sWASM=1',
        '-sSTANDALONE_WASM=1',
        '-Wl,--no-entry',
        '-Wl,--export=test_entry',
        `-o "${wasmPath}"`
      ].join(' ');

      const compile = runShell(compileCmd);
      if (compile.status !== 0) {
        throw new Error(`emcc failed: ${(compile.stderr || compile.stdout || '').trim().split('\n')[0]}`);
      }
    } else if (!fs.existsSync(wasmPath)) {
      throw new Error(`Cached wasm not found at ${wasmPath} and emsdk is unavailable`);
    }

    const wasm = new Uint8Array(fs.readFileSync(wasmPath));
    if (!WasmVM.validate(wasm)) {
      throw new Error('original emcc wasm failed WasmVM.validate');
    }
    if (typeof WebAssembly !== 'undefined' && !WebAssembly.validate(wasm)) {
      throw new Error('original emcc wasm failed WebAssembly.validate');
    }

    const wat = disassembleWASM(wasm);
    if (wat.includes('unknown_')) {
      throw new Error('disassembler emitted unknown opcode(s)');
    }
    fs.writeFileSync(watPath, wat, 'utf8');

    const roundtripWasm = new Uint8Array(asm.assemble(wat));
    fs.writeFileSync(roundtripWasmPath, Buffer.from(roundtripWasm));

    if (!WasmVM.validate(roundtripWasm)) {
      throw new Error('roundtrip wasm failed WasmVM.validate');
    }
    if (typeof WebAssembly !== 'undefined' && !WebAssembly.validate(roundtripWasm)) {
      throw new Error('roundtrip wasm failed WebAssembly.validate');
    }

    const { instance: vmOrig } = WasmVM.instantiateSync(wasm);
    const { instance: vmRt } = WasmVM.instantiateSync(roundtripWasm);
    const resOrig = vmOrig.exports.test_entry();
    const resRt = vmRt.exports.test_entry();
    if (resOrig !== resRt) {
      throw new Error(`VM execution mismatch: original=${resOrig}, roundtrip=${resRt}`);
    }
    if (typeof WebAssembly !== 'undefined') {
      const nativeInst = new WebAssembly.Instance(new WebAssembly.Module(wasm));
      const resNative = nativeInst.exports.test_entry();
      if (resOrig !== resNative) {
        throw new Error(`Native oracle mismatch: vm=${resOrig}, native=${resNative}`);
      }
    }

    console.log(`PASS (test_entry = ${resOrig})`);
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(`    ${String(error.message || error).split('\n')[0]}`);
  }
}

console.log(`\nSummary: ${cFiles.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
