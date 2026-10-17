'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ModuleDecoder, decodeModule } = require('../wasm-module.js');
const { WasmDisassembler, disassembleWASM, __test } = require('../wasm-disassembler.js');
const WatAssembler = require('../wat-assembler.js');

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
const vector = bytes => [...uleb(bytes.length), ...bytes];
const name = text => vector(Buffer.from(text));
const section = (id, bytes) => Buffer.from([id, ...vector(bytes)]);
const binary = (...sections) => Buffer.concat([HEADER, ...sections]);
const record = (kind, field, desc) => [...name('host'), ...name(field), kind, ...desc];
const moduleName = '\ufeffmodule\ud83d\ude00';
const names = section(0, [
  ...name('name'),
  0, ...vector(name(moduleName)),
  1, ...vector([1, 1, ...name('answer')]),
  2, ...vector([1, 1, 1, 0, ...name('tmp')]),
  77, ...vector([255, 11])
]);
const custom = section(0, [...name('opaque'), 0xff, 0x80, 11]);
const body = [0, 0x41, 42, 11];
const allSections = binary(
  names,
  section(1, [2, 0x60, 0, 0, 0x60, 0, 1, 0x7f]),
  section(2, [5, ...record(0, 'f', [0]), ...record(1, 't', [0x70, 0, 1]),
    ...record(2, 'm', [0, 1]), ...record(3, 'g', [0x7f, 0]), ...record(4, 'e', [0, 0])]),
  section(3, [1, 1]),
  section(4, [1, 0x70, 0, 1]),
  section(5, [1, 0, 1]),
  section(13, [1, 0, 0]),
  section(6, [1, 0x7f, 0, 0x41, 11, 11]),
  section(7, [5, ...name('answer'), 0, 1, ...name('memory'), 2, 1,
    ...name('table'), 1, 1, ...name('global'), 3, 1, ...name('tag'), 4, 1]),
  section(8, [0]),
  section(9, [1, 2, 1, 0x41, 0, 11, 0, 1, 1]),
  section(12, [1]),
  section(10, [1, ...vector(body)]),
  section(11, [1, 2, 1, 0x41, 11, 11, ...vector([0, 255])]),
  custom
);

const decoded = decodeModule(allSections);
assert.strictEqual(decoded.binaryVersion, 1);
assert.ok(decoded.bytes instanceof Uint8Array);
assert.ok(!Buffer.isBuffer(decoded.bytes), 'default copied input is a plain Uint8Array');
assert.deepStrictEqual(decoded.sections.map(s => s.id), [0, 1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11, 0]);
let previousEnd = 8;
for (const entry of decoded.sections) {
  assert.strictEqual(entry.offset, previousEnd);
  assert.strictEqual(allSections[entry.offset], entry.id);
  assert.ok(entry.payloadOffset > entry.offset && entry.payloadOffset <= entry.endOffset);
  previousEnd = entry.endOffset;
}
assert.strictEqual(previousEnd, allSections.length);
assert.deepStrictEqual(decoded.typeSection[1].params, []);
assert.deepStrictEqual(decoded.typeSection[1].results, [0x7f]);
assert.deepStrictEqual(decoded.importSection.map(i => i.kind), [0, 1, 2, 3, 4]);
assert.strictEqual(decoded.importSection[4].attribute, 0);
assert.deepStrictEqual(decoded.tagSection, [{ attribute: 0, typeIdx: 0 }]);
assert.strictEqual(decoded.startSection, 0);
assert.strictEqual(decoded.dataCountSection, 1);
assert.strictEqual(decoded.nameSection.moduleName, moduleName);
assert.strictEqual(decoded.nameSection.functionNames.get(1), 'answer');
assert.strictEqual(decoded.nameSection.localNames.get(1).get(0), 'tmp');
assert.deepStrictEqual([...decoded.customSections[1].payload], [255, 128, 11]);
assert.strictEqual(decoded.globalSection[0].initializer, decoded.expressions[0]);
assert.strictEqual(decoded.elementSection[0].offsetExpression, decoded.expressions[1]);
assert.strictEqual(decoded.dataSection[0].offsetExpression, decoded.expressions[2]);
assert.strictEqual(decoded.globalSection[0].initializer.instructions[0].immediates.value, 11);
assert.strictEqual(decoded.elementSection[0].tableIndex, 1);
assert.strictEqual(decoded.dataSection[0].memoryIndex, 1);
assert.deepStrictEqual([...decoded.dataSection[0].bytes], [0, 255]);
const fn = decoded.codeSection[0];
assert.strictEqual(decoded.bytes[fn.offset], body.length);
assert.strictEqual(decoded.bytes[fn.payloadOffset], 0);
assert.strictEqual(decoded.bytes[fn.codeOffset], 0x41);
assert.strictEqual(fn.endOffset, fn.instructions[1].endOffset);
assert.deepStrictEqual(fn.instructions.map(i => i.name), ['i32.const', 'end']);
assert.ok(!('output' in decoded) && !('reader' in decoded) && !('offset' in decoded));
console.log('PASS_all_standard_sections_metadata_linked_expressions_ranges_and_structured_module');

