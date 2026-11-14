'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WatAssembler = require('../../wat-assembler.js');
const {
  WasmVM,
  WasmModule,
  WasmInstance,
  WasmMemory,
  WasmTable,
  WasmGlobal,
  Trap,
  LinkError,
  HostError
} = require('../../wasm-vm.js');

const asm = new WatAssembler();
const expectedDir = path.join(__dirname, '..', 'expected');

console.log('Running VM memory, tables, globals & host integration tests...');

// 1. Fixture 04: Memory operations
{
  const f04 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '04-memory.wasm')));
  const { instance: vm04 } = WasmVM.instantiateSync(f04);
  const nat04 = new WebAssembly.Instance(new WebAssembly.Module(f04));

  assert.strictEqual(vm04.exports.size(), nat04.exports.size());
  vm04.exports.store(16, 0x12345678);
  nat04.exports.store(16, 0x12345678);
  assert.strictEqual(vm04.exports.load(16), nat04.exports.load(16));
  assert.strictEqual(vm04.exports.load8_u(16), nat04.exports.load8_u(16));

  vm04.exports.fill(64, 0xab, 16);
  nat04.exports.fill(64, 0xab, 16);
  vm04.exports.copy(72, 64, 16);
  nat04.exports.copy(72, 64, 16);
  assert.strictEqual(vm04.exports.load(76), nat04.exports.load(76));

  assert.strictEqual(vm04.exports.grow(2), nat04.exports.grow(2));
  assert.strictEqual(vm04.exports.size(), nat04.exports.size());
}

// 2. Fixture 05: Table operations
{
  const f05 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '05-table.wasm')));
  const { instance: vm05 } = WasmVM.instantiateSync(f05);
  const nat05 = new WebAssembly.Instance(new WebAssembly.Module(f05));

  assert.strictEqual(vm05.exports.call_indirect(0, 15, 5), nat05.exports.call_indirect(0, 15, 5));
  assert.strictEqual(vm05.exports.call_indirect(1, 15, 5), nat05.exports.call_indirect(1, 15, 5));
  assert.strictEqual(vm05.exports.call_indirect(2, 15, 5), nat05.exports.call_indirect(2, 15, 5));
  assert.strictEqual(vm05.exports.table_size(), nat05.exports.table_size());

  const fn0 = vm05.exports.table_get(0);
  vm05.exports.table_set(4, fn0);
  assert.strictEqual(vm05.exports.call_indirect(4, 20, 22), 42);
  assert.strictEqual(vm05.exports.table_grow(3, null), 10);
  assert.strictEqual(vm05.exports.table_size(), 13);
}

// 3. Fixture 06: Globals & imports
{
  const f06 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '06-globals.wasm')));
  const imports = { env: { imported_global: 77 } };
  const { instance: vm06 } = WasmVM.instantiateSync(f06, imports);
  const nat06 = new WebAssembly.Instance(new WebAssembly.Module(f06), imports);

  assert.strictEqual(vm06.exports.get_pi(), nat06.exports.get_pi());
  assert.strictEqual(vm06.exports.get_imported(), nat06.exports.get_imported());
  assert.strictEqual(vm06.exports.get_counter(), 0);
  vm06.exports.set_counter(10);
  vm06.exports.increment_counter();
  assert.strictEqual(vm06.exports.get_counter(), 11);
  assert.strictEqual(vm06.exports.counter.value, 11);
}

// 4. Fixture 09: Complex module with host logging, memory string reading, and indirect calls
{
  const f09 = new Uint8Array(fs.readFileSync(path.join(expectedDir, '09-complex.wasm')));
  const vmLogs = [];
  const natLogs = [];
  const { instance: vm09 } = WasmVM.instantiateSync(f09, { console: { log: x => vmLogs.push(x) } });
  const nat09 = new WebAssembly.Instance(new WebAssembly.Module(f09), { console: { log: x => natLogs.push(x) } });

  assert.strictEqual(vm09.exports.call_with_debug(0, 7, 8), nat09.exports.call_with_debug(0, 7, 8));
  vm09.exports.toggle_debug();
  nat09.exports.toggle_debug();
  assert.strictEqual(vm09.exports.call_with_debug(2, 6, 7), nat09.exports.call_with_debug(2, 6, 7));
  vm09.exports.print_hello();
  nat09.exports.print_hello();
  assert.deepStrictEqual(vmLogs, natLogs);
  assert.strictEqual(String.fromCharCode(...vmLogs.slice(1)), 'Hello, World!');
}

