'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WatAssembler = require('../../wat-assembler.js');
const { WasmVM, Trap } = require('../../wasm-vm.js');

const asm = new WatAssembler();
const expectedDir = path.join(__dirname, '..', 'expected');

function compileBoth(wat) {
  const bytes = new Uint8Array(asm.assemble(wat));
  const { instance: vmInst } = WasmVM.instantiateSync(bytes);
  const nativeInst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  return { bytes, vm: vmInst.exports, native: nativeInst.exports };
}

function assertSameResult(fnName, vmExports, nativeExports, ...args) {
  let vmVal, vmErr;
  let natVal, natErr;
  try {
    vmVal = vmExports[fnName](...args);
  } catch (e) {
    vmErr = e;
  }
  try {
    natVal = nativeExports[fnName](...args);
  } catch (e) {
    natErr = e;
  }
  if (natErr) {
    assert(vmErr, `Expected ${fnName}(${args.join(', ')}) to trap, got ${vmVal}`);
    assert(vmErr instanceof Trap, `Expected Trap instance, got ${vmErr.constructor.name}: ${vmErr.message}`);
    return;
  }
  if (vmErr) {
    throw vmErr;
  }
  if (typeof natVal === 'number' && Number.isNaN(natVal)) {
    assert(Number.isNaN(vmVal), `Expected NaN for ${fnName}, got ${vmVal}`);
  } else {
    assert.strictEqual(Object.is(vmVal, natVal), true, `Mismatch on ${fnName}(${args.join(', ')}): vm=${vmVal} vs native=${natVal}`);
  }
}

console.log('Running VM numeric & control flow tests...');

// 1. Execute fixtures 01, 02, 03, 07 and compare against native WebAssembly
{
  const f01 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '01-basic-module.wasm')));
  const { instance: vm01 } = WasmVM.instantiateSync(f01);
  assert.strictEqual(typeof vm01.exports.answer, 'function');
  assert.strictEqual(vm01.exports.answer(), 42);

  const f02 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '02-arithmetic.wasm')));
  const { instance: vm02 } = WasmVM.instantiateSync(f02);
  const nat02 = new WebAssembly.Instance(new WebAssembly.Module(f02));
  for (const [a, b] of [[10, 3], [-15, 4], [0, 7], [2147483647, 1]]) {
    assertSameResult('add', vm02.exports, nat02.exports, a, b);
    assertSameResult('sub', vm02.exports, nat02.exports, a, b);
    assertSameResult('mul', vm02.exports, nat02.exports, a, b);
    assertSameResult('div', vm02.exports, nat02.exports, a, b);
    assertSameResult('mixed', vm02.exports, nat02.exports, a, b, 5);
  }
  assertSameResult('div', vm02.exports, nat02.exports, 10, 0);
  assertSameResult('div', vm02.exports, nat02.exports, -2147483648, -1);

  const f03 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '03-control-flow.wasm')));
  const { instance: vm03 } = WasmVM.instantiateSync(f03);
  const nat03 = new WebAssembly.Instance(new WebAssembly.Module(f03));
  for (const x of [-42, -1, 0, 1, 99]) {
    assertSameResult('abs', vm03.exports, nat03.exports, x);
  }
  for (const n of [0, 1, 5, 7, 10]) {
    assertSameResult('factorial', vm03.exports, nat03.exports, n);
  }
  for (const [a, b, c] of [[1, 2, 3], [9, 4, 2], [3, 8, 5], [-5, -2, -9]]) {
    assertSameResult('max3', vm03.exports, nat03.exports, a, b, c);
  }

  const f07 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '07-float.wasm')));
  const { instance: vm07 } = WasmVM.instantiateSync(f07);
  const nat07 = new WebAssembly.Instance(new WebAssembly.Module(f07));
  for (const [a, b] of [[1.5, 2.25], [-0.0, 0.0], [-3.5, 1.5], [NaN, 1.0], [Infinity, -2.5]]) {
    assertSameResult('f32_add', vm07.exports, nat07.exports, a, b);
    assertSameResult('f32_mul', vm07.exports, nat07.exports, a, b);
    assertSameResult('f32_min', vm07.exports, nat07.exports, a, b);
    assertSameResult('f32_max', vm07.exports, nat07.exports, a, b);
    assertSameResult('f64_add', vm07.exports, nat07.exports, a, b);
    assertSameResult('f64_mul', vm07.exports, nat07.exports, a, b);
    assertSameResult('f64_div', vm07.exports, nat07.exports, a, b);
    assertSameResult('hypotenuse', vm07.exports, nat07.exports, 3.0, 4.0);
  }
  for (const v of [-2.5, -1.5, -0.5, -0.0, 0.0, 0.5, 1.5, 2.5, 3.5, NaN, Infinity, -Infinity]) {
    assertSameResult('f32_sqrt', vm07.exports, nat07.exports, v);
    assertSameResult('f32_abs', vm07.exports, nat07.exports, v);
    assertSameResult('f32_neg', vm07.exports, nat07.exports, v);
    assertSameResult('f32_ceil', vm07.exports, nat07.exports, v);
    assertSameResult('f32_floor', vm07.exports, nat07.exports, v);
    assertSameResult('f32_trunc', vm07.exports, nat07.exports, v);
    assertSameResult('f32_nearest', vm07.exports, nat07.exports, v);
  }
}