const typedBody = [1, 1, 0x63, 1, 0x20, 0, 11];
const typed = binary(
  section(1, [2, 0x4e, 2, 0x5f, 1, 0x63, 1, 0, 0x5e, 0x63, 0, 1,
    0x60, 1, 0x63, 0, 1, 0x63, 0]),
  section(3, [1, 2]),
  section(4, [1, 0x63, 0, 0, 1]),
  section(6, [1, 0x63, 0, 0, 0xd0, 0, 11]),
  section(9, [1, 5, 0x63, 0, 1, 0xd0, 0, 11]),
  section(10, [1, ...vector(typedBody)])
);
const types = decodeModule(typed);
const ref = index => ({ kind: 'ref', nullable: true, heapType: index });
assert.deepStrictEqual(types.typeSection[0].fields[0].storage, ref(1));
assert.deepStrictEqual(types.typeSection[1].field.storage, ref(0));
assert.deepStrictEqual(types.typeSection[2].params, [ref(0)]);
assert.deepStrictEqual(types.typeSection[2].results, [ref(0)]);
assert.deepStrictEqual(types.tableSection[0].elemType, ref(0));
assert.deepStrictEqual(types.globalSection[0].globalType.valType, ref(0));
assert.deepStrictEqual(types.codeSection[0].locals, [{ count: 1, valType: ref(1) }]);
assert.deepStrictEqual(types.elementSection[0].reftype, ref(0));
assert.strictEqual(types.elementSection[0].elementExpressions[0], types.expressions[1]);
assert.strictEqual(types.typeGroups[0].recursive, true);
const legacy = new WasmDisassembler(typed);
const typedWat = legacy.disassemble();
assert.deepStrictEqual(legacy.typeSection[2].params, ['(ref null 0)']);
assert.strictEqual(legacy.typeSection[0].fields[0].storage, '(ref null 1)');
assert.strictEqual(legacy.codeSection[0].locals[0].valType, '(ref null 1)');
assert.deepStrictEqual(decodeModule(asm.assemble(typedWat)).typeSection, types.typeSection);
if (WebAssembly.validate(typed)) new WebAssembly.Module(typed);
else console.log('SKIP_native_recursive_type_module: GC unavailable');
console.log('PASS_recursive_reference_types_remain_structured_and_legacy_api_remains_compatible');