// 5. Multi-memory, passive data/elem init + drop, and 32-bit address+offset overflow trap
{
  const wat = `(module
    (memory $m0 1)
    (memory $m1 1)
    (data $d "ABCDEF")
    (func (export "init_m1")
      i32.const 10
      i32.const 0
      i32.const 6
      memory.init $m1 $d
      data.drop $d
    )
    (func (export "read_m1") (param i32) (result i32)
      local.get 0
      i32.load8_u $m1
    )
    (func (export "copy_m1_to_m0")
      i32.const 0
      i32.const 10
      i32.const 6
      memory.copy $m0 $m1
    )
    (func (export "read_m0") (param i32) (result i32)
      local.get 0
      i32.load8_u $m0 offset=100
    )
  )`;
  const bytes = new Uint8Array(asm.assemble(wat));
  const { instance } = WasmVM.instantiateSync(bytes);
  instance.exports.init_m1();
  assert.strictEqual(instance.exports.read_m1(10), 65); // 'A'
  assert.strictEqual(instance.exports.read_m1(15), 70); // 'F'
  instance.exports.copy_m1_to_m0();

  // After data.drop, non-zero init traps
  assert.throws(() => instance.exports.init_m1(), Trap);

  // Effective address 0xffffffec + 100 must NOT wrap around 2^32; it must trap!
  assert.throws(() => instance.exports.read_m0(0xffffffec | 0), Trap);
}

// 6. Start section, cross-instance linking, WasmModule static introspection, and HostError propagation
{
  const modA = new WasmModule(new Uint8Array(asm.assemble(`(module
    (memory (export "mem") 1 2)
    (global $g (export "g") (mut i32) (i32.const 10))
    (func $init
      global.get $g
      i32.const 5
      i32.add
      global.set $g
    )
    (start $init)
    (func (export "scale") (param i32) (result i32)
      local.get 0
      global.get $g
      i32.mul
    )
  )`)));

  assert.deepStrictEqual(WasmModule.exports(modA), [
    { name: 'mem', kind: 'memory' },
    { name: 'g', kind: 'global' },
    { name: 'scale', kind: 'function' }
  ]);

  const instA = new WasmInstance(modA);
  // Start function ran during instantiation: g = 10 + 5 = 15
  assert.strictEqual(instA.exports.g.value, 15);
  assert.strictEqual(instA.exports.scale(4), 60);

  const modB = new WasmModule(new Uint8Array(asm.assemble(`(module
    (import "a" "mem" (memory 1 2))
    (import "a" "g" (global $g (mut i32)))
    (import "a" "scale" (func $scale (param i32) (result i32)))
    (import "host" "boom" (func $boom))
    (func (export "use_a") (param i32) (result i32)
      local.get 0
      call $scale
    )
    (func (export "try_catch_host") (result i32)
      try (result i32)
        call $boom
        i32.const 1
      catch_all
        i32.const 2
      end
    )
  )`)));

  const instB = new WasmInstance(modB, {
    a: instA.exports,
    host: {
      boom() {
        throw new Error('host failure');
      }
    }
  });

  assert.strictEqual(instB.exports.use_a(3), 45);
  // Host errors must NOT be caught by guest catch_all
  assert.throws(() => instB.exports.try_catch_host(), HostError);
  assert.throws(() => new WasmInstance(modB, {}), LinkError);
}

console.log('  PASS: VM memory, tables, globals & host integration tests');
