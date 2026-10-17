'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const { decodeModule, ModuleDecoder } = require('../wasm-module.js');
const { decodeInstructions, decodeExpression } = require('../wasm-instructions.js');
const { analyzeFunctionControl } = require('../wasm-control.js');
const { disassembleWASM } = require('../wasm-disassembler.js');
const WatAssembler = require('../wat-assembler.js');

const HEADER = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
function uleb(value) {
  const bytes = [];
  do {
    const byte = value & 127;
    value >>>= 7;
    bytes.push(byte | (value ? 128 : 0));
  } while (value);
  return bytes;
}
const section = (id, bytes) => Buffer.from([id, ...uleb(bytes.length), ...bytes]);
function moduleBytes(code, { tags = false, resultType = null } = {}) {
  const body = [0, ...code];
  return Buffer.concat([HEADER,
    section(1, [2, 0x60, 0, 0, 0x60, 0, ...(resultType === null ? [0] : [1, resultType])]),
    section(3, [1, 1]),
    ...(tags ? [section(13, [1, 0, 0])] : []),
    section(7, [1, 3, 114, 117, 110, 0, 0]),
    section(10, [1, ...uleb(body.length), ...body])
  ]);
}
const analyze = bytes => analyzeFunctionControl(decodeInstructions(Uint8Array.from(bytes)));
const nested = [
  2, 0x40,               // 0 block
  3, 0x40,               // 1 loop
  0x41, 0,               // 2 condition
  4, 0x40,               // 3 if
  0x0c, 0,               // 4 br if
  5,                     // 5 else
  0x0c, 1,               // 6 br loop
  11,                    // 7 end if
  0x41, 0,               // 8 selector
  0x0e, 2, 0, 1, 2,      // 9 br_table loop/block/function
  11,                    // 10 end loop
  11,                    // 11 end block
  0x0f,                  // 12 return
  11                     // 13 function end
];
const linked = analyze(nested);
assert.deepStrictEqual(linked.frames.map(({ kind, startIndex, endIndex, elseIndex, parent }) =>
  [kind, startIndex, endIndex, elseIndex, parent]), [
  ['function', -1, 13, null, null], ['block', 0, 11, null, 0],
  ['loop', 1, 10, null, 1], ['if', 3, 7, 5, 2]
]);
assert.deepStrictEqual(linked.branches.map(b => b.targets.map(t =>
  [t.depth, t.frameIndex, t.kind, t.targetIndex])), [
  [[0, 3, 'if', 8]], [[1, 2, 'loop', 2]],
  [[0, 2, 'loop', 2], [1, 1, 'block', 12], [2, 0, 'function', 14]],
  [[0, 0, 'function', 14]]
]);
const records = decodeInstructions(Uint8Array.from(nested));
const before = structuredClone(records);
analyzeFunctionControl(records);
assert.deepStrictEqual(records, before, 'control analysis does not mutate instruction records');
assert.deepStrictEqual(decodeModule(moduleBytes(nested)).codeSection[0].control, linked);
assert.ok(WebAssembly.validate(moduleBytes(nested)));
console.log('PASS_if_else_block_loop_function_targets_and_non_mutating_control_records');

