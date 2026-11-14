'use strict';

const assert = require('assert');
const WatAssembler = require('../../wat-assembler.js');
const { WasmVM, Trap } = require('../../wasm-vm.js');

const asm = new WatAssembler();

console.log('Running VM GC, reference types & subtyping tests...');

function compileBoth(wat) {
  const bytes = new Uint8Array(asm.assemble(wat));
  const { instance: vmInst } = WasmVM.instantiateSync(bytes);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  return { vm: vmInst.exports, native: natInst.exports };
}

// 1. i31ref: ref.i31, i31.get_s, i31.get_u, ref.eq, null trap
{
  const { vm, native } = compileBoth(`(module
    (func (export "i31_s") (param i32) (result i32)
      local.get 0
      ref.i31
      i31.get_s
    )
    (func (export "i31_u") (param i32) (result i32)
      local.get 0
      ref.i31
      i31.get_u
    )
    (func (export "i31_eq") (param i32 i32) (result i32)
      local.get 0 ref.i31
      local.get 1 ref.i31
      ref.eq
    )
    (func (export "i31_null_trap") (result i32)
      ref.null i31
      i31.get_s
    )
  )`);

  for (const x of [0, 1, -1, 0x3fffffff, 0x40000000, -100]) {
    assert.strictEqual(vm.i31_s(x), native.i31_s(x));
    assert.strictEqual(vm.i31_u(x), native.i31_u(x));
  }
  assert.strictEqual(vm.i31_eq(42, 42), native.i31_eq(42, 42));
  assert.strictEqual(vm.i31_eq(42, 43), native.i31_eq(42, 43));
  assert.throws(() => vm.i31_null_trap(), Trap);
}

// 2. Structs: struct.new, struct.new_default, struct.get[_s/_u], struct.set, subtyping, ref.test, ref.cast, br_on_cast
{
  const { vm, native } = compileBoth(`(module
    (rec
      (type $base (sub (struct (field $x (mut i32)) (field $b (mut i8)))))
      (type $derived (sub final (type $base) (struct (field $x (mut i32)) (field $b (mut i8)) (field $y i64))))
    )
    (func (export "test_struct") (param i32 i32 i64) (result i32)
      (local $s (ref $derived))
      (local $b (ref null $base))
      local.get 0
      local.get 1
      local.get 2
      struct.new $derived
      local.tee $s
      local.set $b

      local.get $b
      i32.const 100
      struct.set $base 0

      local.get $b
      struct.get $base 0
      local.get $b
      struct.get_s $base 1
      i32.add
      local.get $b
      struct.get_u $base 1
      i32.add
      local.get $s
      struct.get $derived 2
      i32.wrap_i64
      i32.add
    )
    (func (export "test_cast") (param i32) (result i32)
      (local $any (ref null any))
      local.get 0
      if
        i32.const 10
        i32.const -5
        i64.const 99
        struct.new $derived
        local.set $any
      else
        struct.new_default $base
        local.set $any
      end
      local.get $any
      ref.test (ref $derived)
      if (result i32)
        local.get $any
        ref.cast (ref $derived)
        struct.get $derived 0
      else
        i32.const -1
      end
    )
    (func (export "test_br_on_cast") (param i32) (result i32)
      block $is_derived (result (ref $derived))
        local.get 0
        if (result (ref $base))
          i32.const 77
          i32.const 1
          i64.const 2
          struct.new $derived
        else
          i32.const 33
          i32.const 0
          struct.new $base
        end
        br_on_cast $is_derived (ref $base) (ref $derived)
        struct.get $base 0
        return
      end
      struct.get $derived 0
    )
  )`);

  assert.strictEqual(vm.test_struct(10, -2, 50n), native.test_struct(10, -2, 50n));
  assert.strictEqual(vm.test_cast(1), native.test_cast(1));
  assert.strictEqual(vm.test_cast(0), native.test_cast(0));
  assert.strictEqual(vm.test_br_on_cast(1), native.test_br_on_cast(1));
  assert.strictEqual(vm.test_br_on_cast(0), native.test_br_on_cast(0));
}

