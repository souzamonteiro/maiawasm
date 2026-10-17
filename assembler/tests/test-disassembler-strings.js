'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const WatAssembler = require('../wat-assembler.js');
const { WasmDisassembler, disassembleWASM, __test } = require('../wasm-disassembler.js');
const { decodeWatString, quoteWatBytes } = require('../wasm-strings.js');

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
const section = (id, bytes) => Buffer.from([id, ...vector(bytes)]);
const binary = (...sections) => Buffer.concat([HEADER, ...sections]);
function parse(bytes) {
  const dis = new WasmDisassembler(bytes);
  dis.disassemble();
  return dis;
}

const names = [
  '', 'ascii', '"\\\0\t\n\r', ';; (; ;) ) (module)',
  'memory.init) table.copy) call_indirect) i32.const -12 i64.const -3',
  '\u00e9\u4e2d\ud83d\ude00', '\ufeffprefix', '\ufffd', '\u007f\u0085\u2028\u2029',
  '\u{10ffff}', '\u0001\u001f', '\ufffe\uffff'
];
const type = section(1, [1, 0x60, 0, 0]);
const cases = names.map((name, index) => {
  const moduleName = names[(index + 1) % names.length];
  const source = binary(
    type,
    section(2, [1, ...vector(Buffer.from(moduleName)), ...vector(Buffer.from(name)), 0, 0]),
    section(7, [1, ...vector(Buffer.from(name)), 0, 0])
  );
  assert.ok(WebAssembly.validate(source));
  const first = parse(source);
  const wat = first.output.join('\n');
  const rebuilt = asm.assemble(wat);
  assert.ok(WebAssembly.validate(rebuilt), wat);
  const second = parse(rebuilt);
  assert.strictEqual(second.importSection[0].module, moduleName);
  assert.strictEqual(second.importSection[0].name, name);
  assert.strictEqual(second.exportSection[0].name, name);
  assert.strictEqual(disassembleWASM(rebuilt), wat);
  const imports = Object.create(null);
  imports[moduleName] = Object.create(null);
  let calls = 0;
  imports[moduleName][name] = () => calls++;
  for (const bytes of [source, rebuilt]) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), imports);
    instance.exports[name]();
  }
  assert.strictEqual(calls, 2);
  return { name, source, wat };
});
console.log('PASS_binary_name_escaping_unicode_bom_controls_and_native_import_export_identity');

const invalidUTF8 = [
  [0x80], [0xbf], [0xc0, 0x80], [0xc1, 0xbf], [0xc2], [0xc2, 0x20],
  [0xe0, 0x80, 0x80], [0xe1, 0x80], [0xed, 0xa0, 0x80], [0xed, 0xbf, 0xbf],
  [0xf0, 0x80, 0x80, 0x80], [0xf0, 0x9f, 0x98], [0xf4, 0x90, 0x80, 0x80],
  [0xf5, 0x80, 0x80, 0x80], [0xfe], [0xff]
];
const namePrefix = vector(Buffer.from('name'));
for (const bytes of invalidUTF8) {
  assert.throws(() => __test.decodeUTF8(Buffer.from(bytes), 0, bytes.length), /Invalid UTF-8/);
  for (const source of [
    binary(type, section(2, [1, ...vector(bytes), 0, 0, 0])),
    binary(type, section(2, [1, 0, ...vector(bytes), 0, 0])),
    binary(section(7, [1, ...vector(bytes), 0, 0])),
    binary(section(0, vector(bytes))),
    binary(section(0, [...namePrefix, 0, ...vector(vector(bytes))])),
    binary(section(0, [...namePrefix, 1, ...vector([1, 0, ...vector(bytes)])])),
    binary(section(0, [...namePrefix, 2, ...vector([1, 0, 1, 0, ...vector(bytes)])]))
  ]) {
    assert.throws(() => disassembleWASM(source), /Invalid UTF-8/);
  }
  const quoted = quoteWatBytes(bytes);
  assert.throws(() => asm.assemble(`(module (func) (export ${quoted} (func 0)))`), /Invalid UTF-8/);
  assert.throws(() => asm.assemble(`(module (import ${quoted} "" (func)))`), /Invalid UTF-8/);
  assert.deepStrictEqual(parse(asm.assemble(`(module (data ${quoted}))`)).dataSection[0].bytes, Buffer.from(bytes));
}
assert.strictEqual(__test.decodeUTF8(Buffer.from([0xef, 0xbb, 0xbf, 0x61]), 0, 4), '\ufeffa');
assert.strictEqual(__test.decodeUTF8(Buffer.from([0xef, 0xbf, 0xbd]), 0, 3), '\ufffd');
assert.strictEqual(__test.decodeUTF8(Buffer.from([0xff, 0x61, 0xff]), 1, 1), 'a');
const subview = Buffer.from([0xff, 0xc3, 0xa9, 0xff]).subarray(1, 3);
assert.strictEqual(__test.decodeUTF8(subview, 0, 2), '\u00e9');
console.log('PASS_fatal_utf8_in_all_name_surfaces_not_arbitrary_data_bytes');