const valid = [
  [11], [0x0c, 0, 11], [0x41, 0, 0x0d, 0, 11],
  [0x41, 0, 4, 0x40, 11, 11],
  [0x41, 0, 4, 0x40, 5, 11, 11],
  [2, 0x40, 0x0c, 1, 11, 11],
  [0x41, 0, 0x0e, 0, 0, 11]
];
for (const code of valid) {
  assert.ok(WebAssembly.validate(moduleBytes(code)));
  const body = decodeModule(moduleBytes(code)).codeSection[0];
  assert.deepStrictEqual(body.control, analyze(code));
}
const invalid = [
  [[5, 11], /else outside/],
  [[2, 0x40, 5, 11, 11], /else outside/],
  [[3, 0x40, 5, 11, 11], /else outside/],
  [[0x41, 0, 4, 0x40, 5, 5, 11, 11], /duplicate else/],
  [[7, 0, 11], /catch outside/],
  [[0x19, 11], /catch outside/],
  [[0x41, 0, 4, 0x40, 7, 0, 11, 11], /catch outside/],
  [[6, 0x40, 0x19, 7, 0, 11, 11], /after catch_all/],
  [[6, 0x40, 0x19, 0x19, 11, 11], /after catch_all/],
  [[6, 0x40, 5, 11, 11], /else outside/],
  [[0x1f, 0x40, 0, 7, 0, 11, 11], /catch outside/],
  [[0x0c, 1, 11], /label depth 1/],
  [[0, 0x0c, 1, 11], /label depth 1/], // unreachable is not an index-validation exemption
  [[0x41, 0, 0x0d, 1, 11], /label depth 1/],
  [[0x41, 0, 0x0e, 1, 1, 0, 11], /label depth 1/],
  [[0x41, 0, 0x0e, 1, 0, 1, 11], /label depth 1/],
  [[0xd5, 1, 11], /label depth 1/],
  [[0xd6, 1, 11], /label depth 1/],
  [[0xfb, 24, 0, 1, 0x6e, 0x6d, 11], /label depth 1/],
  [[0xfb, 25, 0, 1, 0x6e, 0x6d, 11], /label depth 1/],
  [[0x09, 0, 11], /active legacy catch/],
  [[6, 0x40, 0x09, 0, 11, 11], /active legacy catch/],
  [[6, 0x40, 0x19, 2, 0x40, 0x09, 0, 11, 11, 11], /active legacy catch/],
  [[6, 0x40, 0x19, 0x09, 2, 11, 11], /label depth 2/],
  [[0x1f, 0x40, 1, 2, 1, 11, 11], /label depth 1/],
  [[2, 0x40, 0x1f, 0x40, 1, 2, 2, 11, 11, 11], /label depth 2/]
];
for (const [code, error] of invalid) {
  const bytes = moduleBytes(code, { tags: true });
  assert.throws(() => decodeModule(bytes), error);
  assert.throws(() => disassembleWASM(bytes), error);
  assert.throws(() => analyze(code), error);
  assert.ok(!WebAssembly.validate(bytes), `native must reject malformed control: ${code}`);
}
assert.throws(() => analyze([11, 1]), /after outer end/);
assert.throws(() => analyze([2, 0x40, 11]), /Unterminated/);
assert.throws(() => analyze([]), /Unterminated/);
assert.throws(() => decodeExpression(Uint8Array.from([5, 11])), /else outside/);
assert.strictEqual(decodeInstructions(Uint8Array.from([5, 7, 0])).length, 2,
  'flat fragment decoding retains its no-context contract');
for (const code of [
  [0xd5, 0, 11], [0xd6, 0, 11],
  [0xfb, 24, 0, 0, 0x6e, 0x6d, 11], [0xfb, 25, 0, 0, 0x6e, 0x6d, 11]
]) {
  const target = analyze(code).branches[0].targets[0];
  assert.strictEqual(target.frameIndex, 0);
  assert.strictEqual(target.targetIndex, 2);
}
assert.throws(() => decodeModule(Buffer.concat([HEADER, section(6, [1, 0x7f, 0, 5, 11])])),
  /else outside/, 'initializer framing also rejects misplaced delimiters');
assert.throws(() => analyze([0x0c, 255, 255, 255, 255, 15, 11]), /label depth 4294967295/);
console.log(`PASS_${valid.length}_valid_and_${invalid.length}_invalid_control_binaries_including_unreachable_labels`);

