#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const WatAssembler = require('../wat-assembler.js');
const { WasmLinker, buildLoaderSource } = require('../wasm-linker.js');
const { WasmVM } = require('../wasm-vm.js');

const asm = new WatAssembler();
const linker = new WasmLinker({ strict: false });

console.log('Running comprehensive WASM Linker tests (GC, rec types, SIMD, EH/tags, start, mutual recursion, multi-imports, dynamic loader)...');

// 1. Multi-module Wasm GC + Recursive Types + Subtyping + Data/Elem array init
{
  const gcLibWat = `(module
    (rec
      (type $node (sub (struct (field $val i32) (field $next (ref null $node)))))
    )
    (type $byte_arr (array (mut i8)))
    (data $bytes "\\0a\\14\\1e\\28")

    (func (export "make_node") (param $v i32) (param $n (ref null $node)) (result (ref $node))
      local.get $v
      local.get $n
      struct.new $node
    )

    (func (export "sum_list") (param $head (ref null $node)) (result i32)
      (local $acc i32)
      block $done
        loop $loop
          local.get $head
          br_on_null $done
          drop
          local.get $acc
          local.get $head
          struct.get $node 0
          i32.add
          local.set $acc
          local.get $head
          struct.get $node 1
          local.set $head
          br $loop
        end
      end
      local.get $acc
    )

    (func (export "sum_data_array") (result i32)
      (local $arr (ref $byte_arr))
      i32.const 0
      i32.const 4
      array.new_data $byte_arr $bytes
      local.set $arr
      local.get $arr
      i32.const 0
      array.get_u $byte_arr
      local.get $arr
      i32.const 3
      array.get_u $byte_arr
      i32.add
    )
  )`;

  const gcAppWat = `(module
    (rec
      (type $node (sub (struct (field $val i32) (field $next (ref null $node)))))
    )
    (import "gc_lib" "make_node" (func $make_node (param i32) (param (ref null $node)) (result (ref $node))))
    (import "gc_lib" "sum_list" (func $sum_list (param (ref null $node)) (result i32)))
    (import "gc_lib" "sum_data_array" (func $sum_data_array (result i32)))

    (func (export "run_gc") (result i32)
      (local $n1 (ref $node))
      (local $n2 (ref $node))
      (local $any (ref null any))
      i32.const 10
      ref.null $node
      call $make_node
      local.set $n1
      i32.const 25
      local.get $n1
      call $make_node
      local.set $n2
      local.get $n2
      local.set $any
      ;; Test ref.test / ref.cast / br_on_cast + i31ref
      block $cast_ok (result (ref $node))
        local.get $any
        br_on_cast $cast_ok (ref null any) (ref $node)
        i32.const -1
        return
      end
      call $sum_list
      call $sum_data_array
      i32.add
      i32.const 7
      ref.i31
      i31.get_s
      i32.add
    )
  )`;

  const { wasm, instance } = linker.instantiateSync([
    { id: 'gc_app', bytes: new Uint8Array(asm.assemble(gcAppWat)) },
    { id: 'gc_lib', bytes: new Uint8Array(asm.assemble(gcLibWat)) },
  ], {}, { entry: 'gc_app' });

  assert.strictEqual(WasmVM.validate(wasm), true);
  assert.strictEqual(WebAssembly.validate(wasm), true);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  assert.strictEqual(instance.exports.run_gc(), 10 + 25 + (10 + 40) + 7);
  assert.strictEqual(natInst.exports.run_gc(), 92);
  console.log('  PASS: Multi-module Wasm GC + recursive types + data array static linking');
}

// 2. Multi-module 128-bit SIMD + Multi-memory static linking
{
  const simdLibWat = `(module
    (memory (export "mem") 1)
    (func (export "vec_dot_and_store") (param $addr i32) (result i32)
      local.get $addr
      v128.const i32x4 10 20 30 40
      v128.const i32x4 1 2 3 4
      i32x4.add
      v128.const i32x4 0 0 0 0
      i8x16.shuffle 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
      v128.store
      local.get $addr
      v128.load
      i32x4.extract_lane 0
      local.get $addr
      v128.load
      i32x4.extract_lane 3
      i32.add
    )
  )`;

  const simdAppWat = `(module
    (import "simd_lib" "mem" (memory 1))
    (import "simd_lib" "vec_dot_and_store" (func $vec_dot (param i32) (result i32)))
    (memory $local_mem 1)

    (func (export "run_simd") (result i32)
      (local $res i32)
      i32.const 64
      call $vec_dot
      local.set $res
      ;; Copy from imported memory 0 to local memory 1 and load lane
      i32.const 0
      local.get $res
      i32.store $local_mem
      i32.const 0
      v128.load32_zero $local_mem
      i32x4.extract_lane 0
    )
  )`;

  const { wasm, instance } = linker.instantiateSync([
    { id: 'simd_app', bytes: new Uint8Array(asm.assemble(simdAppWat)) },
    { id: 'simd_lib', bytes: new Uint8Array(asm.assemble(simdLibWat)) },
  ], {}, { entry: 'simd_app' });

  assert.strictEqual(WasmVM.validate(wasm), true);
  assert.strictEqual(WebAssembly.validate(wasm), true);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  assert.strictEqual(instance.exports.run_simd(), (10 + 1) + (40 + 4));
  assert.strictEqual(natInst.exports.run_simd(), 55);
  console.log('  PASS: Multi-module 128-bit SIMD + multi-memory static linking');
}

