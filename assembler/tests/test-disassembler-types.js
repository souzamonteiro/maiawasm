'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WatAssembler = require('../wat-assembler.js');
const { WasmDisassembler, disassembleWASM } = require('../wasm-disassembler.js');
const { WasmLinker } = require('../wasm-linker.js');

const HEADER = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const asm = new WatAssembler();
function uleb(value) {
  const bytes = [];
  do {
    const byte = value & 0x7f;
    value >>>= 7;
    bytes.push(byte | (value ? 0x80 : 0));
  } while (value);
  return bytes;
}
const section = (id, bytes) => {
  return Buffer.from([id, ...uleb(bytes.length), ...bytes]);
};
const moduleBytes = (...sections) => Buffer.concat([HEADER, ...sections]);
const gcSupported = WebAssembly.validate(moduleBytes(section(1, [1, 0x5f, 0])));
if (!gcSupported) console.log('SKIP native GC type/execution oracles: engine lacks GC support');

function nativeValid(bytes, message) {
  if (gcSupported) assert.ok(WebAssembly.validate(bytes), message);
}

function parse(bytes) {
  const dis = new WasmDisassembler(bytes);
  const wat = dis.disassemble();
  return { dis, wat };
}

function shape(dis) {
  return {
    groups: dis.typeGroups.map(({ recursive, startIndex, size }) => ({ recursive, startIndex, size })),
    types: dis.typeSection.map(({ offset, endOffset, subtype, ...type }) => ({
      ...type, subtype: { isFinal: subtype.isFinal, supertypes: subtype.supertypes }
    }))
  };
}

const recursive = moduleBytes(section(1, [
  3,
  0x4e, 2,
  0x5f, 1, 0x63, 1, 0,
  0x5e, 0x63, 0, 1,
  0x50, 0, 0x60, 0, 0,
  0x4f, 1, 2, 0x60, 0, 0
]));
nativeValid(recursive, 'independent recursive/subtype fixture must validate');
const { dis, wat } = parse(recursive);
assert.deepStrictEqual(dis.typeGroups.map(g => [g.recursive, g.startIndex, g.size]), [
  [true, 0, 2], [false, 2, 1], [false, 3, 1]
]);
assert.strictEqual(dis.typeSection[0].fields[0].storage, '(ref null 1)');
assert.strictEqual(dis.typeSection[1].field.storage, '(ref null 0)');
assert.deepStrictEqual(dis.typeSection[3].subtype, { explicit: true, isFinal: true, supertypes: [2] });
assert.ok(wat.includes('(rec (type (struct'));
assert.ok(wat.includes('(sub final 2 (func))'));
const rebuilt = asm.assemble(wat);
nativeValid(rebuilt, wat);
assert.deepStrictEqual(shape(parse(rebuilt).dis), shape(dis));
for (const type of dis.typeSection) {
  assert.ok(type.offset >= 11 && type.endOffset > type.offset && type.endOffset <= recursive.length);
}
assert.strictEqual(dis.disassemble(), wat);
assert.strictEqual(dis.typeGroups.length, 3);
console.log('PASS recursive_groups_flattened_indices_subtypes_and_standard_wat');

for (const code of [0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f,
  0x6e, 0x6d, 0x6c, 0x6b, 0x6a, 0x71, 0x72, 0x73, 0x69, 0x74]) {
  const source = moduleBytes(section(1, [1, 0x60, 1, code, 0]));
  const first = parse(source);
  const second = parse(asm.assemble(first.wat));
  assert.deepStrictEqual(shape(second.dis), shape(first.dis));
  if (code !== 0x7f) assert.notStrictEqual(first.dis.typeSection[0].params[0], 'i32', `no fallback for type ${code}`);
}
console.log('PASS_all_numeric_and_abstract_reference_value_types');

for (const storage of [[0x78], [0x77], [0x7f], [0x63, 0x6d], [0x64, 0x6a]]) {
  for (const mut of [0, 1]) {
    const source = moduleBytes(section(1, [2, 0x5f, 1, ...storage, mut, 0x5e, ...storage, mut]));
    const first = parse(source);
    const rebuilt = asm.assemble(first.wat);
    nativeValid(source);
    nativeValid(rebuilt, first.wat);
    assert.deepStrictEqual(shape(parse(rebuilt).dis), shape(first.dis));
  }
}
console.log('PASS_packed_and_reference_fields_and_standard_mutability_syntax');

const typed = moduleBytes(
  section(1, [2, 0x5f, 0, 0x60, 1, 0x63, 0, 1, 0x63, 0]),
  section(3, [1, 1]),
  section(4, [1, 0x63, 0, 0, 1]),
  section(6, [1, 0x63, 0, 1, 0xd0, 0, 0x0b]),
  section(7, [1, 1, 0x66, 0, 0]),
  section(10, [1, 19, 1, 1, 0x63, 0,
    0x02, 0x63, 0, 0x20, 0, 0x0b,
    0xd0, 0, 0x41, 1, 0x1c, 1, 0x63, 0, 0x0b])
);
nativeValid(typed, 'independent full reference-surface fixture must validate');
const typedWat = disassembleWASM(typed);
assert.ok(typedWat.includes('(local (ref null 0))'));
assert.ok(typedWat.includes('block (result (ref null 0))'));
assert.ok(typedWat.includes('select (result (ref null 0))'));
const typedRebuilt = asm.assemble(typedWat);
nativeValid(typedRebuilt, typedWat);
if (gcSupported) {
  assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(typed)).exports.f(null), null);
  assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(typedRebuilt)).exports.f(null), null);
}
assert.strictEqual(disassembleWASM(typedRebuilt), typedWat);
console.log('PASS_reference_types_in_signatures_tables_globals_locals_blocks_and_select');

