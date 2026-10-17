# Pure-JavaScript WASM VM Roadmap

Status: implementation in progress; only checked items are completed.
Baseline date: 2026-10-16.
Design and source audit: [VM architecture](WASM_VM_ARCHITECTURE.md).

## Scope and rules

Build `assembler/wasm-vm.js` as a real binary interpreter without any native
WebAssembly dependency. Reuse a corrected decoder extracted from
[wasm-disassembler.js](../assembler/wasm-disassembler.js), not its WAT output.

The final target is the decoder's recognized semantic families, including
fixed-width SIMD, GC, modern EH and a separately pinned legacy EH compatibility
profile. Audited baseline inventory: 198 base + 18 FC + 29 FB + 236 FD = 481 entries.
After correcting cast variants, the decoder has 31 FB entries and 483 entries
overall; wrong binary encodings are
not compatibility requirements. No final release may silently defer a required
family while claiming parity.

Every task is incomplete until its tests run and pass. Native engines and
external tools may be optional development oracles, never runtime dependencies.
Do not label externally skipped tests as verified conformance.

Dependencies below are actual prerequisites, not just a suggested list order.
Each milestone ends with persistent code, regression tests and updated feature
status; do not accumulate unverified opcode stubs.

## Verified progress: initial decoder corrections (2026-10-16)

Preparatory M1 fixes are implemented in the existing decoder before extraction;
M0 and the full M1 exit gate remain open. This is not an executable VM yet.

- Standard sections now enforce the non-numeric order, uniqueness and exact
  payload consumption. Unknown section IDs are rejected; custom sections remain
  repeatable at arbitrary positions. The assembler now emits tags before globals.
- `array.len` consumes no immediate, preserving the following instruction.
- Unknown base/FB/FC/FD opcodes and truncated SIMD constants, shuffles and lane
  bytes are rejected. Shuffle/lane index ranges are checked.
- Each disassembly resets parsed sections and debug names; section bounds are
  restored even after a section parser fails.

Regression coverage:
[binary integrity](../assembler/tests/test-disassembler-integrity.js) and
[custom-section state](../assembler/tests/test-disassembler-custom-sections.js).
Verified: eight disassembler test groups, ten assembler fixture cases, six
assembly-only proposal cases, nine actual external WABT round trips, and five
static-linker scenarios. These counts do not establish VM execution coverage.
Nested reader boundaries, complete instruction/control validation, and the other
unchecked items below are still outstanding. The next batch supersedes the
initial GC/EH/element limitations.

## Verified progress: integrated GC, EH and element corrections

Implemented together in the assembler, disassembler and affected linker paths:

- All four standard `ref.test`/`ref.cast` variants now use their proper opcodes
  and a single heap-type immediate. Cast branches decode/encode flags before the
  label and preserve both reference-type operands.
- Signed s33 heap types distinguish positive type indices from abstract types,
  including indices 64 through 127 and the u32 maximum. The `exn` code is `0x69`;
  unknown abstract heap types and invalid cast flags are rejected.
- `try_table` retains all four catch forms, reads tag before label, and resolves
  handler labels in the surrounding control context. Catch grammar accepts
  numeric and symbolic labels; the generated parser was regenerated.
- Element flags 0 through 7 retain active/passive/declarative mode, offsets,
  implicit/explicit tables, function-index/expression vectors and reference types.
  The printer and assembler support the retained element forms.
- Static linking uses elemkind zero for index vectors, omits declarative offsets,
  retains reference-type bytes, and remaps typed element heap indices, `ref.func`
  indices and `ref.null` heap indices. Existing numeric shorthand `reftype`
  metadata remains compatible with consumers.

Evidence: [proposal binary regressions](../assembler/tests/test-disassembler-proposal-binary.js)
use independent byte fixtures, exact immediate bytes, malformed-input cases,
native GC result/trap checks, native modern-EH execution and an independent WABT
element round trip. Static-link regressions cover all eight element modes and
cross-module typed-reference remapping.