// 3. Multi-module Exception Handling (cross-module Tag import/export + try_table + throw)
{
  const ehLibWat = `(module
    (type $err_sig (func (param i32)))
    (tag $err (export "err") (type $err_sig))

    (func (export "fail_with") (param $code i32)
      local.get $code
      i32.const 100
      i32.add
      throw $err
    )
  )`;

  const ehAppWat = `(module
    (type $err_sig (func (param i32)))
    (import "eh_lib" "err" (tag $imported_err (type $err_sig)))
    (import "eh_lib" "fail_with" (func $fail_with (param i32)))

    (func (export "run_eh") (param $x i32) (result i32)
      block $caught (result i32)
        try_table (result i32) (catch $imported_err $caught)
          local.get $x
          call $fail_with
          i32.const 0
        end
        return
      end
      i32.const 1000
      i32.add
    )
  )`;

  const { wasm, instance } = linker.instantiateSync([
    { id: 'eh_app', bytes: new Uint8Array(asm.assemble(ehAppWat)) },
    { id: 'eh_lib', bytes: new Uint8Array(asm.assemble(ehLibWat)) },
  ], {}, { entry: 'eh_app' });

  assert.strictEqual(WasmVM.validate(wasm), true);
  assert.strictEqual(WebAssembly.validate(wasm), true);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  assert.strictEqual(instance.exports.run_eh(23), 1123);
  assert.strictEqual(natInst.exports.run_eh(23), 1123);
  console.log('  PASS: Multi-module Exception Handling (tag import/export + try_table + throw) static linking');
}

// 4. Multi-module Start sections (synthesized start trampoline in topological loadOrder) + cross-module global init
{
  const initLibWat = `(module
    (global $base (export "base") i32 (i32.const 50))
    (global $log (export "log") (mut i32) (i32.const 0))
    (func $init_lib
      i32.const 10
      global.set $log
    )
    (start $init_lib)
  )`;

  const initAppWat = `(module
    (import "init_lib" "base" (global $base i32))
    (import "init_lib" "log" (global $log (mut i32)))
    ;; Global initialized from imported global $base (even though init_app is passed first!)
    (global $derived i32 (global.get $base))

    (func $init_app
      global.get $log
      i32.const 3
      i32.mul
      global.get $derived
      i32.add
      global.set $log
    )
    (start $init_app)

    (func (export "get_log") (result i32)
      global.get $log
    )
  )`;

  const { wasm, instance } = linker.instantiateSync([
    { id: 'init_app', bytes: new Uint8Array(asm.assemble(initAppWat)) },
    { id: 'init_lib', bytes: new Uint8Array(asm.assemble(initLibWat)) },
  ], {}, { entry: 'init_app' });

  assert.strictEqual(WasmVM.validate(wasm), true);
  assert.strictEqual(WebAssembly.validate(wasm), true);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  // init_lib sets log=10, then init_app sets log = 10*3 + 50 = 80
  assert.strictEqual(instance.exports.get_log(), 80);
  assert.strictEqual(natInst.exports.get_log(), 80);
  console.log('  PASS: Multi-module Start section synthesis & dependency-ordered global initialization');
}