const imports = moduleBytes(
  section(1, [1, 0x5f, 0]),
  section(2, [2, 1, 0x6d, 1, 0x74, 1, 0x63, 0, 0, 1,
    1, 0x6d, 1, 0x67, 3, 0x63, 0, 0])
);
nativeValid(imports);
nativeValid(asm.assemble(disassembleWASM(imports)));
const named = asm.assemble(`(module
  (rec (type $a (struct (field (mut (ref null $b)))))
       (type $b (array (ref null $a))))
  (type $base (sub (func)))
  (type $child (sub final $base (func))))`);
nativeValid(named, 'forward names in standard rec groups must resolve');
assert.deepStrictEqual(shape(parse(named).dis), shape(parse(asm.assemble(disassembleWASM(named))).dis));
const abstractImports = asm.assemble(`(module
  (import "m" "t" (table 1 (ref null func)))
  (import "m" "g" (global (ref null func))))`);
nativeValid(abstractImports);
assert.deepStrictEqual(parse(abstractImports).dis.importSection.map(i => i.kind), [1, 3]);
nativeValid(asm.assemble(disassembleWASM(abstractImports)));
const legacyGroup = asm.assemble(`(module
  (type $old (rec (func) (func)))
  (type $last (struct))
  (type (func (param (ref null $last)))))`);
nativeValid(legacyGroup);
assert.deepStrictEqual(parse(legacyGroup).dis.typeSection[3].params, ['(ref null 2)']);
console.log('PASS_import_reference_types_and_forward_named_recursive_types');

const manyTypes = moduleBytes(section(1, [
  66, ...Array.from({ length: 65 }, () => [0x5f, 0]).flat(),
  0x60, 1, 0x63, 0xc0, 0, 0
]));
nativeValid(manyTypes);
const manyRebuilt = asm.assemble(disassembleWASM(manyTypes));
nativeValid(manyRebuilt);
assert.deepStrictEqual(parse(manyRebuilt).dis.typeSection[65].params, ['(ref null 64)']);
console.log('PASS_s33_heap_indices_inside_value_types');

for (const payload of [
  [1, 0x40], [1, 0x4e, 1, 0x4e, 0],
  [1, 0x60, 1, 0x78, 0], [1, 0x60, 0, 1, 0x68],
  [1, 0x5f, 1, 0x7f, 2], [1, 0x5e, 0x78, 255],
  [1, 0x5e, 0x63], [1, 0x4e, 0xff, 0xff, 0xff, 0xff, 0x0f]
]) {
  assert.throws(() => disassembleWASM(moduleBytes(section(1, payload))), /Invalid|bounds|Truncated/i);
}
assert.throws(() => disassembleWASM(moduleBytes(section(6, [1, 0x7f, 2, 0x41, 0, 0x0b]))), /Invalid mutability/);
assert.throws(() => asm.assemble('(module (type (func (param (ref null $missing)))))'), /Unknown heap type/);
assert.throws(() => asm.assemble('(module (type (sub $missing (func))))'), /Unknown supertype/);
const emptyRec = moduleBytes(section(1, [1, 0x4e, 0]));
assert.strictEqual(parse(emptyRec).dis.typeGroups[0].size, 0);
assert.ok(disassembleWASM(emptyRec).includes('(rec)'));
assert.deepStrictEqual(shape(parse(asm.assemble(disassembleWASM(emptyRec))).dis), shape(parse(emptyRec).dis));
console.log('PASS_invalid_types_mutability_and_truncated_recursive_groups');

const native = globalThis.WebAssembly;
try {
  globalThis.WebAssembly = undefined;
  assert.deepStrictEqual(shape(parse(asm.assemble(disassembleWASM(recursive))).dis), shape(dis));
} finally {
  globalThis.WebAssembly = native;
}
console.log('PASS_type_decoding_and_encoding_without_native_webassembly');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-type-link-'));
const file = path.join(tempDir, 'types.wasm');
try {
  for (const source of [recursive, typed, named,
    asm.assemble('(module (func (local (ref null func))))'),
    asm.assemble('(module (type (func (param (ref null func)))))')]) {
    fs.writeFileSync(file, source);
    assert.throws(() => new WasmLinker().linkStatic([file]), /Static mode does not support recursive/);
  }
} finally {
  if (fs.existsSync(file)) fs.unlinkSync(file);
  fs.rmdirSync(tempDir);
}
console.log('PASS_static_linker_rejects_unsupported_type_graphs_without_flattening');
console.log('\nAll recursive/reference type regressions passed.');
