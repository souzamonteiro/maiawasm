'use strict';

const assert = require('assert');
const WatAssembler = require('../../wat-assembler.js');
const { WasmVM, GuestException, Trap, ValidationError } = require('../../wasm-vm.js');

const asm = new WatAssembler();

console.log('Running VM exception handling tests (modern try_table & legacy try/catch/rethrow)...');

// 1. Modern try_table: catch, catch_ref, catch_all, catch_all_ref, throw, throw_ref, cross-function unwind
{
  const wat = `(module
    (type $t_i32 (func (param i32)))
    (type $t_pair (func (param i32 i64)))
    (tag $e1 (export "e1") (type $t_i32))
    (tag $e2 (export "e2") (type $t_pair))

    (func $thrower (param $which i32)
      local.get $which
      i32.const 1
      i32.eq
      if
        i32.const 42
        throw $e1
      end
      local.get $which
      i32.const 2
      i32.eq
      if
        i32.const 7
        i64.const 100
        throw $e2
      end
    )

    (func (export "test_catch") (param i32) (result i32)
      block $on_all
        block $on_e2 (result i32 i64)
          block $on_e1 (result i32)
            try_table (result i32) (catch $e1 $on_e1) (catch $e2 $on_e2) (catch_all $on_all)
              local.get 0
              call $thrower
              i32.const 999
            end
            return
          end
          i32.const 1000
          i32.add
          return
        end
        i32.wrap_i64
        i32.add
        i32.const 2000
        i32.add
        return
      end
      i32.const -1
    )

    (func (export "test_catch_ref_rethrow") (param i32) (result i32)
      block $outer_all
        block $outer_e1 (result i32)
          try_table (result i32) (catch $e1 $outer_e1) (catch_all $outer_all)
            block $inner_all_ref (result (ref exn))
              block $inner_ref (result i32 (ref exn))
                try_table (result i32) (catch_ref $e1 $inner_ref) (catch_all_ref $inner_all_ref)
                  local.get 0
                  call $thrower
                  i32.const 10
                end
                return
              end
              ;; On stack: [i32, (ref exn)] -> rethrow via throw_ref!
              throw_ref
            end
            ;; On stack: [(ref exn)] -> rethrow via throw_ref!
            throw_ref
          end
          return
        end
        i32.const 500
        i32.add
        return
      end
      i32.const -77
    )

    (func (export "test_null_throw_ref")
      ref.null exn
      throw_ref
    )

    (func (export "uncaught")
      i32.const 123
      throw $e1
    )
  )`;

  const bytes = new Uint8Array(asm.assemble(wat));
  const { instance: vmInst } = WasmVM.instantiateSync(bytes);
  const natInst = new WebAssembly.Instance(new WebAssembly.Module(bytes));

  for (const which of [0, 1, 2]) {
    assert.strictEqual(vmInst.exports.test_catch(which), natInst.exports.test_catch(which));
    assert.strictEqual(vmInst.exports.test_catch_ref_rethrow(which), natInst.exports.test_catch_ref_rethrow(which));
  }

  assert.throws(() => vmInst.exports.test_null_throw_ref(), Trap);
  assert.throws(
    () => vmInst.exports.uncaught(),
    err => err instanceof GuestException && err.tag === vmInst.exports.e1 && err.values[0] === 123
  );
}

// 2. Legacy try / catch / catch_all / rethrow & legacyExceptions option gate
{
  const wat = `(module
    (type $t_i32 (func (param i32)))
    (type $t_empty (func))
    (tag $e1 (type $t_i32))
    (tag $e2 (type $t_empty))

    (func (export "legacy_eh") (param i32) (result i32)
      try (result i32)
        try (result i32)
          local.get 0
          i32.const 1
          i32.eq
          if
            i32.const 55
            throw $e1
          end
          local.get 0
          i32.const 2
          i32.eq
          if
            throw $e2
          end
          i32.const 10
        catch $e1
          i32.const 100
          i32.add
        catch_all
          rethrow 0
        end
      catch $e2
        i32.const 777
      end
    )
  )`;

  const bytes = new Uint8Array(asm.assemble(wat));
  const { instance } = WasmVM.instantiateSync(bytes);
  assert.strictEqual(instance.exports.legacy_eh(0), 10);
  assert.strictEqual(instance.exports.legacy_eh(1), 155);
  assert.strictEqual(instance.exports.legacy_eh(2), 777);

  // When legacyExceptions is disabled, validation rejects legacy try/catch/rethrow
  assert.strictEqual(WasmVM.validate(bytes, { legacyExceptions: false }), false);
  assert.throws(() => WasmVM.compileSync(bytes, { legacyExceptions: false }), ValidationError);
}

console.log('  PASS: VM exception handling tests');