// 5. Mutual recursion across modules + tail calls + module-name disambiguation + exportAll
{
  const evenModWat = `(module
    (import "odd_mod" "is_odd" (func $is_odd (param i32) (result i32)))
    (func (export "is_even") (param $n i32) (result i32)
      local.get $n
      i32.eqz
      if (result i32)
        i32.const 1
      else
        local.get $n
        i32.const 1
        i32.sub
        return_call $is_odd
      end
    )
    (func (export "op") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.add
    )
  )`;

  const oddModWat = `(module
    (import "even_mod" "is_even" (func $is_even (param i32) (result i32)))
    (func (export "is_odd") (param $n i32) (result i32)
      local.get $n
      i32.eqz
      if (result i32)
        i32.const 0
      else
        local.get $n
        i32.const 1
        i32.sub
        return_call $is_even
      end
    )
    (func (export "op") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.mul
    )
  )`;

  const callerModWat = `(module
    (import "even_mod" "op" (func $add_op (param i32 i32) (result i32)))
    (import "odd_mod" "op" (func $mul_op (param i32 i32) (result i32)))
    (import "even_mod" "is_even" (func $is_even (param i32) (result i32)))

    (func (export "test_all") (result i32)
      i32.const 3
      i32.const 4
      call $add_op
      i32.const 5
      i32.const 6
      call $mul_op
      i32.add
      i32.const 1000
      call $is_even
      i32.add
    )
  )`;

  const { wasm, instance } = linker.instantiateSync([
    { id: 'caller_mod', bytes: new Uint8Array(asm.assemble(callerModWat)) },
    { id: 'even_mod', bytes: new Uint8Array(asm.assemble(evenModWat)) },
    { id: 'odd_mod', bytes: new Uint8Array(asm.assemble(oddModWat)) },
  ], {}, { entry: 'caller_mod', exportAll: true });

  assert.strictEqual(WasmVM.validate(wasm), true);
  assert.strictEqual(WebAssembly.validate(wasm), true);
  assert.strictEqual(instance.exports.test_all(), (3 + 4) + (5 * 6) + 1);
  // Because exportAll: true, is_even and is_odd are also exported!
  assert.strictEqual(instance.exports.is_even(250), 1);
  assert.strictEqual(instance.exports.is_odd(250), 0);
  console.log('  PASS: Mutual recursion with tail calls, module-name disambiguation & exportAll');
}

// 6. Multiple external imports (2 external functions, 2 external globals, 2 external memories)
{
  const multiExtWat = `(module
    (import "env" "g1" (global $g1 i32))
    (import "env" "g2" (global $g2 i32))
    (import "env" "f1" (func $f1 (param i32) (result i32)))
    (import "env" "f2" (func $f2 (param i32) (result i32)))
    (import "env" "m1" (memory $m1 1))
    (import "env" "m2" (memory $m2 1))

    (func (export "compute") (result i32)
      global.get $g1
      call $f1
      global.get $g2
      call $f2
      i32.add
      i32.const 0
      i32.load8_u $m1
      i32.add
      i32.const 0
      i32.load8_u $m2
      i32.add
    )
  )`;

  const m1 = new WasmVM.Memory({ initial: 1 });
  const m2 = new WasmVM.Memory({ initial: 1 });
  new Uint8Array(m1.buffer)[0] = 11;
  new Uint8Array(m2.buffer)[0] = 22;

  const { wasm, instance } = linker.instantiateSync(
    [{ id: 'multi_ext', bytes: new Uint8Array(asm.assemble(multiExtWat)) }],
    {
      env: {
        g1: 5,
        g2: 7,
        f1: x => x * 10,
        f2: x => x * 100,
        m1,
        m2,
      },
    }
  );

  assert.strictEqual(WasmVM.validate(wasm), true);
  assert.strictEqual(instance.exports.compute(), 50 + 700 + 11 + 22);
  console.log('  PASS: Multiple external imports (functions, globals, memories)');
}