const legacy = [6, 0x40, 7, 0, 2, 0x40, 0x09, 1, 11, 7, 0, 0x19, 0x09, 0, 11, 11];
const legacyControl = analyze(legacy);
assert.deepStrictEqual(legacyControl.frames[1].handlers, [
  { kind: 'catch', instructionIndex: 1, tagIndex: 0 },
  { kind: 'catch', instructionIndex: 5, tagIndex: 0 },
  { kind: 'catch_all', instructionIndex: 6 }
]);
assert.deepStrictEqual(legacyControl.branches.map(b => b.targets[0].handlerIndex), [1, 6]);
assert.ok(WebAssembly.validate(moduleBytes(legacy, { tags: true })));
assert.ok(WebAssembly.validate(moduleBytes([6, 0x40, 11, 11])), 'catch-less try is legal');
const nestedCatch = [6, 0x40, 0x19, 6, 0x40, 0x09, 1, 0x19, 0x09, 1, 11, 11, 11];
assert.ok(WebAssembly.validate(moduleBytes(nestedCatch)), 'rethrow may reference an outer active catch from an inner try');
assert.strictEqual(analyze(nestedCatch).branches[0].targets[0].frameIndex, 1);
const modern = [2, 0x40, 0x1f, 0x40, 4, 0, 0, 0, 1, 0, 0, 2, 0, 3, 1, 11, 11, 11];
const modernControl = analyze(modern);
assert.deepStrictEqual(modernControl.branches.map(b => b.targets[0].frameIndex), [1, 1, 1, 0]);
assert.deepStrictEqual(modernControl.branches.map(b => b.catchIndex), [0, 1, 2, 3]);
assert.ok(modernControl.branches.every(b => b.targets[0].frameIndex !== 2),
  'try_table headers cannot target their own new label');
decodeModule(moduleBytes(modern, { tags: true }));
console.log('PASS_legacy_handler_order_rethrow_context_and_modern_surrounding_label_resolution');

const depth = 20000;
const deep = [...Array.from({ length: depth }, () => [2, 0x40]).flat(),
  0x0c, ...uleb(depth), ...Array(depth + 1).fill(11)];
const deepBody = decodeModule(moduleBytes(deep)).codeSection[0];
assert.strictEqual(deepBody.control.frames.length, depth + 1);
assert.strictEqual(deepBody.control.branches[0].targets[0].frameIndex, 0);
assert.strictEqual(deepBody.control.branches[0].targets[0].targetIndex, depth * 2 + 2);
const analyzer = new ModuleDecoder(moduleBytes(invalid[0][0]));
assert.throws(() => analyzer.decode(), /else outside/);
assert.strictEqual(analyzer.sectionEnd, null);
analyzer.buffer = moduleBytes([11]);
assert.strictEqual(analyzer.decode().codeSection[0].control.frames.length, 1);
const asm = new WatAssembler();
const runnable = asm.assemble(`(module
  (func (param i32) (result i32)
    local.get 0 if (result i32) i32.const 17 else i32.const 29 end)
  (export "choose" (func 0)))`);
for (const bytes of [runnable, asm.assemble(disassembleWASM(runnable))]) {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  assert.strictEqual(instance.exports.choose(1), 17);
  assert.strictEqual(instance.exports.choose(0), 29);
  assert.strictEqual(decodeModule(bytes).codeSection[0].control.frames[1].elseIndex, 3);
}
const independent = spawnSync(process.execPath, ['-e', `
  globalThis.Buffer = undefined; globalThis.WebAssembly = undefined;
  const { decodeModule } = require(${JSON.stringify(require.resolve('../wasm-module.js'))});
  const m = decodeModule(Uint8Array.from(${JSON.stringify([...moduleBytes(nested)])}));
  if (m.codeSection[0].control.branches[1].targets[0].targetIndex !== 2) throw new Error('Incorrect loop destination');
`], { encoding: 'utf8' });
assert.ifError(independent.error);
assert.strictEqual(independent.status, 0, independent.stderr);
console.log('PASS_20000_deep_iterative_control_analysis_recovery_execution_and_no_native_engine');