// 2. Comprehensive i32 & i64 bitwise, shifts, rotations, divisions, extensions, conversions
{
  const { vm, native } = compileBoth(`(module
    (func (export "i32_ops") (param i32 i32) (result i32)
      local.get 0 i32.clz
      local.get 0 i32.ctz i32.add
      local.get 0 i32.popcnt i32.add
      local.get 0 local.get 1 i32.rotl i32.xor
      local.get 0 local.get 1 i32.rotr i32.xor
      local.get 0 i32.extend8_s i32.add
      local.get 0 i32.extend16_s i32.add
    )
    (func (export "i32_rem_s") (param i32 i32) (result i32)
      local.get 0 local.get 1 i32.rem_s
    )
    (func (export "i32_div_u") (param i32 i32) (result i32)
      local.get 0 local.get 1 i32.div_u
    )
    (func (export "i32_rem_u") (param i32 i32) (result i32)
      local.get 0 local.get 1 i32.rem_u
    )
    (func (export "i64_ops") (param i64 i64) (result i64)
      local.get 0 i64.clz
      local.get 0 i64.ctz i64.add
      local.get 0 i64.popcnt i64.add
      local.get 0 local.get 1 i64.rotl i64.xor
      local.get 0 local.get 1 i64.rotr i64.xor
      local.get 0 i64.extend8_s i64.add
      local.get 0 i64.extend16_s i64.add
      local.get 0 i64.extend32_s i64.add
    )
    (func (export "i64_div_s") (param i64 i64) (result i64)
      local.get 0 local.get 1 i64.div_s
    )
    (func (export "i64_rem_s") (param i64 i64) (result i64)
      local.get 0 local.get 1 i64.rem_s
    )
    (func (export "i64_div_u") (param i64 i64) (result i64)
      local.get 0 local.get 1 i64.div_u
    )
    (func (export "i64_rem_u") (param i64 i64) (result i64)
      local.get 0 local.get 1 i64.rem_u
    )
  )`);

  for (const [a, b] of [[0, 0], [1, 1], [-1, 5], [0x8000ff81 | 0, 13], [0x12345678, 37]]) {
    assertSameResult('i32_ops', vm, native, a, b);
  }
  assertSameResult('i32_rem_s', vm, native, -2147483648, -1);
  assertSameResult('i32_rem_s', vm, native, 10, 0);
  assertSameResult('i32_div_u', vm, native, -1, 2);
  assertSameResult('i32_rem_u', vm, native, -1, 7);

  for (const [a, b] of [[0n, 0n], [1n, 1n], [-1n, 19n], [-9223372036854775808n, 65n], [0x123456789abcdef0n, 7n]]) {
    assertSameResult('i64_ops', vm, native, a, b);
  }
  assertSameResult('i64_div_s', vm, native, -9223372036854775808n, -1n);
  assertSameResult('i64_rem_s', vm, native, -9223372036854775808n, -1n);
  assertSameResult('i64_div_u', vm, native, -1n, 3n);
  assertSameResult('i64_rem_u', vm, native, -1n, 3n);
}