// 7. Dynamic linker & generated JS loader execution (both with native WebAssembly and pure-JS WasmVM fallback)
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-dyn-link-'));
  try {
    const mathFile = path.join(tmpDir, 'math.wasm');
    const appFile = path.join(tmpDir, 'app.wasm');
    const loaderFile = path.join(tmpDir, 'loader.js');

    fs.writeFileSync(
      mathFile,
      asm.assemble(`(module
        (func (export "triple") (param i32) (result i32)
          local.get 0
          i32.const 3
          i32.mul
        )
      )`)
    );
    fs.writeFileSync(
      appFile,
      asm.assemble(`(module
        (import "math" "triple" (func $triple (param i32) (result i32)))
        (import "host" "bias" (func $bias (result i32)))
        (func (export "run") (param i32) (result i32)
          local.get 0
          call $triple
          call $bias
          i32.add
        )
      )`)
    );

    const linkResult = linker.link([appFile, mathFile]);
    const loaderCode = buildLoaderSource(linkResult, 'app');
    fs.writeFileSync(loaderFile, loaderCode, 'utf8');

    // Test dynamic instantiateSync via WasmVM
    const dynRes = linker.instantiateSync(
      [appFile, mathFile],
      { host: { bias: () => 9 } },
      { static: false, entry: 'app' }
    );
    assert.strictEqual(dynRes.instance.exports.run(11), 42);

    // Test generated loader in a child process with WebAssembly poisoned (falls back to WasmVM!)
    const out = execFileSync(
      process.execPath,
      [
        '-e',
        `
        globalThis.WebAssembly = undefined;
        const { loadLinkedModules } = require(${JSON.stringify(loaderFile)});
        loadLinkedModules({ host: { bias: () => 9 } }).then(res => {
          process.stdout.write(String(res.instance.exports.run(11)));
        });
        `,
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(out, '42');
    console.log('  PASS: Dynamic linker & generated JS loader (including WebAssembly-free fallback to WasmVM)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// 8. Legacy exceptions (try/catch/rethrow), multi-table call_indirect, typed select, type-indexed blocktypes & disassembler roundtrip
{
  const advLibWat = `(module
    (type $pair_sig (func (param i32) (result i32 i32)))
    (type $err_sig (func (param i32)))
    (type $fn_sig (func (param i32) (result i32)))
    (tag $legacy_err (export "legacy_err") (type $err_sig))
    (table $t_aux 2 funcref)
    (table $t_export (export "t_export") 2 funcref)

    (func $double (param i32) (result i32)
      local.get 0
      i32.const 2
      i32.mul
    )
    (elem (table $t_export) (i32.const 1) func $double)

    (func (export "split_and_throw") (param $x i32) (result i32)
      local.get $x
      block (type $pair_sig)
        dup:
        local.get $x
        i32.const 5
        i32.add
      end
      i32.add
      local.get $x
      i32.const 0
      i32.lt_s
      if
        local.get $x
        throw $legacy_err
      end
    )
  )`.replace('dup:', '');

  const advAppWat = `(module
    (type $ dummy (func))
    (type $err_sig (func (param i32)))
    (type $fn_sig (func (param i32) (result i32)))
    (type $box (struct (field i32)))
    (import "adv_lib" "legacy_err" (tag $err (type $err_sig)))
    (import "adv_lib" "t_export" (table $imp_table 2 funcref))
    (import "adv_lib" "split_and_throw" (func $split_and_throw (param i32) (result i32)))
    (table $local_pad 1 funcref)

    (func (export "run_adv") (param $x i32) (result i32)
      (local $b1 (ref null $box))
      (local $b2 (ref null $box))
      i32.const 10
      struct.new $box
      local.set $b1
      i32.const 20
      struct.new $box
      local.set $b2

      try (result i32)
        local.get $x
        call $split_and_throw
        i32.const 1
        call_indirect $imp_table (type $fn_sig)
      catch $err
        i32.const 900
        i32.add
      end

      local.get $b1
      local.get $b2
      i32.const 1
      select (result (ref null $box))
      struct.get $box 0
      i32.add
    )
  )`.replace('$ dummy', '$dummy');

  const { wasm, instance } = linker.instantiateSync([
    { id: 'adv_app', bytes: new Uint8Array(asm.assemble(advAppWat)) },
    { id: 'adv_lib', bytes: new Uint8Array(asm.assemble(advLibWat)) },
  ], {}, { entry: 'adv_app' });

  assert.strictEqual(WasmVM.validate(wasm), true);
  // x = 4 -> split_and_throw(4) = 4 + (4+5) = 13 -> double(13) = 26 -> + b1(10) = 36
  assert.strictEqual(instance.exports.run_adv(4), 36);
  // x = -3 -> throws -3 -> caught: -3 + 900 = 897 -> + b1(10) = 907
  assert.strictEqual(instance.exports.run_adv(-3), 907);

  // Verify full disassembler -> assembler roundtrip on the linked binary
  const { WasmDisassembler } = require('../wasm-disassembler.js');
  const linkedWat = new WasmDisassembler(wasm).disassemble();
  const reassembled = new Uint8Array(asm.assemble(linkedWat));
  assert.strictEqual(WasmVM.validate(reassembled), true);
  const { instance: reInst } = WasmVM.instantiateSync(reassembled);
  assert.strictEqual(reInst.exports.run_adv(4), 36);
  assert.strictEqual(reInst.exports.run_adv(-3), 907);
  console.log('  PASS: Legacy exceptions, multi-table call_indirect, typed select, blocktype remap & disassembler roundtrip');
}

console.log('\nALL COMPREHENSIVE LINKER TESTS PASSED.');