const modernCases = [0, 1, 2, 3].map(kind => {
  const entry = kind < 2 ? [kind, 0, 0] : [kind, 0];
  const bytes = moduleBytes([0x1f, 0x40, 1, ...entry, 0, 11, 0, 11],
    { tags: true, resultType: kind === 1 || kind === 3 ? 0x69 : null });
  assert.strictEqual(decodeModule(bytes).codeSection[0].control.branches[0].targets[0].frameIndex, 0);
  return [...bytes];
});
const probe = spawnSync(process.execPath, ['--experimental-wasm-exnref', '-e',
  'if (!WebAssembly.validate(Uint8Array.from(JSON.parse(process.argv[1])))) process.exit(2)',
  JSON.stringify(modernCases[2])], { encoding: 'utf8' });
assert.ifError(probe.error);
if (probe.status !== 0 && (/bad option|unknown|unrecognized/i.test(probe.stderr) || probe.status === 2)) {
  console.log('SKIP_native_modern_eh: try_table engine support unavailable');
} else {
  assert.strictEqual(probe.status, 0, probe.stderr);
  const modernOracle = spawnSync(process.execPath, ['--experimental-wasm-exnref', '-e', `
    const assert = require('assert');
    const cases = JSON.parse(process.argv[1]);
    for (const bytes of cases.valid) {
      assert.ok(WebAssembly.validate(Uint8Array.from(bytes)), bytes.toString());
    }
    for (const bytes of cases.invalid) assert.ok(!WebAssembly.validate(Uint8Array.from(bytes)));
  `, JSON.stringify({ valid: modernCases, invalid: [
    [...moduleBytes([0x1f, 0x40, 1, 2, 1, 0, 11, 11])],
    [...moduleBytes([2, 0x40, 0x1f, 0x40, 1, 2, 2, 0, 11, 11, 11])]
  ] })], { encoding: 'utf8' });
  assert.ifError(modernOracle.error);
  assert.strictEqual(modernOracle.status, 0, modernOracle.stderr);
  console.log('PASS_native_modern_eh_all_four_catch_kinds_and_outer_context_off_by_one');
}

const wabt = spawnSync('wat2wasm', ['--version'], { encoding: 'utf8' });
if (wabt.error && wabt.error.code === 'ENOENT') {
  console.log('SKIP_wabt_control_oracles: wat2wasm unavailable');
} else {
  assert.ifError(wabt.error);
  assert.strictEqual(wabt.status, 0, wabt.stderr);
  for (const wat of [
    '(module (func block loop i32.const 0 if br 0 else br 1 end i32.const 0 br_table 0 1 2 end end return))',
    '(module (tag) (func try catch 0 block rethrow 1 end catch 0 catch_all rethrow 0 end))',
    '(module (func try end))',
    '(module (type (func (param i32) (result i32 i32))) (func (export "pair") (result i32 i32) i32.const 7 block (type 0) i32.const 8 end))'
  ]) {
    const oracle = spawnSync('wat2wasm', ['--enable-exceptions', '-', '-o', '/dev/stdout'], { input: wat });
    assert.ifError(oracle.error);
    assert.strictEqual(oracle.status, 0, oracle.stderr.toString());
    const source = decodeModule(oracle.stdout);
    assert.deepStrictEqual(source.codeSection[0].control, analyze([...source.codeSection[0].code]));
    assert.ok(WebAssembly.validate(oracle.stdout));
    if (source.exportSection.some(entry => entry.name === 'pair')) {
      const instance = new WebAssembly.Instance(new WebAssembly.Module(oracle.stdout));
      assert.deepStrictEqual(instance.exports.pair(), [7, 8]);
      assert.deepStrictEqual(source.codeSection[0].instructions[1].immediates.blockType,
        { kind: 'type', typeIndex: 0 });
    }
  }
  for (const wat of ['(module (func br 1))', '(module (func unreachable br 1))',
    '(module (func i32.const 0 br_table 0 1))', '(module (func rethrow 0))']) {
    const oracle = spawnSync('wat2wasm', ['--enable-exceptions', '-', '-o', '/dev/stdout'], { input: wat });
    assert.ifError(oracle.error);
    assert.notStrictEqual(oracle.status, 0, wat);
  }
  console.log('PASS_independent_wabt_control_and_legacy_eh_positive_negative_oracles');
}
console.log('\nAll structural control validation regressions passed.');