// 3. Bit-preserving NaN payloads & float conversions (trapping + saturating 0xFC)
{
  const { vm, native } = compileBoth(`(module
    (func (export "nan32_payload") (result i32)
      i32.const 0x7fa01234
      f32.reinterpret_i32
      f32.neg
      i32.reinterpret_f32
    )
    (func (export "nan64_payload") (result i64)
      i64.const 0x7ff4000012345678
      f64.reinterpret_i64
      f64.neg
      i64.reinterpret_f64
    )
    (func (export "trunc_s32") (param f64) (result i32)
      local.get 0 i32.trunc_f64_s
    )
    (func (export "trunc_sat_s32") (param f64) (result i32)
      local.get 0 i32.trunc_sat_f64_s
    )
    (func (export "trunc_sat_u32") (param f64) (result i32)
      local.get 0 i32.trunc_sat_f64_u
    )
    (func (export "trunc_sat_s64") (param f64) (result i64)
      local.get 0 i64.trunc_sat_f64_s
    )
    (func (export "trunc_sat_u64") (param f64) (result i64)
      local.get 0 i64.trunc_sat_f64_u
    )
    (func (export "convert_i64_f32_s") (param i64) (result f32)
      local.get 0 f32.convert_i64_s
    )
    (func (export "convert_i64_f32_u") (param i64) (result f32)
      local.get 0 f32.convert_i64_u
    )
  )`);

  assertSameResult('nan32_payload', vm, native);
  assertSameResult('nan64_payload', vm, native);
  assert.strictEqual(vm.nan32_payload() >>> 0, 0xffa01234);
  assert.strictEqual(BigInt.asUintN(64, vm.nan64_payload()), 0xfff4000012345678n);

  for (const v of [0, -0, 42.9, -42.9, 2147483647, -2147483648, 2147483648, -2147483649, Infinity, -Infinity, NaN]) {
    assertSameResult('trunc_s32', vm, native, v);
    assertSameResult('trunc_sat_s32', vm, native, v);
    assertSameResult('trunc_sat_u32', vm, native, v);
    assertSameResult('trunc_sat_s64', vm, native, v);
    assertSameResult('trunc_sat_u64', vm, native, v);
  }
  for (const bi of [0n, 1n, -1n, 9007199254740993n, 0x7fffffffffffffffn, -0x8000000000000000n]) {
    assertSameResult('convert_i64_f32_s', vm, native, bi);
    assertSameResult('convert_i64_f32_u', vm, native, bi);
  }
}

// 4. Multi-value returns, parameterized blocks, br_table, and tail calls (50,000 iterations)
{
  const { vm, native } = compileBoth(`(module
    (func $tail_sum (param $n i32) (param $acc i32) (result i32)
      local.get $n
      i32.eqz
      if
        local.get $acc
        return
      end
      local.get $n
      i32.const 1
      i32.sub
      local.get $acc
      local.get $n
      i32.add
      return_call $tail_sum
    )
    (func (export "tail_sum") (param i32) (result i32)
      local.get 0
      i32.const 0
      return_call $tail_sum
    )
    (func (export "multi_val") (param i32 i32) (result i32 i32)
      local.get 0
      local.get 1
      block (param i32 i32) (result i32 i32)
        local.get 1
        local.get 0
        br 0
      end
    )
    (func (export "switch_br") (param i32) (result i32)
      block $d
        block $c
          block $b
            block $a
              local.get 0
              br_table $a $b $c $d
            end
            i32.const 10
            return
          end
          i32.const 20
          return
        end
        i32.const 30
        return
      end
      i32.const 99
    )
  )`);

  // 20,000 tail calls would overflow maxCallDepth (1024) if not executed as true tail calls!
  assertSameResult('tail_sum', vm, native, 20000);
  assert.deepStrictEqual(vm.multi_val(11, 22), native.multi_val(11, 22));
  for (const k of [0, 1, 2, 3, 4, -1, 100]) {
    assertSameResult('switch_br', vm, native, k);
  }
}

console.log('  PASS: VM numeric & control flow tests');