// 3. Arrays: new, new_default, new_fixed, new_data, init_data, new_elem, init_elem, fill, copy, len, get/set
{
  const { vm, native } = compileBoth(`(module
    (type $byte_arr (array (mut i8)))
    (type $int_arr (array (mut i32)))
    (type $i31_arr (array (mut (ref null i31))))
    (data $d "\\0a\\14\\1e\\28\\ff")
    (elem $e (ref null i31)
      (item (i32.const 11) (ref.i31))
      (item (i32.const 22) (ref.i31))
      (item (i32.const 33) (ref.i31))
    )

    (func (export "test_byte_arr") (result i32)
      (local $a (ref $byte_arr))
      (local $b (ref $byte_arr))
      i32.const 0
      i32.const 5
      array.new_data $byte_arr $d
      local.set $a

      i32.const 5
      array.new_default $byte_arr
      local.set $b

      local.get $b
      i32.const 0
      local.get $a
      i32.const 0
      i32.const 5
      array.copy $byte_arr $byte_arr

      local.get $b
      i32.const 1
      i32.const 3
      i32.const 2
      array.fill $byte_arr

      local.get $b
      i32.const 0
      array.get_u $byte_arr
      local.get $b
      i32.const 1
      array.get_u $byte_arr
      i32.add
      local.get $b
      i32.const 4
      array.get_s $byte_arr
      i32.add
      local.get $b
      array.len
      i32.add
    )
    (func (export "test_int_arr") (result i32)
      (local $arr (ref $int_arr))
      (local $earr (ref $i31_arr))
      i32.const 100
      i32.const 200
      i32.const 300
      array.new_fixed $int_arr 3
      local.set $arr

      i32.const 0
      i32.const 3
      array.new_elem $i31_arr $e
      local.set $earr

      local.get $earr
      i32.const 0
      i32.const 1
      i32.const 2
      array.init_elem $i31_arr $e

      local.get $arr
      i32.const 0
      array.get $int_arr
      local.get $earr
      i32.const 0
      array.get $i31_arr
      i31.get_s
      i32.add
      local.get $earr
      i32.const 1
      array.get $i31_arr
      i31.get_s
      i32.add
    )
  )`);

  assert.strictEqual(vm.test_byte_arr(), native.test_byte_arr());
  assert.strictEqual(vm.test_int_arr(), native.test_int_arr());
}

// 4. call_ref, return_call_ref, br_on_null, br_on_non_null, any.convert_extern, extern.convert_any
{
  const { vm, native } = compileBoth(`(module
    (type $bin (func (param i32 i32) (result i32)))
    (elem declare func $mul)
    (func $mul (type $bin) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.mul
    )
    (func (export "apply_ref") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      ref.func $mul
      call_ref $bin
    )
    (func (export "tail_apply_ref") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      ref.func $mul
      return_call_ref $bin
    )
    (func (export "null_checks") (param i32) (result i32)
      block $non_null (result (ref $bin))
        block $is_null
          local.get 0
          if (result (ref null $bin))
            ref.func $mul
          else
            ref.null $bin
          end
          br_on_null $is_null
          br_on_non_null $non_null
          i32.const -1
          return
        end
        i32.const 0
        return
      end
      drop
      i32.const 1
    )
    (func (export "roundtrip_extern") (param externref) (result externref)
      local.get 0
      any.convert_extern
      extern.convert_any
    )
  )`);

  assert.strictEqual(vm.apply_ref(6, 7), native.apply_ref(6, 7));
  assert.strictEqual(vm.tail_apply_ref(8, 9), native.tail_apply_ref(8, 9));
  assert.strictEqual(vm.null_checks(0), native.null_checks(0));
  assert.strictEqual(vm.null_checks(1), native.null_checks(1));

  const hostObj = { hello: 'world' };
  assert.strictEqual(vm.roundtrip_extern(hostObj), hostObj);
  assert.strictEqual(vm.roundtrip_extern(null), null);
}

console.log('  PASS: VM GC, reference types & subtyping tests');