const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
assert.deepStrictEqual(decodeWatString(quoteWatBytes(allBytes)), allBytes);
const allData = binary(section(11, [1, 1, ...vector(allBytes)]));
assert.deepStrictEqual(parse(asm.assemble(disassembleWASM(allData))).dataSection[0].bytes, allBytes);
const unicodeSource = '(module (data "\u00e9\u4e2d\ud83d\ude00") (data "\\u{1f600}\\u{10_ffff}\\00\\ff"))';
const unicode = parse(asm.assemble(unicodeSource));
assert.deepStrictEqual(unicode.dataSection[0].bytes, Buffer.from('\u00e9\u4e2d\ud83d\ude00'));
assert.deepStrictEqual(unicode.dataSection[1].bytes, Buffer.concat([Buffer.from('\ud83d\ude00\u{10ffff}'), Buffer.from([0, 255])]));
const escapedName = asm.assemble('(module (func) (export "\\u{1f600}\\c3\\a9\\22\\5c\\00" (func 0)))');
assert.strictEqual(parse(escapedName).exportSection[0].name, '\ud83d\ude00\u00e9"\\\0');
assert.ok(WebAssembly.validate(escapedName));
assert.strictEqual(parse(asm.assemble('(module (func) (export "\ud83d\ude00" (func 0)))')).exportSection[0].name, '\ud83d\ude00');
const concatenated = asm.assemble('(module (data "\\f0\\9f" "\\98\\80" "\\00\\ff"))');
assert.deepStrictEqual(parse(concatenated).dataSection[0].bytes, Buffer.from([0xf0, 0x9f, 0x98, 0x80, 0, 255]));
for (const raw of ['"\\q"', '"\\a"', '"\\u{}"', '"\\u{d800}"', '"\\u{110000}"',
  '"\\u{_41}"', '"\\u{41_}"', '"\ud800"', '"\udfff"', '"\n"', '"\u007f"']) {
  assert.throws(() => decodeWatString(raw), /Invalid/);
  assert.throws(() => asm.assemble(`(module (data ${raw}))`), /Invalid|Parse failed/);
}
assert.deepStrictEqual(decodeWatString('"\\n\\t\\r\\\'\\"\\\\"'), Buffer.from([10, 9, 13, 39, 34, 92]));
assert.throws(() => decodeWatString('"'), /Invalid/);
assert.throws(() => asm.assemble('(module (data "unterminated))'), /Unterminated WAT string/);
console.log('PASS_byte_unicode_and_simple_escapes_astral_scalars_and_invalid_input_rejection');

const normalizationText = 'memory.copy) memory.init) memory.init 1) table.copy) call_indirect) i32.const -7 i64.const -9';
const protectedSource = `(module
  ;; memory.init) i32.const -1
  (data "${normalizationText}")
  (func (result i32) i32.const -1)
  (export "${normalizationText}" (func 0)))`;