for (const reftype of [0x70, 0x6f, 0x69, 0x6e, 0x6d, 0x6c, 0x6b, 0x6a, 0x71, 0x72, 0x73, 0x74]) {
  assert.strictEqual(decodeModule(binary(section(1, [1, 0x60, 1, reftype, 0]))).typeSection[0].params[0], reftype);
}
const subtypes = decodeModule(binary(section(1, [2, 0x50, 0, 0x60, 0, 0, 0x4f, 1, 0, 0x60, 0, 0])));
assert.deepStrictEqual(subtypes.typeSection.map(t => t.subtype), [
  { explicit: true, isFinal: false, supertypes: [] },
  { explicit: true, isFinal: true, supertypes: [0] }
]);
const importedRefs = decodeModule(binary(section(2, [
  2, ...record(1, 'typedTable', [0x63, 0, 0, 1]),
  ...record(3, 'typedGlobal', [0x64, 0, 0])
])));
assert.deepStrictEqual(importedRefs.importSection[0].tableType.elemType, ref(0));
assert.deepStrictEqual(importedRefs.importSection[1].globalType.valType,
  { kind: 'ref', nullable: false, heapType: 0 });
const packed = decodeModule(binary(section(1, [2, 0x5f, 1, 0x78, 0, 0x5e, 0x77, 1])));
assert.deepStrictEqual(packed.typeSection[0].fields, [{ storage: 0x78, mutable: false }]);
assert.deepStrictEqual(packed.typeSection[1].field, { storage: 0x77, mutable: true });
for (let flags = 0; flags < 8; flags++) {
  const expressions = flags >= 4;
  const active = (flags & 1) === 0;
  const payload = [1, flags, ...([2, 6].includes(flags) ? [0] : []),
    ...(active ? [0x41, 0, 11] : []),
    ...(flags >= 5 ? [0x63, 0] : flags >= 1 && flags <= 3 ? [0] : []),
    1, ...(expressions ? [0xd0, 0, 11] : [0])];
  const module = decodeModule(binary(section(9, payload)));
  const segment = module.elementSection[0];
  assert.strictEqual(segment.mode, active ? 'active' : flags & 2 ? 'declarative' : 'passive');
  assert.strictEqual(segment.useExpressions, expressions);
  if (flags >= 5) assert.deepStrictEqual(segment.reftype, ref(0));
  if (active) assert.strictEqual(segment.offsetExpression, module.expressions[0]);
  if (expressions) assert.strictEqual(segment.elementExpressions[0], module.expressions[module.expressions.length - 1]);
}
console.log('PASS_structured_imports_packed_fields_and_all_eight_element_forms');

const padded = Uint8Array.from([255, 254, ...allSections, 253]);
const view = padded.subarray(2, -1);
assert.deepStrictEqual(decodeModule(view), decoded);
assert.deepStrictEqual(decodeModule(view, { copyInput: false }), decoded);
assert.strictEqual(disassembleWASM(view), disassembleWASM(allSections));
const copied = decodeModule(view);
const borrowed = decodeModule(view, { copyInput: false });
assert.strictEqual(borrowed.bytes, view);
assert.notStrictEqual(copied.bytes.buffer, view.buffer);
const payloadOffset = copied.customSections[1].payloadOffset;
view[payloadOffset] = 3;
assert.strictEqual(borrowed.customSections[1].payload[0], 3);
assert.strictEqual(copied.customSections[1].payload[0], 255);
assert.strictEqual(copied.bytes[payloadOffset], 255);
view[payloadOffset] = 255;
for (const invalid of [null, [], new ArrayBuffer(8), 'wasm']) {
  assert.throws(() => decodeModule(invalid), /Uint8Array/);
}
assert.throws(() => decodeModule(HEADER, { copyInput: 1 }), /boolean/);
const f32 = Uint8Array.from([255, 0, 0, 96, 64, 255]).subarray(1, 5);
const f64 = Uint8Array.from([255, 0, 0, 0, 0, 0, 0, 12, 64, 255]).subarray(1, 9);
assert.strictEqual(__test.decodeF32(f32, 0), 3.5);
assert.strictEqual(__test.decodeF64(f64, 0), 3.5);
console.log('PASS_subview_header_offsets_default_input_ownership_and_uint8array_numeric_helpers');

