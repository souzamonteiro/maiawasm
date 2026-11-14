'use strict';

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const WatAssembler = require('../../wat-assembler.js');
const {
  WasmVM,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  ResourceLimitError,
} = require('../../wasm-vm.js');

const asm = new WatAssembler();

console.log('Running VM validation, resource limits, subview, polyfill & pure-JS environment tests...');

// 1. DecodeError & UnsupportedFeatureError
{
  const badMagic = new Uint8Array([0x00, 0x61, 0x73, 0x00, 0x01, 0x00, 0x00, 0x00]);
  assert.strictEqual(WasmVM.validate(badMagic), false);
  const detMagic = WasmVM.validateDetailed(badMagic);
  assert.strictEqual(detMagic.valid, false);
  assert.ok(detMagic.error instanceof DecodeError);

  // Truncated section
  const truncated = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01]);
  assert.strictEqual(WasmVM.validate(truncated), false);
  assert.throws(() => WasmVM.compileSync(truncated), DecodeError);

  // memory64 (limits flag 0x04) -> UnsupportedFeatureError
  const mem64 = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x05, 0x03, 0x01, 0x04, 0x01, // Memory section: 1 memory, flag 0x04 (memory64), initial 1
  ]);
  assert.strictEqual(WasmVM.validate(mem64), false);
  assert.throws(() => WasmVM.compileSync(mem64), UnsupportedFeatureError);
}

// 2. Negative ValidationError cases (compared with native WebAssembly.validate)
{
  // Type mismatch: i32.add with f32 operand
  const badAddBytes = new Uint8Array(asm.assemble(`(module
    (func (result i32)
      i32.const 1
      f32.const 2.0
      i32.add
    )
  )`));
  assert.strictEqual(WasmVM.validate(badAddBytes), false);
  assert.strictEqual(WebAssembly.validate(badAddBytes), false);
  assert.throws(() => WasmVM.compileSync(badAddBytes), ValidationError);

  // Uninitialized non-nullable local read before set
  const badLocalBytes = new Uint8Array(asm.assemble(`(module
    (type $s (struct (field i32)))
    (func (result (ref $s))
      (local $x (ref $s))
      local.get $x
    )
  )`));
  assert.strictEqual(WasmVM.validate(badLocalBytes), false);
  assert.strictEqual(WebAssembly.validate(badLocalBytes), false);
  assert.throws(() => WasmVM.compileSync(badLocalBytes), ValidationError);

  // Global initializer referencing a non-imported or mutable global
  const badGlobalInitBytes = new Uint8Array(asm.assemble(`(module
    (global $g0 (mut i32) (i32.const 10))
    (global $g1 i32 (global.get $g0))
  )`));
  assert.strictEqual(WasmVM.validate(badGlobalInitBytes), false);
  assert.strictEqual(WebAssembly.validate(badGlobalInitBytes), false);
  assert.throws(() => WasmVM.compileSync(badGlobalInitBytes), ValidationError);
}

// 3. LinkError cases
{
  const importBytes = new Uint8Array(asm.assemble(`(module
    (import "env" "fn" (func (param i32) (result i32)))
    (import "env" "g" (global i32))
  )`));
  assert.throws(() => WasmVM.instantiateSync(importBytes, {}), LinkError);
  assert.throws(() => WasmVM.instantiateSync(importBytes, { env: { fn: 123, g: 1 } }), LinkError);
}