const protectedBinary = asm.assemble(protectedSource);
const protectedDis = parse(protectedBinary);
assert.strictEqual(protectedDis.exportSection[0].name, normalizationText);
assert.deepStrictEqual(protectedDis.dataSection[0].bytes, Buffer.from(normalizationText));
assert.strictEqual(new WebAssembly.Instance(new WebAssembly.Module(protectedBinary)).exports[normalizationText](), -1);
console.log('PASS_assembler_compatibility_normalization_does_not_rewrite_strings');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maiawasm-string-cli-'));
const input = path.join(tempDir, 'strings.wat');
const output = path.join(tempDir, 'strings.wasm');
try {
  fs.writeFileSync(input, protectedSource);
  const result = spawnSync('bash', [path.join(__dirname, '../../bin/wat2wasm.sh'), input, output], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, result.stderr);
  const cli = parse(fs.readFileSync(output));
  assert.strictEqual(cli.exportSection[0].name, normalizationText);
  assert.deepStrictEqual(cli.dataSection[0].bytes, Buffer.from(normalizationText));
} finally {
  for (const file of [input, output]) if (fs.existsSync(file)) fs.unlinkSync(file);
  fs.rmdirSync(tempDir);
}
console.log('PASS_cli_preserves_comment_markers_inside_names_and_data');

const goodNames = binary(section(0, [
  ...namePrefix,
  0, ...vector(vector(Buffer.from('\ufeff\ud83d\ude00'))),
  1, ...vector([1, 0, ...vector(Buffer.from('"\n\\'))]),
  2, ...vector([1, 0, 1, 0, ...vector(Buffer.from('\u4e2d'))])
]));
const reusable = parse(goodNames);
assert.strictEqual(reusable.nameSection.moduleName, '\ufeff\ud83d\ude00');
assert.strictEqual(reusable.nameSection.functionNames.get(0), '"\n\\');
assert.strictEqual(reusable.nameSection.localNames.get(0).get(0), '\u4e2d');
reusable.buffer = binary(section(0, [...namePrefix, 0, ...vector([1, 255])]));
assert.throws(() => reusable.disassemble(), /Invalid UTF-8/);
assert.strictEqual(reusable.sectionEnd, null);
reusable.buffer = goodNames;
reusable.disassemble();
assert.strictEqual(reusable.nameSection.moduleName, '\ufeff\ud83d\ude00');
const opaque = binary(section(0, [...vector(Buffer.from('opaque')), ...invalidUTF8.flat()]));
assert.strictEqual(parse(opaque).customSections.length, 1);
console.log('PASS_name_metadata_utf8_error_recovery_and_opaque_custom_bytes');

const native = globalThis.WebAssembly;
try {
  globalThis.WebAssembly = undefined;
  assert.strictEqual(parse(asm.assemble(cases[2].wat)).exportSection[0].name, cases[2].name);
  assert.deepStrictEqual(parse(asm.assemble(disassembleWASM(allData))).dataSection[0].bytes, allBytes);
} finally {
  globalThis.WebAssembly = native;
}
console.log('PASS_string_roundtrips_without_native_webassembly');

const wabt = spawnSync('wat2wasm', ['--version'], { encoding: 'utf8' });
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP independent WABT string oracle: wat2wasm unavailable');
} else {
  assert.ifError(wabt.error);
  assert.strictEqual(wabt.status, 0, wabt.stderr);
  for (const { name, wat } of cases) {
    const result = spawnSync('wat2wasm', ['-', '-o', '/dev/stdout'], { input: wat });
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, String(result.stderr));
    assert.strictEqual(parse(result.stdout).exportSection[0].name, name);
    assert.ok(WebAssembly.validate(result.stdout));
  }
  console.log('PASS_independent_wabt_escaped_name_binary_identity');
}
console.log('\nAll UTF-8/WAT string fidelity regressions passed.');