const invalidModules = [
  [binary(section(2, [1, ...record(5, 'bad', [])])), /Invalid import kind/],
  [binary(section(7, [1, ...name('bad'), 5, 0])), /Invalid export kind/],
  [binary(section(2, [1, ...record(4, 'bad', [1, 0])])), /Invalid import tag attribute/],
  [binary(section(13, [1, 1, 0])), /Invalid tag attribute/],
  [binary(section(1, [0]), section(1, [0])), /Duplicate/],
  [binary(section(5, [0]), section(1, [0])), /order/],
  [binary(section(14, [0])), /Unknown section/],
  [binary(section(1, [0, 1])), /unconsumed/],
  [binary(section(1, [1, 0x60, 1, 0x63]), custom), /Truncated|bounds/],
  [binary(section(1, [1, 0x60, 1, 0x7a, 0])), /Invalid.*type/],
  [binary(section(0, [1, 255])), /UTF-8/],
  [binary(section(5, [1, 2, 1, 1])), /Unsupported/],
  [binary(section(6, [1, 0x7f, 2, 0x41, 0, 11])), /mutability/],
  [binary(section(9, [1, 8])), /flags/],
  [binary(section(11, [1, 3, 0])), /flags/],
  [new Uint8Array(0), /too small/],
  [Uint8Array.from([1, ...HEADER.subarray(1)]), /magic/],
  [Uint8Array.from([...HEADER.subarray(0, 4), 2, 0, 0, 0]), /version/]
];
for (const [bytes, pattern] of invalidModules) {
  assert.throws(() => decodeModule(bytes), pattern);
  assert.throws(() => disassembleWASM(bytes), pattern);
}
let truncations = 0;
for (const s of [section(1, [1, 0x60, 1, 0x63, 0, 0]), section(2, [1, ...record(4, 'tag', [0, 0])]),
  section(6, [1, 0x7b, 0, 0xfd, 12, ...Array(16).fill(11), 11]),
  section(10, [1, ...vector(body)])]) {
  assert.ok(s[1] < 128, 'fixture section length is one-byte LEB');
  for (let end = 2; end < s.length; end++) {
    const payload = [...s.subarray(2, end)];
    assert.throws(() => decodeModule(binary(section(s[0], payload), custom)),
      /Truncated|bounds|Unterminated/);
    truncations++;
  }
}
for (const payload of [
  [...name('name'), 0, 2, 2],
  [...name('name'), 1, 3, 1, 0],
  [...name('name'), 2, 4, 1, 0, 1],
  [...name('name'), 77, 3, 255]
]) {
  assert.throws(() => decodeModule(binary(section(0, payload), custom)), /Truncated|bounds/);
  truncations++;
}
const decoder = new ModuleDecoder(allSections);
const first = decoder.decode();
decoder.buffer = invalidModules[0][0];
assert.throws(() => decoder.decode(), /Invalid import/);
assert.strictEqual(decoder.sectionEnd, null);
decoder.buffer = HEADER;
const empty = decoder.decode();
assert.strictEqual(empty.sections.length, 0);
assert.strictEqual(empty.expressions.length, 0);
assert.strictEqual(empty.nameSection.moduleName, null);
assert.strictEqual(first.sections.length, 15);
console.log(`PASS_reserved_kind_attribute_rejection_${truncations}_nested_truncations_and_recovery`);

const files = fs.readdirSync(path.join(__dirname, 'expected')).filter(file => file.endsWith('.wasm'));
for (const file of files) {
  const bytes = fs.readFileSync(path.join(__dirname, 'expected', file));
  const direct = decodeModule(bytes);
  const printer = new WasmDisassembler(bytes);
  printer.disassemble();
  assert.strictEqual(direct.codeSection.length, printer.codeSection.length, file);
  assert.strictEqual(direct.typeGroups.length, printer.typeGroups.length, file);
  for (let i = 0; i < direct.codeSection.length; i++) {
    assert.deepStrictEqual(direct.codeSection[i].instructions, printer.codeSection[i].instructions, file);
  }
}