// 4. Resource limits (ResourceLimitError)
{
  // maxModuleBytes
  const simpleBytes = new Uint8Array(asm.assemble(`(module (func (export "f") (result i32) i32.const 42))`));
  assert.throws(
    () => WasmVM.compileSync(simpleBytes, { limits: { maxModuleBytes: 4 } }),
    ResourceLimitError
  );

  // maxFuel on infinite loop
  const loopBytes = new Uint8Array(asm.assemble(`(module
    (func (export "spin")
      loop $l
        br $l
      end
    )
  )`));
  const { instance: loopInst } = WasmVM.instantiateSync(loopBytes, {}, { limits: { maxFuel: 500 } });
  assert.throws(() => loopInst.exports.spin(), ResourceLimitError);

  // maxCallDepth on non-tail recursion
  const recBytes = new Uint8Array(asm.assemble(`(module
    (func $deep (export "deep") (param i32) (result i32)
      local.get 0
      i32.const 1
      i32.add
      call $deep
      i32.const 1
      i32.add
    )
  )`));
  const { instance: recInst } = WasmVM.instantiateSync(recBytes, {}, { limits: { maxCallDepth: 32 } });
  assert.throws(() => recInst.exports.deep(0), ResourceLimitError);

  // maxMemoryPages
  const memBytes = new Uint8Array(asm.assemble(`(module (memory 10))`));
  assert.throws(
    () => WasmVM.instantiateSync(memBytes, {}, { limits: { maxMemoryPages: 4 } }),
    ResourceLimitError
  );

  // maxTableElements
  const tblBytes = new Uint8Array(asm.assemble(`(module (table 100 funcref))`));
  assert.throws(
    () => WasmVM.instantiateSync(tblBytes, {}, { limits: { maxTableElements: 50 } }),
    ResourceLimitError
  );

  // maxGCObjects
  const gcBytes = new Uint8Array(asm.assemble(`(module
    (type $box (struct (field i32)))
    (func (export "alloc_many") (param $n i32)
      (local $i i32)
      loop $l
        local.get $i
        local.get $n
        i32.lt_s
        if
          local.get $i
          struct.new $box
          drop
          local.get $i
          i32.const 1
          i32.add
          local.set $i
          br $l
        end
      end
    )
  )`));
  const { instance: gcInst } = WasmVM.instantiateSync(gcBytes, {}, { limits: { maxGCObjects: 10 } });
  gcInst.exports.alloc_many(5);
  assert.throws(() => gcInst.exports.alloc_many(20), ResourceLimitError);
}

// 5. Uint8Array subview with non-zero byteOffset
{
  const raw = new Uint8Array(asm.assemble(`(module
    (func (export "add") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.add
    )
  )`));
  const backing = new ArrayBuffer(raw.length + 37);
  const subview = new Uint8Array(backing, 19, raw.length);
  subview.set(raw);
  assert.strictEqual(WasmVM.validate(subview), true);
  const { instance } = WasmVM.instantiateSync(subview);
  assert.strictEqual(instance.exports.add(17, 25), 42);
}

// 6. WebAssembly-compatible polyfill (createWebAssemblyPolyfill)
async function testPolyfillAndIsolatedEnv() {
  const Polyfill = WasmVM.createWebAssemblyPolyfill();
  const raw = new Uint8Array(asm.assemble(`(module
    (func (export "mul") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.mul
    )
  )`));
  assert.strictEqual(Polyfill.validate(raw), true);
  const mod = await Polyfill.compile(raw);
  const instFromMod = await Polyfill.instantiate(mod);
  assert.strictEqual(instFromMod.exports.mul(6, 7), 42);
  const { module: mod2, instance: inst2 } = await Polyfill.instantiate(raw);
  assert.ok(mod2 instanceof Polyfill.Module);
  assert.strictEqual(inst2.exports.mul(9, 9), 81);

  // 7. Browser bundle inside isolated vm context with WebAssembly=undefined and Buffer=undefined
  const bundlePath = path.join(__dirname, '../../wasm-vm.browser.js');
  const bundleCode = fs.readFileSync(bundlePath, 'utf8');
  const sandbox = {
    Uint8Array,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    ArrayBuffer,
    DataView,
    BigInt,
    Math,
    Number,
    String,
    Object,
    Array,
    Map,
    Set,
    WeakMap,
    Symbol,
    Error,
    TypeError,
    RangeError,
    Promise,
    TextDecoder,
    TextEncoder,
    WebAssembly: undefined,
    Buffer: undefined,
    wasmBytes: new Uint8Array(raw),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);
  const res = vm.runInContext(
    `(() => {
      if (typeof WebAssembly !== 'undefined') throw new Error('WebAssembly should be undefined');
      if (typeof Buffer !== 'undefined') throw new Error('Buffer should be undefined');
      const { instance } = MaiaWasmVM.WasmVM.instantiateSync(wasmBytes);
      return instance.exports.mul(12, 11);
    })()`,
    sandbox
  );
  assert.strictEqual(res, 132);

  // 8. Child process with WebAssembly and Buffer poisoned after loading
  const childOut = execFileSync(
    process.execPath,
    [
      '-e',
      `
      const { WasmVM } = require('./assembler/wasm-vm.js');
      globalThis.WebAssembly = undefined;
      globalThis.Buffer = undefined;
      const bytes = new Uint8Array([${Array.from(raw).join(',')}]);
      const { instance } = WasmVM.instantiateSync(bytes);
      process.stdout.write(String(instance.exports.mul(14, 3)));
      `,
    ],
    { cwd: path.join(__dirname, '../../..'), encoding: 'utf8' }
  );
  assert.strictEqual(childOut, '42');

  console.log('  PASS: VM validation, resource limits, subview, polyfill & pure-JS environment tests');
}

testPolyfillAndIsolatedEnv().catch(err => {
  console.error(err);
  process.exit(1);
});
