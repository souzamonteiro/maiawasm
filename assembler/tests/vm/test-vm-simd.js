'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WatAssembler = require('../../wat-assembler.js');
const { WasmVM } = require('../../wasm-vm.js');

const asm = new WatAssembler();
const expectedDir = path.join(__dirname, '..', 'expected');

console.log('Running VM SIMD tests...');

function compareBoth(wat, fnName, ...args) {
  const bytes = new Uint8Array(asm.assemble(wat));
  const { instance: vmInst } = WasmVM.instantiateSync(bytes);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const vmRes = vmInst.exports[fnName](...args);
  const natRes = natInst.exports[fnName](...args);
  assert.deepStrictEqual(vmRes, natRes, `Mismatch on ${fnName}: vm=${vmRes} vs native=${natRes}`);
  return vmRes;
}

// 1. Fixture 08-simd.wasm execution
{
  const f08 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '08-simd.wasm')));
  const { instance: vm08 } = WasmVM.instantiateSync(f08);
  const v = vm08.exports.make_vec();
  assert(v instanceof Uint8Array && v.byteLength === 16);
  assert.strictEqual(vm08.exports.extract_lane(v), 1);
  const v2 = vm08.exports.replace_lane(v, 99);
  const vSum = vm08.exports.i32x4_add(v, v2);
  const view = new DataView(vSum.buffer, vSum.byteOffset, 16);
  assert.strictEqual(view.getInt32(0, true), 2);
  assert.strictEqual(view.getInt32(4, true), 4);
  assert.strictEqual(view.getInt32(8, true), 102);
  assert.strictEqual(view.getInt32(12, true), 8);
}

// 2. Comprehensive SIMD integer, bitwise, shuffle, swizzle, narrow, extend, extmul, dot, pairwise
{
  const wat = `(module
    (memory 1)
    (func (export "test_i8x16") (result i32)
      v128.const i8x16 -10 20 -30 40 120 120 -120 -120 1 2 3 4 5 6 7 8
      v128.const i8x16 5 -10 30 -40 20 30 -20 -30 1 1 1 1 1 1 1 1
      i8x16.add_sat_s
      i8x16.abs
      i8x16.popcnt
      i16x8.extadd_pairwise_i8x16_u
      i32x4.extadd_pairwise_i16x8_s
      i32x4.extract_lane 0
    )
    (func (export "test_dot_q15") (result i32)
      v128.const i16x8 100 -200 300 -400 16384 -16384 1000 2000
      v128.const i16x8 2 3 4 5 16384 16384 3 4
      i32x4.dot_i16x8_s
      i32x4.extract_lane 0
      v128.const i16x8 16384 -16384 32767 -32768 100 200 300 400
      v128.const i16x8 16384 16384 32767 -32768 100 200 300 400
      i16x8.q15mulr_sat_s
      i16x8.extract_lane_s 0
      i32.add
    )
    (func (export "test_bitmask_all_any") (result i32)
      v128.const i8x16 -1 1 -1 1 -1 1 -1 1 -1 1 -1 1 -1 1 -1 1
      i8x16.bitmask
      v128.const i32x4 1 2 3 4
      i32x4.all_true
      i32.add
      v128.const i64x2 0 -5
      v128.any_true
      i32.add
      v128.const i64x2 -1 1
      i64x2.bitmask
      i32.add
    )
    (func (export "test_swizzle_bitselect") (result i32)
      v128.const i8x16 10 20 30 40 50 60 70 80 90 100 110 120 1 2 3 4
      v128.const i8x16 3 2 1 0 99 0 0 0 0 0 0 0 0 0 0 0
      i8x16.swizzle
      v128.const i8x16 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9
      v128.const i8x16 -1 0 -1 0 -1 0 0 0 0 0 0 0 0 0 0 0
      v128.bitselect
      i32x4.extract_lane 0
    )
    (func (export "test_simd_mem") (result i64)
      i32.const 0
      v128.const i32x4 16909060 84281096 151653132 219025168
      v128.store

      i32.const 0
      v128.load8x8_s
      i32.const 0
      v128.load8x8_u
      i16x8.add
      i32.const 0
      v128.load32_splat
      i32x4.add
      i32.const 4
      v128.load64_zero
      i64x2.add
      i32.const 2
      v128.const i16x8 0 0 0 0 0 0 0 0
      v128.load16_lane 3
      i64x2.add
      i64x2.extract_lane 0
    )
    (func (export "test_simd_float_conv") (result i32)
      v128.const f32x4 1.5 -2.5 3.25 -4.75
      v128.const f32x4 0.5 -1.5 2.75 -0.25
      f32x4.add
      f32x4.nearest
      i32x4.trunc_sat_f32x4_s
      f32x4.convert_i32x4_s
      f64x2.promote_low_f32x4
      i32x4.trunc_sat_f64x2_s_zero
      i32x4.extract_lane 0
    )
  )`;

  compareBoth(wat, 'test_i8x16');
  compareBoth(wat, 'test_dot_q15');
  compareBoth(wat, 'test_bitmask_all_any');
  compareBoth(wat, 'test_swizzle_bitselect');
  compareBoth(wat, 'test_simd_mem');
  compareBoth(wat, 'test_simd_float_conv');
}

console.log('  PASS: VM SIMD tests');
