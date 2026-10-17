# WAT Assembler Test Suite

This test suite validates the WebAssembly Text Format assembler.

## Test Files

| Test File | Description |
|-----------|-------------|
| `01-basic-module.wat` | Basic module structure with a single function |
| `02-arithmetic.wat` | Arithmetic operations (add, sub, mul, div) |
| `03-control-flow.wat` | Control flow (if, loop, block) |
| `04-memory.wat` | Memory operations and management |
| `05-table.wat` | Table operations and call_indirect |
| `06-globals.wat` | Global variables (mutable and immutable) |
| `07-float.wat` | Floating point operations |
| `08-simd.wat` | SIMD vector operations |
| `09-complex.wat` | Complex module with multiple sections |
| `10-errors.wat` | Error cases (should fail assembly) |

## Disassembler Binary Integrity

[test-disassembler-integrity.js](test-disassembler-integrity.js) covers standard
section ordering/uniqueness/exact consumption, repeated custom sections, assembler
tag placement, zero-immediate `array.len`, unknown opcodes, truncated SIMD
immediates, shuffle/lane bounds, and repeated disassembly/error recovery.
[test-disassembler-custom-sections.js](test-disassembler-custom-sections.js)
also checks that parsed debug names do not leak across disassembly calls.

These checks are included in the disassembler runner. They do not replace a
complete WASM validator: recursive type equivalence, shared-reader extraction,
structured control validation and other conformance work remain in the
[VM roadmap](../../docs/WASM_VM_ROADMAP.md).

## GC, EH and Element Binary Regressions

[test-disassembler-proposal-binary.js](test-disassembler-proposal-binary.js)
tests standard GC test/cast variants, cast-branch flags and operand ordering,
signed s33 heap indices, `exn`, all four modern catch forms and all eight element
modes. It includes malformed/truncated inputs, numeric/symbolic catch labels,
typed reference encodings and direct element instruction expressions.

Native-engine oracles check GC results/traps and modern EH handler execution.
EH uses `--experimental-wasm-exnref` in a child process when required and available.
Missing native features or WABT produce explicit skips; byte-level tests still run.
Static-link tests preserve all element modes and remap typed element heap indices,
`ref.func` and `ref.null` across modules. Temporary binaries are cleaned up.
These tests are included in the aggregate disassembler runner. Native engines
and external tools are test oracles only, not future VM runtime dependencies.

## Nested Binary Boundaries

[test-disassembler-bounds.js](test-disassembler-bounds.js) covers 108
section-payload truncations, oversized vector counts and byte lengths, truncated
initializer immediates, function-local declarations crossing body boundaries,
and name fields crossing subsection boundaries. It asserts that failure does
not advance the cursor into the next container and that limits are restored.
Known name subsections must consume their payload exactly; unknown subsections
remain opaque. Positive fixtures retain legal padded LEBs, empty passive data
and successful reuse after nested errors.

This group is included in the aggregate disassembler runner. It exercises the
current Buffer-based parser, not a new standalone reader or complete validator.

## Recursive, Subtype and Reference Types

[test-disassembler-types.js](test-disassembler-types.js) exercises independent
recursive group/subtype binaries, flattened type indices and preserved metadata,
packed/reference fields, abstract reference value types and s33 heap indices.
Round trips cover signatures, tables, globals, locals, block results and typed
select, as well as forward named types and legacy assembler syntax.

Native GC oracles validate source/rebuilt binaries and invoke a function using
explicit references. Engines lacking GC produce an explicit skip for those
oracles; byte/metadata regressions still run. A round trip with the `WebAssembly`
global removed verifies that parsing and type encoding do not require it.
Malformed types/mutability, nested/truncated recursive groups and unsupported
static-link type graphs are rejected. The static linker deliberately does not
claim recursive/GC graph or explicit reference-signature remapping support.

These tests are part of the aggregate disassembler runner. They do not validate
recursive type equivalence, declared subtype correctness or full module typing.

## Memory32 and Multi-Memory