const independent = spawnSync(process.execPath, ['-e', `
  const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  globalThis.Buffer = undefined;
  globalThis.WebAssembly = undefined;
  const assert = require('assert');
  const { decodeModule } = require(${JSON.stringify(require.resolve('../wasm-module.js'))});
  const fixture = decodeModule(Uint8Array.from(input.allSections));
  assert.strictEqual(fixture.sections.length, 15);
  assert.strictEqual(fixture.typeSection[1].results[0], 0x7f);
  assert.strictEqual(fixture.nameSection.moduleName, ${JSON.stringify(moduleName)});
  assert.strictEqual(fixture.codeSection[0].instructions[0].immediates.value, 42);
  const typed = decodeModule(Uint8Array.from(input.typed));
  assert.deepStrictEqual(typed.typeSection[2].params, [{ kind: 'ref', nullable: true, heapType: 0 }]);
  const cache = Object.keys(require.cache);
  assert.ok(!cache.some(file => /wasm-disassembler|instruction-wat|wat-assembler/.test(file)));
`], { input: JSON.stringify({ allSections: [...allSections], typed: [...typed] }), encoding: 'utf8' });
assert.ifError(independent.error);
assert.strictEqual(independent.status, 0, independent.stderr);
console.log(`PASS_${files.length}_snapshot_modules_and_fresh_process_without_buffer_native_engine_or_wat_printer`);

const nativeAllSections = WebAssembly.validate(allSections);
function checkAllSectionExecution(bytes) {
  if (!nativeAllSections) return;
  let starts = 0;
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    host: {
      f: () => { starts++; },
      t: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
      m: new WebAssembly.Memory({ initial: 1 }),
      g: new WebAssembly.Global({ value: 'i32' }, 7),
      e: new WebAssembly.Tag({ parameters: [] })
    }
  });
  assert.strictEqual(starts, 1);
  assert.strictEqual(instance.exports.answer(), 42);
  assert.strictEqual(instance.exports.global.value, 11);
  assert.strictEqual(instance.exports.table.get(0)(), 42);
  assert.deepStrictEqual([...new Uint8Array(instance.exports.memory.buffer, 11, 2)], [0, 255]);
}
checkAllSectionExecution(allSections);
const reconstructed = asm.assemble(disassembleWASM(allSections));
const reconstructedModule = decodeModule(reconstructed);
assert.deepStrictEqual([...reconstructedModule.codeSection[0].code], [...decoded.codeSection[0].code]);
assert.deepStrictEqual(reconstructedModule.importSection, decoded.importSection);
checkAllSectionExecution(reconstructed);
if (!nativeAllSections) {
  console.log('SKIP_native_all_section_fixture: engine lacks multi-memory or exception tags');
}
const wabt = spawnSync('wat2wasm', ['--version'], { encoding: 'utf8' });
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP_wabt_all_section_fixture: wat2wasm unavailable');
} else {
  assert.ifError(wabt.error);
  assert.strictEqual(wabt.status, 0, wabt.stderr);
  const oracle = spawnSync('wat2wasm', ['--enable-multi-memory', '--enable-exceptions', '-', '-o', '/dev/stdout'],
    { input: disassembleWASM(allSections) });
  assert.ifError(oracle.error);
  assert.strictEqual(oracle.status, 0, oracle.stderr.toString());
  assert.deepStrictEqual([...decodeModule(oracle.stdout).codeSection[0].code], [...decoded.codeSection[0].code]);
  checkAllSectionExecution(oracle.stdout);
  console.log('PASS_independent_wabt_all_section_fixture');
}
console.log('PASS_all_section_source_rebuilt_and_oracle_execution_effects');
console.log('\nAll standalone module decoder regressions passed.');