Verified in this environment: nine disassembler groups, ten assembler fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures, and the five existing static-linker scenarios. Native GC, modern EH
(with the engine's feature flag) and WABT proposal oracles all ran, without skips.
These are development oracles, not runtime dependencies. This batch does not
complete recursive types, nested bounded readers, a standalone validator, typed
IR, interpreter execution, or comprehensive GC/EH conformance.

## Verified progress: nested binary read boundaries

This preparatory decoder batch keeps the existing Buffer-based public API; it
does not yet extract the Uint8Array/DataView reader or the structured decoder.

- All section-parser LEB, byte, name and byte-vector reads now respect the
  current enclosing limit before advancing the cursor or slicing the input.
  Import/export names no longer read through the next section.
- Function-local declarations are parsed inside their function-body limit, not
  merely the code-section limit. Instruction byte views remain confined to the
  body, so a truncated immediate cannot consume the next function's bytes.
- Known name subsections use nested limits and require exact consumption.
  Unknown name subsections remain opaque and are skipped only within their
  declared bounds. Nested limits are restored after success and failure.
- Section/name/local-declaration vectors check their minimum byte requirements
  before iteration; data vectors check their full byte lengths before slicing.
  Invalid data-segment flags are explicitly rejected.
- Existing initializer integer/index/heap/float immediate scans now use bounded
  reads. Replacing that scanner with the shared decoder remains open (D11).

[Boundary regressions](../assembler/tests/test-disassembler-bounds.js) cover 108
section-payload truncations, oversized counts/byte lengths, adjacent function
bodies, adjacent name subsections, exact subsection consumption, legal padded
LEBs, opaque subsection payloads and retry after nested failures. Error assertions
also check the cursor has not crossed into the following container.

Verified after this batch: ten disassembler groups, ten assembler fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures and five existing static-linker scenarios. Editor diagnostics and
`git diff --check` are clean. M1 remains open: no complete type/control validator,
recursive type support, shared instruction IR, resource-budget policy, or
standalone binary reader has been completed by this batch.

## Verified progress: recursive, subtype and reference type preservation

The existing decoder now retains a flattened `typeSection` index space together
with `typeGroups` (recursive/singleton groups, start index, size and byte ranges).
Each composite type retains its byte range and explicit/implicit subtype wrapper,
finality and supertype indices. Function, struct and array descriptors preserve
numeric/vector/reference value types, packed storage and field mutability.
Malformed type forms, unknown value/reference codes and invalid mutability bytes
are rejected rather than silently becoming `i32` or empty type objects.

Explicit references are also retained in imported/defined tables and globals,
locals, block results and typed-select vectors. Abstract heap types and positive
s33 heap indices remain distinct. The shared value-type decoding helper is
bounded by each existing reader/container; it is not yet a standalone typed IR.

The printer emits standard `(rec (type ...))`, subtype indices, struct fields
and array storage types, including `(mut ...)`. The assembler and canonical
grammar/parser accept these forms, preserve forward named references in recursive
groups, and encode complete reference types at the affected surfaces. Previously
accepted legacy `(type (rec ...))`, wrapped supertype uses and field-mutability
forms remain accepted for compatibility; generated WAT uses standard syntax.

The static linker now explicitly rejects recursive groups, nontrivial subtypes,
aggregate types and explicit reference signatures/locals that its current
interning/remapping cannot preserve. It does not silently flatten them to plain
function signatures. This is a deliberate supported-scope guard, not full GC
linking support.

[Type regressions](../assembler/tests/test-disassembler-types.js) cover independent
binary fixtures, recursive forward references, subtype metadata, packed and
reference fields, every currently mapped abstract reference value type,
s33 type index 64, all affected reference surfaces, malformed/truncated types,
legacy syntax compatibility, linker rejection and state reset. Native GC
validation and a typed-reference function invocation check the source and rebuilt
binaries. These native oracles ran here; engines without GC explicitly skip them
while still running byte/metadata tests. A separate round trip runs with the
`WebAssembly` global removed.

Verified: eleven disassembler groups, ten assembler fixtures, 41 native-valid
assembler cases, six assembly-only proposal cases, ten parser fixtures and five
existing static-linker scenarios. Recursive type canonicalization, subtype
validity, index/type/control validation, shared module/instruction IR and the VM
remain unimplemented. Parsing/preservation does not establish semantic validity.

## Verified progress: memory32, multi-memory and memory immediates

The decoder now consumes complete u32 indices for `memory.size`/`memory.grow`
and retains nonzero indices in WAT. Scalar and SIMD memory operands decode the
alignment/index flag field, optional memory index and u64-encoded offset in the
specified order. The supported memory32 profile explicitly rejects offsets above
u32; valid padded offset encodings are accepted without losing precision.
Natural alignment bounds are checked for all 23 scalar and 22 SIMD memory
instructions, using a shared assembler/disassembler descriptor helper.

Memory/table declarations reject unsupported shared/64-bit/unknown limits flags
before reading their payload. Limits retain legal padded u64 encodings, reject
values outside the supported u32 address profile, and check minimum/maximum
ordering. Memory32 additionally enforces the 65536-page ceiling; tables are not
incorrectly limited by the memory-page ceiling.

The assembler/parser preserve numeric and named memory operands, optional
offset/alignment attributes and SIMD memory-lane operands. Omitted alignment
uses each instruction's natural alignment, not a silent zero exponent.
`memory.init` now uses standard text order `memory.init memoryidx dataidx`
(or `memory.init dataidx` for memory zero), while binary order is data then memory.
The old reversed two-operand interpretation was a shared nonstandard encoding,
not an intentionally retained dialect. Its existing fixture was corrected.

Static linking now remaps both implicit memory zero and explicit memarg indices.
Active data segments follow their remapped target memory (including conversion
from flags 0 to flags 2), and data offset expressions use index rewriting.
Passive data does not require an imported memory. SIMD rewriting remains outside
the static linker's supported instruction scope and is explicitly rejected.

Specification basis: the already pinned reference interpreter's `limits`,
`memorytype`, `tabletype`, `memop` and instruction decoding routines
([decode.ml](https://github.com/WebAssembly/spec/blob/340650f2f620169685814774bc5b019d05d4d3d7/interpreter/binary/decode.ml)).
[Memory binary regressions](../assembler/tests/test-disassembler-memory.js)
exercise all 45 access layouts, all legal alignment exponents, malformed flags,
truncated/oversized indices and offsets, named memories, padded values and
unsupported address profiles. Independent multi-memory binaries and rebuilt WAT
were executed to compare results, memory effects, growth, SIMD lane access and
out-of-bounds traps. WABT independently assembled the multi-memory output and its
result executed successfully. Native/WABT oracles ran without skips here;
unsupported environments report explicit skips. Round trips also run with the
native `WebAssembly` global removed.

Verified: twelve disassembler groups, ten strict-hash assembler fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures and five existing static-linker scenarios, plus the new memory-specific
static-link tests. Only the memory fixture snapshot changed when regenerated,
due to natural default alignment. The new helper is included in the npm package
file list and `npm pack --dry-run` was checked. M1 remains open: shared-reader/IR
extraction, initializer decoder unification, UTF-8/string/float preservation and
complete structural/type/control validation are not completed by this batch.

## Verified progress: fatal UTF-8 and WAT string fidelity

All decoded binary names now use fatal UTF-8, including import module/field
names, exports, custom section names and the currently interpreted name
subsections. Invalid, overlong, surrogate and out-of-range sequences fail
explicitly instead of becoming replacement characters. A genuine U+FFFD remains
valid, and a leading U+FEFF is preserved as name content rather than stripped.
Arbitrary data bytes and opaque custom payloads are not subjected to name
decoding.

A shared string helper quotes import/export names and data in WAT using exact
UTF-8 byte escapes for quotes, backslashes, controls and non-ASCII bytes.
The assembler decodes name escapes rather than emitting literal backslash text,
supports byte/simple/Unicode-scalar escapes and correctly encodes supplementary
Unicode characters. Invalid escapes, lone surrogates and unescaped string
controls are explicitly rejected. Name bytes must decode to UTF-8; data strings
remain arbitrary byte vectors and concatenate without accidental text decoding.

Compatibility normalization now scans code separately from strings/comments,
so opcode-like text inside names/data cannot be rewritten. Strings are converted
through the shared byte decoder to canonical quoted bytes before the generated
UTF-16 lexer runs; this accommodates astral scalars without modifying generated
parser code or the parser generator. The CLI no longer strips `;;` and everything
after it from string content before assembly.

[String regressions](../assembler/tests/test-disassembler-strings.js) cover
independent binary names, native import/export identity, controls and comment
markers, leading BOM, astral/noncharacter scalars, all 256 data bytes, concatenated
data strings and 16 malformed UTF-8 sequences at all interpreted name surfaces.
They check malformed escapes, exact byte preservation, failure recovery, opaque
custom payloads, the actual CLI and operation with the `WebAssembly` global
removed. WABT independently assembled all escaped-name fixtures without skips.
Native execution is a test oracle only, not a string-helper/runtime dependency.

Verified: thirteen disassembler groups, ten strict-hash assembler fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures and five existing static-linker scenarios. Package dry-run includes the
shared string helper. Float raw-bit preservation, shared module/instruction IR,
initializer decoder unification and full type/control validation remain open;
this batch does not complete M1 or implement the VM.

## Verified progress: raw float constants and SIMD lane fidelity

Scalar `f32.const`/`f64.const` rendering now reads the immediate bits directly,
without converting through a JavaScript Number. Finite values use exact
hexadecimal significand/exponent notation, infinities use `inf`, and NaNs retain
their explicit fraction payload and sign. Positive/negative zero, subnormals,
signaling/quiet NaNs and the full payload range therefore survive WAT round
trips in both function bodies and global initializers. This intentionally changes
the float text spelling; the binary value is unchanged.

The shared [float helper](../assembler/wasm-floats.js) assembles decimal and
hexadecimal literals using exact BigInt ratios and a single ties-to-even rounding
at the target precision, including gradual underflow. It does not route f32 text
through f64 first. Explicit NaN payloads never pass through a host NaN value.
Invalid/zero/oversized payloads, missing operands and finite-literal overflow
fail explicitly; sufficiently small finite values round to signed zero.
The canonical grammar/parser now accept signed integer float operands, trailing
decimal points and digit separators in fractional/exponent/payload forms.
This is not a claim of complete WAT lexical conformance.

The coupled `v128.const` writer now honors all six declared lane shapes instead
of packing every number as one byte. Floating lanes use the same exact codec;
integer lanes preserve their declared width and validate the representable signed
or unsigned range. The existing `08-simd` fixture's `i32x4 1 2 3 4` binary snapshot
was corrected through the repository's existing generator. Other snapshots were
unchanged by this batch. The assembler still does not provide all integer literal
spellings or full SIMD semantic validation.

[Float regressions](../assembler/tests/test-disassembler-floats.js) cover
independent raw binary function/global fixtures for both signs and edge classes,
8,192 deterministic bit-pattern round trips, 1,024 native decimal comparisons,
normal/subnormal midpoint and double-rounding cases, truncated immediates and
invalid literal errors. Native execution checks exact scalar reinterpretation
and all six SIMD shapes stored into memory, before and after reconstruction.
Scalar module round trips also run with `WebAssembly` removed. WABT verifies full
disassembled-module byte identity, scalar literals and every SIMD lane shape.

Oracle qualification: installed WABT 1.0.39 rounds `0xffffffp-150` (f32) and
`0x1fffffffffffffp-1075` (f64) down to the largest subnormal, rather than to the
even minimum normal. The tests explicitly report these two version-specific
disagreements, assert the observed lower bit pattern, and separately verify
IEEE rounding with native f32 conversion and native f64 parsing of the exact
decimal midpoint. They do not silently adopt the external tool's result.
Other mismatches fail. The specification basis remains the pinned reference
[text values](https://github.com/WebAssembly/spec/blob/340650f2f620169685814774bc5b019d05d4d3d7/document/core/text/values.rst).

Verified: fourteen disassembler groups, ten strict-hash fixtures, 41 native-valid
assembler cases, six assembly-only proposal cases, ten parser fixtures and five
existing static-linker scenarios. All available native/WABT checks ran, with the
two qualified disagreements above. The new helper is included in the npm package
dry-run. Existing numeric primitive test helpers retain their Number-returning
interface; instruction formatting no longer depends on them.

M1 remains open. These changes preserve bits in the current raw instruction
buffers and printer, not in a newly extracted typed instruction IR. Shared-reader
and IR extraction, initializer decoder unification and complete structural/type/
control validation still need implementation. No VM execution engine is added.

## Verified progress: shared structured instruction decoder and expressions

Instruction byte parsing is now separate from WAT rendering. Existing primitive,
value-type and reverse opcode tables were moved without duplicating their
definitions into [wasm-binary.js](../assembler/wasm-binary.js).
[wasm-reader.js](../assembler/wasm-reader.js) provides bounded Uint8Array reads
and byte-offset-correct DataView access for instruction float bits.
[wasm-instructions.js](../assembler/wasm-instructions.js) decodes named immediate
records, and [wasm-instruction-wat.js](../assembler/wasm-instruction-wat.js) is the
sibling printer. The old monolithic byte-to-WAT instruction decoder was removed.
The existing `WasmDisassembler.decodeInstructions` string-array API is preserved
as a decoder/printer adapter.

Records carry `opcode`, optional `subopcode`, `name`, `offset`, `endOffset` and
`immediates`. Indices, branch vectors, block signatures, explicit reference
types/nullability, heap types, memargs and all four `try_table` catches are retained
without WAT strings. Signed i64 immediates use BigInt; f32/f64 hold raw unsigned
Number/BigInt bits respectively; v128 constants hold copied Uint8Array bytes.
Nonnegative signed-s33 heap values remain indices, while negative values remain
abstract heap encodings. This is an instruction-level IR, not the final validated
module/type/store representation.

`decodeExpression` finds the outer `end` using the same immediate decoder,
tracking nested block depth instead of scanning bytes. Global initializers,
active data/element offsets and element expression items use that shared path.
Embedded `0x0b` bytes in vectors, heap/type indices and other immediates cannot
terminate an expression early. Unknown opcodes or truncated immediates fail
within the containing section/body. Parsed initializer records are retained in
`WasmDisassembler.expressions`; function bodies retain `codeOffset` and
`instructions` alongside the legacy `locals`/`code` fields.

Function bodies now require an outer terminator, complete nested block closure,
and no bytes after the outer terminator. This deliberately rejects malformed
bodies previously tolerated by flat printing. It is not full control validation:
`else`/catch placement, branch depths, signatures, stack typing, legal constant
operations and module indices remain validator work. The flat decode API still
accepts instruction fragments without an outer `end`.

The coupled printer now emits multiple global initializer/active data-offset
instructions as a sequence, rather than folding all operations into the first
instruction. Extended-constant arithmetic was checked by execution and WABT.
Another independently verified correction is `table.init`: binary order is
element/table, whereas WAT operands are table/element. Decoder, assembler and the
obsolete immediate fixture now agree with that order. The static linker already
used the correct binary order; distinct-index execution verifies compatibility.

[Shared-decoder regressions](../assembler/tests/test-instruction-decoder.js)
exercise all 483 recognized opcode variants, exact next-instruction boundaries
and 719 truncated prefixes. They directly assert immediate record shapes,
nonzero view/base offsets, nested read limits, padded LEBs, raw float/vector
ownership and vector-count preflight checks. Independent binaries test SIMD/GC
initializers containing `0x0b`, adjacent expressions, error recovery and missing/
trailing function terminators. Native execution and WABT test nonzero/distinct
`table.init` operands and extended constants; static linking executes the table
case too. Native GC/extended-constant oracles explicitly skip on older engines.
A fresh process loads and runs the shared instruction decoder with both
`Buffer` and `WebAssembly` removed, not merely with the native engine unused.

Verified: fifteen disassembler groups, ten unchanged strict-hash fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures and five existing static-linker scenarios. Native/WABT oracles ran
without skips here. Package dry-run includes all four extracted/new modules.

M1 is still incomplete: section/type parsing remains in the Buffer-based
disassembler, a standalone decoded-module API and canonical recursive-type IR are
not extracted, and the planned feature/validator/execution registry is not built.
The legacy numeric primitive test helpers remain Buffer-specific. The shared
reader borrows its input and records are mutable; compilation-time ownership,
immutability, resource limits and browser packaging remain future work. The
linker's separate rewriting walkers have not been migrated to the new decoder.
No validator or VM execution engine is added by this batch.

## Verified progress: standalone module and structured type decoding

[wasm-module.js](../assembler/wasm-module.js) now owns section/type decoding,
independent of the disassembler and WAT printer. `decodeModule(bytes,
{ copyInput = true })` accepts a Uint8Array (including Buffer) and returns a plain
decoded record. It copies the exact input view by default; an explicit
`copyInput: false` borrows the input instead. Header checks use a byte-offset-
correct DataView, and sections, nested name subsections, bodies, byte vectors,
LEBs, names and value types use the shared bounded Uint8Array reader. Existing
numeric primitive test helpers now also support Uint8Array subviews via DataView.

Module records retain the existing `typeSection`, `importSection`,
`functionSection`, etc. names rather than introducing a second set of aliases.
They include the source bytes, binary version, ordered section ranges and custom
payload views. Types retain numeric value/storage codes or explicit
`{ kind: 'ref', nullable, heapType }` descriptors, including function signatures,
fields, tables, globals, imports, locals and element types. Recursive groups and
subtype finality/supertypes retain their existing ranges and flattened indices;
canonical equivalence/subtyping validation is not implemented.

Initializer records are directly attached to their owning global, data or element
entry as `initializer`, `offsetExpression` or `elementExpressions`, in addition
to the module-level `expressions` list. Function bodies retain binary
`offset`, `payloadOffset`, `codeOffset` and `endOffset` plus locals, code bytes and
structured instructions. Not every declaration has a per-entry source range yet.

`WasmDisassembler` now subclasses the shared parser and is a compatibility/WAT
adapter: it preserves existing string-valued signatures and explicit reference
types for linker consumers while the standalone decoder never formats types as
WAT. Existing parser helpers and instruction-string entry points remain usable.
Disassembly additionally accepts plain Uint8Array views. Unknown import/export
kinds and nonzero tag attributes are now rejected explicitly instead of being
silently ignored or dropped.

[Module regressions](../assembler/tests/test-module-decoder.js) include an
independent binary containing all 13 standard section IDs, all five import/export
kinds, start, local/imported resources, data-count, custom/name metadata and
nonzero memory/table targets. Tests cover structured recursive/subtype/packed/
reference types and all eight element forms; default copy ownership versus
explicit borrowing; nonzero byteOffset views; 51 nested payload truncations;
reserved kinds/attributes; and reusable decoder recovery without mutating
previous results. The nine existing successful binary snapshots are also decoded
directly and compared with the compatibility adapter's instruction records.

A fresh process removes Buffer and WebAssembly before loading the module decoder
and decoding both all-section and recursive-reference fixtures. It also asserts
that neither the WAT printer, disassembler nor assembler was loaded. Native
execution checks the all-section source, rebuilt binary and independent WABT
output: imported start invocation, result, globals, table content and data memory
effects. Native proposal oracles and WABT explicitly skip if unavailable; all ran
here. The WABT fixture enables multi-memory and exception tags explicitly.

Verified: sixteen disassembler groups, ten unchanged strict-hash fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures and five existing static-linker scenarios. Package dry-run includes
`wasm-module.js` and its shared dependencies. No snapshots changed in this batch.

M1 remains open: this is binary decoding, not a semantic validator. Full control
placement/stack/module checks, legal constant operations, recursive type
canonicalization, complete per-declaration source spans, feature/handler registry,
resource limits, immutable compilation and browser packaging remain unfinished.
Records are mutable; even the default copied source can be changed through the
returned object. The stateful `ModuleDecoder` borrows input, and the legacy
disassembler/linker still use their previous ownership model. Do not execute
unvalidated decoded records as though compilation were complete. No VM runtime
is implemented by this batch.

## Verified progress: structural control framing and label links

Added `assembler/wasm-control.js`, an iterative record-based analyzer shared by
expression decoding and module function parsing. It does not parse bytes, format
WAT, invoke native WebAssembly or recursively traverse JS call frames.

Expression framing now rejects `else` outside the immediately enclosing `if`,
duplicate `else`, legacy catches outside the immediately enclosing `try`, and
any handler after `catch_all`. Catch-less legacy `try` and repeated tagged
catches remain accepted. Functions always check label depths for `br`, `br_if`,
`br_table` (every target and its default), reference/cast branches and `rethrow`,
including unreachable instructions. `try_table` catch labels are checked against
the surrounding context before its own label is pushed; function-label exits
are supported. Legacy `rethrow` targets must be active catch frames, not merely
some enclosing block or a try whose catch has not been entered.

Modern label-context behavior follows the pinned reference validator's
`TryTable` case (`check_catch c`, not `c'`). Legacy placement/rethrow rules are
grounded in the [archived EH explainer at
af287a73d8f3bf7ea216c10592f9e350b947c4f2](https://github.com/WebAssembly/exception-handling/blob/af287a73d8f3bf7ea216c10592f9e350b947c4f2/proposals/exception-handling/legacy/Exceptions.md).
This evidence pin does not complete M0's required historical conformance corpus.

Decoded function bodies now expose `control: { frames, branches }`; expressions
also return structural control metadata. Frames retain parents, open/end/else
indices and legacy handler positions. Branch targets retain frame identity and
instruction destinations: loop body entry, after-end continuation or function
exit. Modern catch records retain catch-vector positions; legacy rethrows retain
the active handler index instead of pretending to be normal jumps.
`analyzeFunctionControl(instructions)` exposes the same pass independently.
Indices address decoded instructions, not bytes. No original instruction record
is mutated. The exact mutable metadata contract is documented in the
[architecture](WASM_VM_ARCHITECTURE.md#current-structural-control-api).

This intentionally tightens module acceptance: invalid placements/depths
previously printed as WAT now fail with instruction name and binary offset.
Flat `decodeInstructions` and the legacy instruction-string API still decode
fragments without requiring control context. Existing proposal immediate tests
using depth 130 or catch depths 5-8 now supply actual surrounding blocks rather
than bypassing the function checks. Their immediate bytes are unchanged.
Initializer framing shares delimiter checks; legal constant operations remain a
separate unfinished validation task.

`test-control-validation.js` checks exact nested block/loop/if/function targets,
seven independent valid and 26 invalid function binaries, all reference-branch
forms, maximum-u32 label rejection, unreachable labels, initializer delimiters,
legacy handlers/rethrow and all four modern catch forms. A 20,000-block binary
checks iterative module/control decoding, and decoder reuse checks recovery after
failure. A fresh process removes Buffer/WebAssembly before module analysis.
Native execution checks both arms of source/rebuilt conditionals, and independent
WABT output checks multi-value/type-index blocks and legacy EH. Native modern EH
with its explicit engine flag checks all four catch kinds and surrounding-context
off-by-one rejection. External/proposal oracles report explicit skips if absent;
all ran in this environment.

Verified: seventeen disassembler groups, ten unchanged strict-hash fixtures,
41 native-valid assembler cases, six assembly-only proposal cases, ten parser
fixtures and five static-linker scenarios. No binary snapshots changed in this
batch. The package includes the new shared analyzer.

M1/M2 remain open. Structural frame links do not validate operand stacks, block
signatures, branch arities, catch payloads, type/index spaces, constant legality
or module relationships; these links are not safe executable IR. Recursive type
canonicalization, resources, immutable compilation and the VM runtime are still
unfinished.

## M0. Freeze the executable contract and coverage inventory

Dependencies: none.

- [ ] Record the inspected source revision and opcode name/code inventory.
- [ ] Pin the official specification/reference corpus revision. Start from the
  reference commit cited in the architecture, then explicitly record any changes.
- [ ] Pin a historical specification/corpus for the required legacy EH profile.
- [ ] Create a machine-readable manifest of binary variants, immediate layouts,
  features, section/type constructs, validator rules, handlers and test IDs.
- [ ] Define the final required profile and named partial milestone profiles.
  Keep memory64/table64, shared memory/atomics, relaxed SIMD, component binaries
  and host ABIs such as WASI explicitly outside the baseline.
- [ ] Define public errors, host ABI, supported JS environments, input ownership,
  resource limits and synchronous invocation/reentrancy policy.
- [ ] Add an independence test harness which can poison/remove the WebAssembly
  global without loading existing native-dependent round-trip tests.

Exit gate: the manifest contains every inspected variant, plus its explicitly
recorded standards corrections; missing implementation is visible, not a no-op.
Each exclusion is classified as outside baseline or an unfinished required item.

## M1. Extract and harden the shared binary decoder

Dependencies: M0.

- [ ] Extract reusable reader algorithms and opcode descriptors without duplicating
  them; preserve `disassembleWASM` and `WasmDisassembler` entry points.
- [x] Extract primitive/type/opcode table definitions and a shared structured
  instruction/expression decoder; keep WAT formatting in a separate printer and
  preserve the legacy instruction-string API.
- [x] Implement Uint8Array/DataView reading with byte-offset-correct subviews and
  nested bounds for sections, bodies, subsections and vectors (D02).
- [x] Apply nested bounds to existing Buffer-based section parsers, function
  bodies and known name subsections; check vector byte requirements before
  iteration/slicing and restore enclosing limits after failures (part of D02).
- [ ] Retain s32/s64/s33 and u32 width checks, legal padded LEB forms, and exact
  consumption; retain signed i64 as BigInt.
- [x] Decode names with fatal UTF-8, and retain float/vector raw bits (D13).
- [x] Use fatal UTF-8 for all interpreted binary names, preserve a leading BOM,
  and round-trip escaped names and arbitrary data bytes (part of D13).
- [x] Render scalar floats from their raw bits and assemble literals with exact
  target-width rounding; preserve signed zero, infinities and NaN payloads in
  function/global round trips and encode SIMD constants by their lane shape.
- [x] Carry raw float/vector constants into extracted instruction records:
  f32 unsigned Number bits, f64 BigInt bits and copied v128 Uint8Array bytes.
- [x] Extract standalone module/section/type decoding with structured references,
  default input copying, section/body ranges and owned-expression links; preserve
  the disassembler's legacy type surfaces through a compatibility adapter.
- [x] Enforce standard section order, uniqueness, exact payload consumption and
  recognized section IDs; keep custom sections repeatable (D01).
- [ ] Complete reserved-value/flag validation and nested read boundaries in every
  supported feature path (D01-D02); shared-reader migration does not establish
  complete binary conformance or semantic validation.
- [x] Reject unknown import/export kinds and nonzero imported/local tag attributes
  rather than losing them during formatting.
- [x] Reset mutable disassembler state between calls and restore section bounds
  after a parse failure (part of D14).
- [ ] Produce complete decoded module/type/instruction records with byte ranges,
  independent of WAT formatting and mutable disassembler state (D14).
- [x] Decode recursive groups, subtype metadata, full reference/storage types and
  separate abstract heap types from positive type indices (D03, D06).
- [x] Correct `array.len` to consume no immediate, with independent byte regressions
  that check the following instruction (D04).
- [x] Correct all four test/cast variants and cast-branch operand order; add
  independent binary regressions (D05).
- [x] Correct `try_table` catch operand order and preserve catch records (D07).
- [x] Decode element flags 0 through 7 explicitly, including declarative and
  expression forms; preserve all modes (D08).
- [x] Preserve memory indices, correct multi-memory memargs, reject unsupported
  limit/address features and decode all size/grow index bytes (D09).
- [x] Reject unknown base/FB/FC/FD opcodes; bound vector, shuffle and lane
  immediates, and check shuffle/lane ranges (part of D10).
- [ ] Complete instruction/body/control boundary validation and remaining
  immediate constraints, including alignment (D02, D10, D12).
- [x] Require a function's outer `end`, nested block closure and exact instruction
  consumption; retain separate unfinished control/stack/module validation.
- [x] Validate `else`/legacy handler placement and ordering in expression framing;
  retain separate unfinished constant-expression legality checks.
- [x] Replace initializer byte scanning with the shared instruction decoder (D11).
- [ ] Complete WAT rendering for retained types/segments/catches and escaped
  strings; update directly coupled assembler encodings and obsolete test vectors
  where necessary instead of preserving shared nonstandard encodings.
- [x] Escape import/export names and data with shared WAT string helpers; decode
  assembler name escapes and preserve supplementary Unicode scalars; keep code
  normalization and CLI comment handling from modifying strings.
- [ ] Keep optional debug metadata bounded and non-semantic; retain opaque
  custom payloads without requiring a metadata decoder.

Exit gate: all D01-D11 decoder regressions and D13-D14 representation/printer
regressions have tests; every accepted instruction consumes exactly its defined
bytes. Existing relevant suites continue to pass after justified standards-based
expectation changes. Repeated parsing/printing cannot accumulate previous state.

## M2. Implement validation and prelinked control

Dependencies: M1.

- [ ] Validate each module index space and imported-before-defined numbering.
- [ ] Validate function/code counts, exports, start signature, limits, tag
  signatures, segment types/indices and data-count rules (D12).
- [ ] Implement recursive type canonicalization/equivalence and declared subtype
  validation, including finality, mutability and nullability.
- [ ] Implement operand/control-stack validation, multi-value blocks/functions,
  branch arities, block parameters and unreachable-stack polymorphism.
- [x] Validate function branch depths, modern catch surrounding-label contexts
  and legacy rethrow active-catch contexts, including unreachable instructions.
- [ ] Validate typed/untyped select, indirect/ref calls, tail-call result
  compatibility, non-defaultable local initialization and `ref.func` declarations.
- [ ] Add memory, table, SIMD, GC and modern/legacy EH validator rules. Rules may
  ship incrementally with corresponding milestones, but disabled rules must cause
  a compile-time UnsupportedFeatureError, even in unused functions.
- [ ] Validate constant expressions per feature/context; do not reuse arbitrary
  runtime evaluation as a validation shortcut.
- [ ] Precompute end/else matches, block signatures, branch metadata and handler
  descriptors for execution.
- [x] Retain structural frame parents/end/else matches, legacy handler positions
  and branch/modern catch targets as instruction-index links; no stack signatures
  or operand/handler payload types are inferred by this pass.
- [ ] Freeze/copy compiled module state so caller mutation cannot invalidate it.

Exit gate: malformed/invalid modules fail without native validation. A declared
enabled feature cannot lack typing rules. Official positive/negative subsets and
independent invalid-body tests pass; no invalid function is accepted because it
is unreachable from exports.

## M3. Deliver an executable core and host ABI

Dependencies: M2 for the core feature profile.

- [ ] Implement the store, instance index maps, compiled functions, typed globals
  and VM-owned resource identities.
- [ ] Add an iterative dispatch loop with explicit operand/call/control stacks.
- [ ] Implement unreachable/nop/drop/select, locals, globals and i32 primitives.
- [ ] Implement block/loop/if/else/end, br/br_if/br_table, return, multi-value
  calls/results and direct calls, including the implicit function label.
- [ ] Implement typed host function adapters, exact import lookup, result
  validation and export wrappers; reject synchronous Promise results.
- [ ] Execute validated global initializers, resolve exports and run start exactly
  once before returning an instance.
- [ ] Implement distinct decode/validation/link/trap/guest/resource/host errors
  with byte/function context and cleanup of failed activations.
- [ ] Test shared resource identity, cross-instance calls, host callbacks,
  reentrancy and error recovery without native resource constructors.

Exit gate: independent binary arithmetic/control modules execute with expected
results and side effects while WebAssembly is unavailable. Deep guest calls use
VM frames, not recursive JS interpreter calls.

## M4. Complete scalar numeric semantics

Dependencies: M3.

- [ ] Implement every mapped i32 and i64 integer operation using correct wrapping,
  signed/unsigned interpretation, shifts, rotates and bit counts.
- [ ] Cover division traps, signed minimum/-1 division versus remainder, and
  i64 values above Number's exact range.
- [ ] Implement f32/f64 with bit-preserving constants, loads, stores and
  reinterpretation; define internal raw-bit representations.
- [ ] Implement signed zero, NaNs, infinities, ties-to-even nearest, min/max,
  copysign and required rounding, adding software helpers when needed.
- [ ] Implement all trapping and FC saturating numeric conversions with exact
  boundary behavior.
- [ ] Complete numeric typing and host scalar/multi-result ABI tests.

Exit gate: all scalar/FC-conversion manifest rows have passing behavioral tests,
including integer extremes, float bit patterns and permitted NaN assertions.
There are no Number-based i64 arithmetic shortcuts.

## M5. Complete memories, tables, segments and bulk operations

Dependencies: M3; M4 for the complete numeric load/store set.

- [ ] Implement VM memory32 resources, nonzero memory indices, limits, growth,
  zeroing and host-view invalidation; distinguish growth failure from traps.
- [ ] Implement every scalar load/store width and sign extension, little-endian
  access, non-wrapping effective addresses and unaligned ordinary access.
- [ ] Implement typed tables, get/set/size/grow/fill and function-reference identity.
- [ ] Implement call_indirect checks for bounds, null and signature compatibility.
- [ ] Instantiate active/passive/declarative element segments and active/passive
  data segments with the correct lifecycle and separate per-instance state.
- [ ] Implement memory.init/copy/fill/data.drop and table.init/copy/elem.drop.
- [ ] Test full prechecks, overlapping ranges, zero-length edge cases, repeated
  drop, nonzero table/memory indices and shared imported resources.
- [ ] Follow instantiation/start sequencing; test observable imported-resource
  effects on failure rather than assuming transactional rollback.

Exit gate: every mapped memory/table/segment operation executes; tests compare
complete affected bytes/references and trap behavior, not only return values.

## M6. Complete typed references and tail calls

Dependencies: M2 type system, M3, M5.

- [ ] Implement ref.null/is_null/func/as_non_null/eq and null-refinement branches.
- [ ] Implement typed function references and call_ref.
- [ ] Implement return_call, return_call_indirect and return_call_ref as frame
  replacement, including imported/host targets and exception-handler cleanup.
- [ ] Complete cross-instance function/type equivalence tests and reference ABI.

Exit gate: null/type failures trap correctly; deep tail recursion has bounded
guest call depth. Function references preserve identity across exports/imports.

## M7. Complete fixed-width SIMD

Dependencies: M4, M5; SIMD validator rules from M2.

- [ ] Implement an owned, non-aliasing v128 value and explicit lane ordering.
- [ ] Implement vector memory operations, lane loads/stores, constants,
  extract/replace, splats, shuffle and swizzle.
- [ ] Implement integer arithmetic, saturation, widening/narrowing, shifts,
  comparisons, masks, pairwise operations and dot/extmul operations.
- [ ] Implement vector float arithmetic/conversions and distinct min/max versus
  pseudo-min/max behavior.
- [ ] Supply a checked v128 host adapter without native WASM resources.
- [ ] Test every one of the 236 currently mapped FD variants individually, with
  lane boundaries, exact vector bits and applicable traps.

Exit gate: all baseline SIMD variants pass independent execution tests with
WebAssembly unavailable; no SIMD operation falls back to native WASM.

## M8. Complete GC and the reference heap

Dependencies: M2 recursive type system, M5 segments, M6 references, M4 numeric bits.

- [ ] Implement branded struct/array/i31/external references and canonical runtime
  type identities, with JavaScript GC reclaiming unreachable cycles.
- [ ] Implement struct construction/defaults/get/set, mutability, packed fields
  and required defaultability validation.
- [ ] Implement array creation/defaults/fixed/data/elem, length, get/set/fill/copy
  and data/element initialization.
- [ ] Implement i31 creation and signed/unsigned extraction.
- [ ] Implement test/cast variants, cast branches, nullability, heap subtyping,
  reference equality and external/internal conversion identity.
- [ ] Test recursive/mutually recursive types and equivalent types across modules,
  subtype failures, aliasing, null traps, dropped segments and range checks.
- [ ] Check for strong registry leaks; document allocation-budget policy without
  claiming exact visibility into the host JavaScript collector.

Exit gate: every corrected baseline FB variant passes decode/validation/execution
tests against independent standard binaries; GC does not depend on lossy WAT or
on module-local numeric indices as global type identity.

## M9. Complete modern and legacy exception handling

Dependencies: M3 frames/host errors, M6 reference/tail-call unwind, M8 exn heap typing.

- [ ] Implement VM tags, imported tag identity and typed guest exception payloads.
- [ ] Implement try_table catch/catch_ref/catch_all/catch_all_ref destinations and
  payload/ref delivery, throw, throw_ref and cross-frame unwinding.
- [ ] Implement uncaught guest-exception reporting and host propagation using the
  documented explicit guest-exception adapter.
- [ ] Implement the required legacy try/catch/catch_all/rethrow profile against
  its pinned historical specification, not by guessing from modern EH.
- [ ] Test handler ordering, nested handlers, rethrow depth, matching and
  nonmatching tag identities, tail calls, host callbacks and null exception refs.
- [ ] Prove that WASM traps, fuel exhaustion and arbitrary host JS errors are not
  swallowed as guest exceptions.

Exit gate: modern and legacy feature profiles each pass their relevant corpus
and cross-instance behavioral tests. Required legacy forms are not silently
removed from the target to achieve a green modern-only build.

## M10. Resource control and deployment hardening

Dependencies: M3 for the first version; repeat on M5-M9 additions.

- [ ] Enforce configurable input/count/type-graph/locals/instruction/depth limits
  before expansion, validation work or allocation.
- [ ] Enforce invocation fuel shared through start, nested calls and reentrancy;
  charge bulk/numeric/allocation helpers proportionally.
- [ ] Add bounded cancellation checks and document synchronous host-call limits.
- [ ] Define reusable instance/module state after traps, exceptions, host failures
  and cancellation; test cleanup without unintended side-effect rollback.
- [ ] Provide feature/capability reporting, stable diagnostic codes and optional
  bounded tracing with original binary offsets.
- [ ] Add a browser entry/build and tests without Buffer or Node-only imports.
- [ ] Verify package publication includes all VM/shared-decoder modules; keep
  native engines and external tool harnesses out of the runtime import graph.

Exit gate: stress inputs fail with explicit documented errors, not unbounded JS
recursion or silent defaults. Node and browser execute the same binary samples
without the WebAssembly global. Strong process isolation remains an embedding
responsibility, not a sandbox guarantee of the interpreter.

## M11. Integration, conformance and final parity gate

Dependencies: M1-M10, including every required feature-specific validator rule.

- [ ] Adapt pinned official tests into binary-driven decode/validate/execute/trap
  assertions; maintain a machine-readable exclusions/skip report.
- [ ] Add an optional differential runner using independent native/reference
  engines only in separate test processes; compare results, state and errors.
- [ ] Add cross-feature tests: SIMD with bulk memory, GC with table references,
  EH with host imports and tail calls, and multiple linked instances.
- [ ] Execute the existing C89 mini-suite's `test_entry` exports with reviewed
  expected results and explicit host imports; do not count compile/validate-only
  results as execution tests.
- [ ] Add deterministic generated cases and malformed-byte mutation tests under
  work/memory budgets; preserve minimal reproductions for regressions.
- [ ] Run current assembler/disassembler regression suites and report actual
  external-oracle availability separately from aggregate PASS status.
- [ ] Publish coverage for decoding, validation, execution and behavioral tests
  independently; audit the registry for missing handlers and stale variants.
- [ ] Document API examples, resource limits, capabilities, legacy profile
  selection, known exclusions and failure behavior.
- [ ] Profile real workloads only after correctness gates; optimize without
  removing bounds, typing, bit fidelity or native-independence checks.

Final exit gate: every required manifest row is implemented and tested; no
required-feature conformance tests are skipped; mandatory engine-free suites pass
in Node and browser; all intended exported functions in integration fixtures
execute with verified observations. No native execution, no unknown-opcode
fallback, and no fabricated default value/type is accepted.

## Coverage ledger

Generate this ledger from the manifest rather than hand-maintaining percentages:

| Family/construct | Decode | Validate | Execute/instantiate | Behavior/traps | Independent fixture |
|---|---|---|---|---|---|
| Base numeric/control/calls | Required | Required | Required | Required | Required |
| FC conversions/bulk/table | Required | Required | Required | Required | Required |
| FD fixed-width SIMD | Required | Required | Required | Required | Required |
| Corrected FB GC/reference variants | Required | Required | Required | Required | Required |
| Typed references/recursive types | Required | Required | Required | Required | Required |
| Modern EH + tags | Required | Required | Required | Required | Required |
| Legacy EH profile | Required | Required | Required | Required | Required |
| Imports/exports/start/resources | Required | Required | Required | Required | Required |
| All element/data modes + data-count | Required | Required | Required | Required | Required |
| Custom/debug sections | Required bounded handling | Core rules only | Non-executable | Non-interference | Required |

An opcode-name count is not an implementation percentage. No calendar estimate
is attached: milestone completion is determined by these acceptance gates.