[test-disassembler-memory.js](test-disassembler-memory.js) checks complete
memory-index LEBs, all 45 scalar/SIMD access layouts and legal alignments, explicit
memory operands, SIMD lane indices, padded offsets/limits and malformed inputs.
Memory64/table64/shared limits are explicitly rejected in the supported profile.
`memory.init` tests distinguish standard text memory/data order from binary
data/memory order, including nonzero and named operands.

Independent native and WABT oracles check multi-memory results, bulk-memory
effects, growth, lane loads and out-of-bounds traps. Missing multi-memory or WABT
support yields an explicit skip; byte/metadata tests remain active. A separate
round trip removes the native `WebAssembly` global. Static-link tests exercise
implicit-zero/explicit memory remapping, local active data targets, passive data
without memory and legal padded offset retention.

Default load/store alignment now uses the instruction's natural width. The
generated memory fixture snapshot was updated for that standards correction;
the strict-hash fixture suite passes. This does not establish full module
validation or add memory64, shared-memory execution or static SIMD rewriting.

## UTF-8 and WAT String Fidelity

[test-disassembler-strings.js](test-disassembler-strings.js) checks fatal UTF-8
at every currently interpreted name surface, including custom-section/debug
names. Leading BOM and literal replacement characters remain distinct from
invalid input. Data and opaque custom payloads retain arbitrary bytes.

The suite covers exact escaped import/export names, supplementary Unicode
scalars, all 256 data-byte values, concatenated data strings, invalid escapes,
surrogates and raw controls. Opcode-looking strings cannot be changed by
assembler compatibility normalization. An actual CLI invocation checks that
comment markers inside strings survive assembly.

Native oracles invoke source/rebuilt exports under their exact names. Optional
WABT checks independently assemble escaped names (explicit skip if unavailable).
Round trips also run with the native `WebAssembly` global removed. This suite
is included in the aggregate runner and does not claim float-bit fidelity or
complete validator coverage.

## Raw Float and SIMD Constant Fidelity

[test-disassembler-floats.js](test-disassembler-floats.js) verifies bit-identical
scalar constants in independent function/global binaries, both signs of zero,
finite/subnormal boundaries, infinities and signaling/quiet NaN payloads.
Finite disassembly now uses exact hexadecimal significand/exponent notation.
The suite checks 8,192 deterministic bit patterns, 1,024 native decimal comparisons,
single target-width rounding at midpoints, double-rounding-sensitive f32 literals,
truncation and invalid/overflow errors.

Native source/rebuilt modules return exact scalar reinterpretation bits. All six
SIMD constant shapes are compared byte-for-byte and stored into native memory to
verify lane widths/order and NaN payloads. Scalar round trips also work with
`WebAssembly` removed. WABT independently assembles full disassembled scalar
modules, literals and every SIMD shape; absence yields an explicit skip.

WABT 1.0.39 has two observed normal/subnormal tie disagreements:
`f32 0xffffffp-150` and `f64 0x1fffffffffffffp-1075` produce the largest subnormal
instead of the even minimum normal. Tests report these cases explicitly, check
the exact observed lower pattern and verify correct IEEE rounding separately
with native conversion/parsing. Every other mismatch fails; this qualification
is not a blanket tolerance.

The `08-simd` fixture snapshot was regenerated because `i32x4 1 2 3 4` previously
packed four one-byte values instead of four 32-bit lanes. No additional fixture
snapshots changed in this batch. These tests do not establish VM float arithmetic
semantics or extracted typed instruction records.

## Shared Structured Instruction Decoder

[test-instruction-decoder.js](test-instruction-decoder.js) covers all 483 currently
recognized opcode variants and 719 truncated prefixes, with an explicit next
instruction to check exact byte consumption. It asserts named immediate records,
reference/heap types, branch/catch vectors, memargs, raw scalar float bits and
copied v128 bytes. Uint8Array subviews, nonzero base offsets, bounded LEB/float
reads and oversized-vector preflight checks are exercised directly.

Independent global/data/element/GC binaries check expression framing, including
`0x0b` inside SIMD bytes and type indices, adjacent expressions and parse-error
recovery. Function bodies must close nested blocks and their outer expression,
without bytes after the final end. This is framing validation, not stack typing,
handler/else placement or legal-constant-expression validation.

Native execution checks extended-constant globals/data offsets and nonzero,
distinct table/element operands for `table.init`. WABT independently checks both;
static linking also executes the table case. GC and extended-constant native
checks explicitly skip when the host lacks those proposals. A fresh process
loads/runs the decoder after removing both `Buffer` and `WebAssembly`.

No fixture snapshots changed for this extraction. The obsolete `table.init`
immediate test was corrected to distinguish element/table binary order from
table/element WAT order. The new group is part of the aggregate runner.

## Standalone Module Decoder

[test-module-decoder.js](test-module-decoder.js) checks independent all-section
and recursive-reference binaries through `decodeModule`, without generating WAT.
It covers all 13 standard section IDs, five import/export kinds, all eight
element forms, structured function/field/table/global/import/local reference
types, packed fields, recursive/subtype declarations, linked initializer records,
section/body ranges and custom/name metadata.

Default input copying is tested against explicit borrowing and caller mutation,
including nonzero-byteOffset Uint8Array views. The suite rejects invalid kinds/
tag attributes and checks 51 nested payload truncations plus decoder recovery.
All nine successful snapshot modules are compared with legacy instruction
records. Legacy disassembler signature/reference strings remain compatible.

A fresh process removes `Buffer` and `WebAssembly` before loading the module
decoder; it checks that no WAT printer, assembler or disassembler was loaded.
Native execution and independent WABT reconstruction check imported start calls,
results, globals, table elements and nonzero-target memory data effects.
WABT enables multi-memory/exception tags; absent tools or unsupported native
proposals are reported explicitly. No snapshots changed in this batch.

These are decoding/ownership tests, not a complete validator or immutable
compiled-module implementation.

## Structural Control Validation

[test-control-validation.js](test-control-validation.js) checks exact frame
parents, end/else/handler indices and branch destinations, including root exits,
loop backedges, every `br_table` target/default and reference/cast branches.
Independent function binaries cover seven valid and 26 invalid control shapes;
invalid labels in unreachable code are still rejected. Full module decoding and
disassembly reject invalid control while flat fragment decoding stays unchanged.

Legacy EH tests cover catch ordering, catch-less try, repeated tagged catches and
rethrow depths relative to active catches, with nested non-catch frames.
Modern EH checks all four catch forms, resolving labels before pushing the
try_table frame. Native and WABT positive/negative oracles independently verify
the rules; modern native tests explicitly enable exnref. Missing external tools
or engine proposal support produce explicit skips.

The suite verifies a 20,000-block binary without recursive control analysis,
decoder recovery, multi-value/type-index block acceptance, both native conditional
results before/after WAT reconstruction, and a fresh process without Buffer or
WebAssembly. These are structural checks, not operand-stack/type/branch-arity,
constant-expression or complete module validation.

## Running Tests

```bash
# Run all tests
npm test

# Run assembler tests in strict hash mode (byte-identical snapshots)
node tests/run-tests.js --strict-hash

# Run disassembler suite (includes external wabt validation when available)
node tests/run-disassembler-tests.js

# Run binary-integrity regressions only
node tests/test-disassembler-integrity.js

# Run integrated GC/EH/element and static-link regressions only
node tests/test-disassembler-proposal-binary.js

# Run nested section/body/subsection boundary regressions only
node tests/test-disassembler-bounds.js

# Run recursive/reference type-preservation regressions only
node tests/test-disassembler-types.js

# Run memory32/multi-memory binary regressions only
node tests/test-disassembler-memory.js

# Run strict UTF-8 and WAT string round-trip regressions only
node tests/test-disassembler-strings.js

# Run raw float, literal rounding and SIMD constant regressions only
node tests/test-disassembler-floats.js

# Run shared instruction records and initializer-boundary regressions only
node tests/test-instruction-decoder.js

# Run standalone module/type decoding and ownership regressions only
node tests/test-module-decoder.js

# Run structural delimiter/label/link regressions only
node tests/test-control-validation.js

# Generate expected outputs (requires wabt)
npm run test:generate

# Clean generated outputs
npm run test:clean

# Run all steps (clean, generate, test)
npm run test:all
```