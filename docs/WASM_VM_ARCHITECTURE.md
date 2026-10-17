# Pure-JavaScript WASM VM Architecture

Status: proposed design, not an implemented runtime.
Source inspection date: 2026-10-16.
Implementation plan: [WASM VM roadmap](WASM_VM_ROADMAP.md).

## 1. Goal and compatibility contract

Create `assembler/wasm-vm.js`, a JavaScript interpreter that accepts real
WebAssembly binary modules and executes them without the Node.js or browser
WebAssembly engine. Reuse and correct the binary parsing work in
[wasm-disassembler.js](../assembler/wasm-disassembler.js); do not translate the
generated WAT back into an execution format.

The execution path must not call `WebAssembly.compile`, `validate`, `instantiate`,
`Module`, `Instance`, or native WebAssembly memory, table, global, tag, or exception
constructors. It must not delegate execution to another native WASM engine,
subprocess, WASM-backed dependency, `eval`, or generated JavaScript functions.
Ordinary JavaScript facilities such as typed arrays, `DataView`, `BigInt`, and
JavaScript garbage collection are allowed.

"Everything the disassembler can disassemble" needs a precise boundary:

- The target is valid binary modules using the instruction families and module
  constructs recognized by the inspected decoder, with their encodings corrected.
- Returning text is not proof of support: the current decoder accepts some
  malformed inputs, substitutes types, emits `unknown_*`, and drops information.
  These behaviors are not an executable dialect to preserve.
- The final target includes integer/floating-point operations, structured control,
  multi-value blocks/functions, references and typed calls, tail calls, tables,
  memory32 including multiple memories, bulk operations, all currently mapped
  fixed-width SIMD operations, GC operations, and exception handling.
- Current legacy exception mnemonics (`try`, `catch`, `catch_all`, `rethrow`) remain
  a required, explicitly selected compatibility profile. They must not be confused
  with modern `try_table` and exception references.
- Recursive types and explicit nullable/non-nullable reference types are required
  dependencies of correctly implementing the already recognized GC/typed-reference
  families, even though their existing parsing is incomplete.
- Threads/atomics, shared memory, memory64/table64, relaxed SIMD, component-model
  binaries, WASI, and dynamic linking are not implied by current opcode coverage.
  Reject such requirements explicitly unless added by a separately tested scope
  extension. WASI and Emscripten imports can later be supplied by host adapters.

Partial milestones may support less, but must reject unsupported modules before
instantiation. They must not advertise completion of the full target.

## 2. Verified starting point

The implementation inspected is a disassembler, not an execution engine or a
complete validator. The counts below describe the audited baseline table entries,
not tested semantics. Subsequent corrections are tracked in the roadmap.

| Surface | Existing source | Reusable work and limitations |
|---|---|---|
| Primitive decoding | `decodeULEB128`, `decodeSLEB128`, `decodeUTF8`, `decodeF32`, `decodeF64` | Width-aware LEB and bounds logic exist; signed i64 can return `BigInt`. Reads are Buffer-specific and not consistently bounded by their containing section/body. UTF-8 decoding is not fatal. Float conversion loses raw-bit information needed for exact reinterpretation. |
| Base instruction table | `OPCODE_NAME` | 198 entries, including typed select, tail calls, references, modern and legacy exception forms. |
| Miscellaneous/bulk table | `OPCODE_FC_NAME` | 18 entries: saturating conversions and memory/table bulk operations. |
| GC table | `OPCODE_FB_NAME` | 29 entries, but cast encodings and some immediate handling need correction. |
| SIMD table | `OPCODE_FD_NAME` | 236 fixed-width SIMD entries. Many have no immediates; mapped names do not establish execution support. |
| Sections | `parseSection` and `parse*Section` methods | Dispatch exists for custom sections and standard IDs 1 through 13, including start, data-count and tags. Section order and uniqueness are not validated. |
| Types | `parseTypeSection`, `parse*Type`, `parseLimits` | Basic function/aggregate parsing exists. Subtype metadata is discarded, recursive groups are not decoded, and value/reference types are often read as one byte. |
| Instructions | `decodeInstructions` | Returns formatted strings rather than typed instruction records; no operand-stack, control-stack, or typing validation. |
| Initializers | `parseExpressionBytes` | Manually skips selected immediates until `end`; this is not a general instruction decoder or constant-expression validator. |
| Debug metadata | `parseCustomSection` | Records custom-section ranges and selected name maps. This metadata does not implement execution or linking. |
| Public interface | `disassembleWASM`, `WasmDisassembler` | Keep these existing entry points compatible while extracting the decoder. |

The inspected assembler has 196 base, 18 FC, 29 FB, and 236 FD table entries.
All 479 name/code pairs also occur in the disassembler; its two additional base
entries make 481 total. This is an inventory, not a conformance percentage.
Correcting GC cast variants changes the binary-variant inventory: do not freeze
the wrong table simply to preserve that number. The integrated correction batch
now has 31 FB entries and 483 total decoder entries.

Existing [disassembler tests](../assembler/tests/run-disassembler-tests.js) cover
smoke cases, primitives, malformed inputs, selected immediates, custom sections,
round trips, and optional WABT checks. The
[round-trip suite](../assembler/tests/test-disassembler-roundtrip.js) checks that
both binaries validate; it does not compare executed results or side effects.
The [Emscripten suite](../assembler/tests/test-emscripten-c89-roundtrip.js) likewise
checks compilation and binary validity, not VM execution of `test_entry`.
External-tool tests can skip when tools are absent; a green aggregate exit code
does not establish that an external oracle ran.

## 3. Decoder corrections required before execution

The table records the audited baseline and the required corrections. The
[roadmap progress section](WASM_VM_ROADMAP.md#verified-progress-initial-decoder-corrections-2026-10-16)
tracks fixes implemented since that baseline; the table is not a current list of
all remaining bugs. Some defects are shared with the assembler; same-project
round trips cannot be the sole oracle.
The [integrated batch](WASM_VM_ROADMAP.md#verified-progress-integrated-gc-eh-and-element-corrections)
also records completed GC variant, heap-type, handler and element corrections,
including coupled assembler/parser/static-linker updates.
The [nested-boundary batch](WASM_VM_ROADMAP.md#verified-progress-nested-binary-read-boundaries)
hardens the existing Buffer parser's section, function-body, name-subsection and
vector reads. A reusable Uint8Array/DataView reader and structured instruction
decoder were implemented by subsequent batches described below.
The [type-preservation batch](WASM_VM_ROADMAP.md#verified-progress-recursive-subtype-and-reference-type-preservation)
adds recursive-group boundaries, flattened type indices, subtype metadata,
complete reference/storage parsing and standard WAT type rendering in the
existing decoder. It does not implement recursive type equivalence or subtype
validation; those remain validator responsibilities.
The [memory batch](WASM_VM_ROADMAP.md#verified-progress-memory32-multi-memory-and-memory-immediates)
corrects memory-index LEBs, scalar/SIMD multi-memory operands, memory32/table32
limits and standard `memory.init` operand order. Shared/64-bit address features
remain explicitly outside the supported profile.
The [string-fidelity batch](WASM_VM_ROADMAP.md#verified-progress-fatal-utf-8-and-wat-string-fidelity)
adds fatal UTF-8 for interpreted names, preserves a leading BOM and round-trips
escaped names/data through shared string helpers.
The [float-fidelity batch](WASM_VM_ROADMAP.md#verified-progress-raw-float-constants-and-simd-lane-fidelity)
renders scalar constants directly from their raw bits, preserves NaN payloads
and signed zero, implements exact target-width literal rounding, and corrects
SIMD constant lane packing. These fixes use existing raw code/initializer buffers;
subsequent instruction extraction also carries those bits in structured records.
Finite float text now uses exact hexadecimal notation. The roadmap records two
explicitly qualified WABT 1.0.39 midpoint disagreements and their native checks.
The [structured-instruction batch](WASM_VM_ROADMAP.md#verified-progress-shared-structured-instruction-decoder-and-expressions)
extracts Uint8Array instruction reading, named immediate records and a sibling
WAT printer. All initializer boundaries now use that same instruction decoder,
and function bodies retain decoded records with binary offsets.
The [module-decoder batch](WASM_VM_ROADMAP.md#verified-progress-standalone-module-and-structured-type-decoding)
extracts section/type parsing into a standalone Uint8Array decoder with structured
reference types, owned-expression links and default source copying. The
disassembler is now a compatibility/printer adapter; validation, canonical type
identity and the final immutable compiled-module contract are still pending.

| ID | Observed behavior | Required correction |
|---|---|---|
| D01 | Unknown standard sections and leftover payload bytes are skipped; duplicate/out-of-order standard sections can be accepted. | Recognize the selected binary profile, enforce its actual section order, uniqueness and exact payload consumption; custom sections remain repeatable. Section order is not numeric ID order: tags and data-count have special positions. |
| D02 | Many reads use the whole buffer; local declarations are bounded by the code section instead of the individual body. Name subsection parsing also uses the enclosing section limit. | Introduce nested bounded readers for sections, bodies, subsections and byte vectors. Validate lengths/counts before work or allocation. |
| D03 | Unknown types fall back to `i32`/`funcref`; unknown type forms may produce empty objects. Subtype wrappers lose flags and supertypes; `rec` groups are not parsed. | Decode complete typed descriptors, preserve group boundaries and flattened type indices, and reject invalid encodings. Validate nullability, packed fields, finality and subtyping. |
| D04 | `array.len` consumes a type index, although it has no immediate. | Decode zero immediates. Reproduced: bytes `fb 0f 0b` currently become `array.len 11`, consuming the function terminator. |
| D05 | `ref.test`/`ref.cast` use an extra nullability byte and incorrect variant mapping; `br_on_cast*` reads label before flags. | Use the official variants: FB/14 and FB/15 are non-null/nullable tests; FB/16 and FB/17 are non-null/nullable casts. These take a heap type, not an extra nullability byte. For FB/18 and FB/19, read flags before label and the two heap types. Preserve semantic variants in the IR. |
| D06 | `HeapTypeName.exn` is mapped to `0x68`. | Correct to the reference encoding `0x69`, and verify all heap/reference codes against the pinned specification. Typed heap indices are signed-LEB s33, not generic u32. |
| D07 | `try_table` reads tag-specific catch operands in the wrong order and discards all catches in its output. | Preserve catch records: kind, tag when present, target label, and whether an exception reference is delivered. Tagged catches encode tag before label. Validate payload/label types. |
| D08 | Element flags are handled by overlapping bit tests. Declarative forms 3/7 incorrectly enter offset-expression parsing; generation drops passive/declarative/expression segments. | Decode all eight legal forms explicitly, distinguish `elemkind` from reference type, preserve expressions, and repair the WAT emitter. |
| D09 | `memory.size`/`grow` discard one byte; memargs assume only alignment and offset. Limits retain only flags 0/1. | Decode and retain memory-index LEBs, multi-memory memarg flags/index/offset, and supported limits. Reject unsupported shared/64-bit features rather than interpreting them as memory32. |
| D10 | SIMD vector/shuffle/lane bytes can be read without a length check; unknown opcodes become text. | Bound every fixed immediate, reject unknown opcodes, validate lane/shuffle ranges and alignment, and decode every function to its exact boundary. |
| D11 | Initializer scanning knows only selected immediates and can treat immediate bytes as opcodes/terminators. | Decode initializers through the shared instruction reader, then validate the allowed constant-expression subset for the selected profile and context. |
| D12 | No function/code count agreement, index-space checks, structured-control checks, or operand typing. | Add independent module and instruction validation before publishing executable code. Data-count must agree with data segments and be present where required. |
| D13 | Strings/floats are rendered using JS string conversion; import/export names are not WAT-escaped. | Use fatal UTF-8 for binary names, retain float bits in the IR, and escape WAT names. Preserve signed zero, infinities and NaN representations where required. |
| D14 | A second `disassemble()` call reuses populated arrays; struct/array type emission is missing. | Make decoded modules independent of mutable printer state, prevent accumulation across calls, and complete WAT generation from the corrected module representation. |

Small source-level probes also reproduced acceptance of an unknown section,
duplicate empty type sections, trailing bytes inside a type section, a truncated
SIMD constant, and `unknown_255`. None of these should become executable IR.

### Normative references

Use the official specification for semantics, not the current assembler as the
authority. The source baseline consulted is
[WebAssembly/spec commit 340650f2f620169685814774bc5b019d05d4d3d7](https://github.com/WebAssembly/spec/tree/340650f2f620169685814774bc5b019d05d4d3d7).
Its [reference decoder](https://github.com/WebAssembly/spec/blob/340650f2f620169685814774bc5b019d05d4d3d7/interpreter/binary/decode.ml)
confirms D04-D07. The published
[binary instructions](https://webassembly.github.io/spec/core/binary/instructions.html),
[binary types](https://webassembly.github.io/spec/core/binary/types.html),
[validation](https://webassembly.github.io/spec/core/valid/index.html), and
[execution](https://webassembly.github.io/spec/core/exec/index.html) chapters are
readable references; those live URLs can change. Pin the corpus/tool revisions
used by implementation tests. Pin a separate historical exception specification
for the legacy profile before implementing it; the modern specification is not
evidence for legacy instruction semantics.

## 4. Architecture and ownership

Execution pipeline:

```text
Uint8Array / ArrayBuffer / Node Buffer
    -> bounded binary reader
    -> complete decoded module + instruction IR
    -> feature checks + static validation + control linking
    -> immutable compiled module
    -> import resolution + store allocation + initialization + start
    -> instance
    -> explicit-stack interpreter
    -> results / WASM exception / trap / host or resource error

decoded module -> WAT printer (existing disassembler API)
```

The WAT printer is a sibling consumer, never an execution dependency.

The table combines implemented decoder components and planned runtime files;
runtime-only files do not exist yet. Keep `wasm-vm.js` as the public facade, not
as a monolithic implementation:

| Proposed path | Responsibility |
|---|---|
| `assembler/wasm-opcodes.js` | Shared descriptors keyed by prefix/subopcode, immediate layouts, feature membership, validation and execution IDs. |
| `assembler/wasm-binary.js` | Extracted primitive/type helpers and reverse opcode tables. |
| `assembler/wasm-reader.js` | Bounded Uint8Array section/instruction reads and DataView raw float bits. |
| `assembler/wasm-module.js` | Standalone section/type/module decoding with default source copying, ranges and expression links. |
| `assembler/wasm-instructions.js` | Shared structured instruction/expression decoding with named immediates and binary ranges. |
| `assembler/wasm-control.js` | Iterative delimiter/label analysis with frame, branch and handler links; no operand/type validation. |
| `assembler/wasm-instruction-wat.js` | WAT rendering of decoded instruction records; no byte parsing. |
| `assembler/wasm-disassembler.js` | Existing API and CLI, adapted to print shared decoded records. |
| `assembler/wasm-vm.js` | Public compile/instantiate API, configuration, capabilities and VM-owned host resource constructors. |
| `assembler/vm/validate.js` | Module typing, instruction typing, subtype checks and prelinked control metadata. |
| `assembler/vm/types.js` | Recursive type equivalence/canonicalization, heap hierarchy, reference assignability. |
| `assembler/vm/store.js` | Runtime function/resource identities, instances, imports and per-instance segment state. |
| `assembler/vm/interpreter.js` | Dispatch loop, call/control/handler stacks, invocation and unwind protocol. |
| `assembler/vm/numeric.js` | Scalar integer/float semantics and exact bit conversions. |
| `assembler/vm/memory.js` | Pure-JS memory, checked accesses, growth and bulk operations. |
| `assembler/vm/simd.js` | v128 lane/bit operations and vector memory operations. |
| `assembler/vm/gc.js` | Structs, arrays, i31, casts, reference identity and external conversions. |
| `assembler/vm/errors.js` | Structured decoder, validation, link, trap, exception and resource errors. |
| `assembler/tests/vm/` | Decoder regressions, validator tests, execution tests, corpus adapters and no-native-engine tests. |

Reuse existing helper algorithms rather than maintaining a second decoder.
The shared runtime core uses `Uint8Array`, its actual `byteOffset`/`byteLength`,
and `DataView`, not Node-only `Buffer` methods. A Buffer is accepted as a
Uint8Array. Copy input at compilation by default to prevent caller mutation after
validation. Keep code/type data immutable and distinct from each instance's
mutable state. Initial packaging may follow current CommonJS conventions and the
Node >=18 baseline in [package.json](../package.json); a browser entry/build must
not introduce Node globals or a native WebAssembly fallback.

## 5. Binary IR and instruction registry

The shared instruction decoder now returns structured records, not WAT strings.
The following final module/compiled-function shapes remain design contracts;
the current unvalidated module/instruction APIs are documented separately below:

```text
DecodedModule:
  binaryVersion, requiredFeatures
  typeGroups, flattenedTypes
  imports, functionTypeIndices, tables, memories, globals, tags
  exports, startFunctionIndex
  elements, data, dataCount
  functionBodies, customSections, debugNames

FunctionBody:
  byteStart, byteEnd
  localGroups: [{ count, valueType }]
  instructions: Instruction[]

Instruction:
  prefix, opcode, semanticId, byteStart, byteEnd
  immediates: operation-specific record

CompiledFunction:
  resolvedSignature, localTypes
  instructions with matchingEnd, matchingElse, resolvedBlockSignature
  validated branch arities and exception-handler descriptors
```

Represent memargs as `{ memoryIndex, alignmentExponent, offset }`, never as an
unstructured string. Preserve catch vectors, typed-select annotations, block
signatures, heap types/nullability, branch tables, and raw float/vector constants.
Module indices and store addresses are distinct concepts.

### Current instruction API

`wasm-instructions.js` currently exports `decodeInstruction(reader)`,
`decodeInstructions(bytes, options)` and `decodeExpression(bytes, options)`.
They do not call a native WebAssembly engine or require Buffer-based input.
`BinaryReader` accepts a Uint8Array (including Buffer) and options
`{ start, end, baseOffset }`: start/end are indices within that exact view,
end is exclusive, and record offsets add baseOffset. This accounts for an
input view's actual byteOffset when reading floats.

The current record shape is:

```text
{ opcode, subopcode?, name, offset, endOffset, immediates }
```

Examples of `immediates` include `{ typeIndex, tableIndex }`,
`{ elementIndex, tableIndex }` for `table.init`,
`{ memarg: { alignment, memoryIndex, offset, explicitMemory } }`, and
`{ blockType, catches }` for `try_table`. Alignment is an exponent and memory
offset is BigInt. Explicit reference types are
`{ kind: 'ref', nullable, heapType }`; heapType is a signed-s33 Number preserving
the distinction between negative abstract encodings and nonnegative indices.
Block types distinguish `empty`, `value` and `type` forms. f32 constants use
unsigned Number bits, f64 constants use unsigned BigInt bits, and v128 constants
copy 16 bytes into a Uint8Array. Catch entries retain numeric kind, optional
tagIndex and labelIndex, not formatted WAT.

`decodeInstructions` reads an entire bounded fragment without requiring a root
terminator. `decodeExpression` returns
`{ instructions, control, offset, endOffset, bytesRead }` through the first outer `end`,
skipping every immediate and tracking nested blocks. It does not consume the
next expression. Function parsing additionally requires that end to coincide
with the body boundary. This checks framing, not stack typing or constant
expression legality. Expression framing rejects misplaced/duplicate `else`,
legacy catches outside their immediate `try`, and handlers after `catch_all`.
`decodeExpression(bytes, { functionBody: true })` additionally checks branch
depths and legacy `rethrow` contexts; module function parsing always enables this.
Ordinary initializer decoding does not introduce a function-label context or
claim to validate permitted constant operations.

The current reader borrows its input; it is not the future compile-time ownership
boundary. Records are mutable and padded LEB spellings need the retained source
bytes. Module decoding can now supply an owned source copy, as described below.
Future `semanticId`, block signatures and stack/branch arities must not be
assumed from this partially validated instruction API.

### Current structural control API

`wasm-control.js` exports `analyzeFunctionControl(instructions)`, consuming the
existing decoded instruction records without mutating them, and `ControlAnalyzer`
for the expression decoder's incremental use. This is not a replacement for the
future typed validator. It requires exactly one function expression, including
its final `end`, and returns `{ frames, branches }`. Its explicit work stack
handles deeply nested bodies without recursive JS calls.

Frame array position is frame identity. Each frame has
`{ kind, startIndex, parent, endIndex, elseIndex, handlers }`. All instruction
indices are zero-based into the body's instruction array, not byte offsets.
The synthetic function frame has startIndex -1 and parent null. Other frames
point to their immediate parent's frame index. Unused elseIndex is null.
Legacy handler entries retain `{ kind, instructionIndex, tagIndex? }`.
Catch-less legacy `try` and repeated tagged catches are legal.

Branches have `{ instructionIndex, kind, targets, catchIndex? }`. Ordinary
branches retain their operation name; `try_table` header entries have kind
`catch` and a zero-based catchIndex into the instruction's existing catch vector.
Each target has `{ depth, frameIndex, kind, targetIndex }`: loops continue at the
instruction after their opener, other labels continue after their matching end,
and function exits use the one-past-last instruction index. `br_table` targets
keep vector order with the default last. `return` explicitly targets the
synthetic function frame.

`try_table` header depths resolve **before** pushing its own label, in accordance
with the pinned reference validator. Legacy `rethrow` targets must identify an
active enclosing legacy catch using ordinary relative block depth; they instead
retain `handlerIndex` and do not have a targetIndex, since rethrowing is not a
normal jump. A handler cannot be followed by another handler after `catch_all`.
These legacy structural rules are grounded in the
[archived EH explainer at af287a73](https://github.com/WebAssembly/exception-handling/blob/af287a73d8f3bf7ea216c10592f9e350b947c4f2/proposals/exception-handling/legacy/Exceptions.md);
pinning a complete legacy conformance corpus/profile remains unfinished.

The metadata does not describe stack heights, block signatures, branch arities,
handler payload types, recursive subtyping or runtime unwinding. Unreachable
code must still use valid label depths. These are mutable structural links,
not immutable or executable compiled IR.

### Current module API

`wasm-module.js` exports `decodeModule(bytes, { copyInput = true })` and the
stateful `ModuleDecoder`. The standalone path does not load the WAT printer,
assembler or disassembler and can run with both `Buffer` and `WebAssembly`
absent. It remains a CommonJS module, not a standalone browser bundle.

```javascript
const { decodeModule } = require('maiawasm/assembler/wasm-module.js');
const decoded = decodeModule(bytes); // Uint8Array, copied by default
const firstBody = decoded.codeSection[0];
```

The plain record currently has these fields:

```text
bytes, binaryVersion, sections
typeSection, typeGroups, importSection, functionSection
tableSection, memorySection, globalSection, tagSection
exportSection, startSection, elementSection, dataSection, dataCountSection
codeSection, expressions, customSections, nameSection
```

The `*Section` names intentionally match existing data consumers. Absent
start/data-count values are null; repeated/vector sections use arrays.
`sections` retains `{ id, offset, payloadOffset, endOffset }` in binary order.
Offsets are relative to the supplied view's first byte, never its backing
ArrayBuffer's first byte. Functions include `{ offset, payloadOffset, codeOffset,
endOffset, locals, code, instructions, control }`; offset begins at the body-size LEB,
payloadOffset begins at local declarations and codeOffset at the first opcode.
Not all other declarations have individual source ranges yet.

Value/storage types are numeric binary codes or explicit reference descriptors
`{ kind: 'ref', nullable, heapType }`, never WAT text in this API.
`typeGroups` records flattened ranges and recursive boundaries; each type retains
`subtype: { explicit, isFinal, supertypes }`, its kind-specific payload and binary
range. This preserves declarations but does not establish canonical type identity
or valid declared subtyping.

Globals directly reference `initializer` instruction-expression records; active
data/element segments reference `offsetExpression`; expression-based elements
also retain `elementExpressions`. These are the same objects collected in
`expressions`. Legacy raw `initExpr`, `offsetExpr`, `elements` and code slices are
retained. Custom sections include a raw payload view in addition to their name/
offset/length metadata. `nameSection` retains module text and function/local Maps.

By default all source slices reference a private copy, preserving them when the
caller mutates its input. `copyInput: false` explicitly borrows the exact view;
`new ModuleDecoder(bytes).decode()` also borrows input. Previous decoded results
are not cleared by reusing/resetting the stateful decoder. None of this provides
immutability: callers can still mutate returned bytes, arrays, records and Maps.
Compile-time freezing/encapsulation, resource limits and semantic validation must
be implemented before execution is safe.

The disassembler subclasses this shared parser and adapts explicit references/
signature types to its previous string-valued fields. Linker compatibility does
not require it to understand the standalone API yet. Use `decodeModule` for
structured module results, not the printer's inherited parser internals.

Registry entries must connect binary decoding, validation rules, execution
handlers and WAT rendering. Type-dependent rules cannot always be represented by
a fixed stack delta; use explicit validator rules for calls, blocks, GC and EH.
WAT aliases and binary variants are separate fields. Each enabled binary variant
must have tests for exact decoding, validation, execution and traps when relevant.

In particular, do not use `normalizeSignedByteCode` to reinterpret every positive
heap type in the range of a built-in byte code: positive values are type indices.
Maintain tagged `abstract` versus `typeIndex` heap descriptors from the original
signed encoding.

## 6. Static validation

Compilation must implement validation in JavaScript, independently of native
`WebAssembly.validate`. A successful compile means all bodies are supported and
well-typed, including functions that are never invoked.

Validate:

1. Header/version, section ordering/uniqueness, lengths, LEB widths/unused bits,
   valid UTF-8 names, flags, reserved values and exact body termination. Legal
   non-minimal LEB encodings remain legal within their specified width.
2. Separate type/function/table/memory/global/tag/element/data/local/label spaces;
   imported entries precede definitions within each relevant index space.
3. Function/code counts, export-name uniqueness, start signature, limits,
   segment modes/indices, data-count requirements and tag signatures.
4. All value/reference/storage types; recursive groups, supertype constraints,
   finality, mutability, assignability and reference defaultability.
5. Operand and control stacks, block parameters/results, branch arities,
   multi-value signatures, typed/untyped select, and unreachable-stack
   polymorphism. Validate non-defaultable local initialization under the profile.
6. Call signatures, indirect/ref-call typing, mutable-global rules, packed-field
   access rules, memory alignment constraints, lane ranges, and EH payload/label
   types. Check `ref.func` declaration requirements.
7. Constant expressions against their allowed instruction set, result type and
   available globals/references in the chosen profile, including required GC
   initializers. Never execute arbitrary code as an initializer.

During validation, match structured instructions once and create direct branch
metadata. Do not rescan bytecode to find `end` during execution.

Feature selection precedes instantiation. Report the first unsupported feature
with its byte location; do not turn it into an empty module or a no-op.

## 7. Runtime state and values

### Store and instances

A VM store owns runtime identities for functions, memories, tables, globals, tags
and references. Each instance contains module-index-to-store-address maps and its
own data/element segment state. An imported resource is the same object in both
instances, not a copy. Export aliases preserve identity. Type canonicalization is
store-wide so equivalent recursive types across modules can be checked correctly.

Runtime values must not depend on JavaScript's implicit coercion:

| WASM value | Initial representation |
|---|---|
| i32 | Signed 32-bit JS Number bit pattern; explicitly use unsigned views for unsigned operations. |
| i64 | BigInt normalized to 64 bits; never route through Number for arithmetic. |
| f32 | Raw 32-bit IEEE bits in a tagged scalar; numeric helpers decode/round/re-encode as needed. |
| f64 | Raw 64-bit IEEE bits in a tagged scalar, with BigInt or two-u32 storage. |
| v128 | Owned 16-byte value, or equivalent four-u32 representation; no mutable aliasing between stack values. |
| References | Explicit null or VM-branded function, external, i31, struct, array and exception references. |

Preserve float constants, memory bits and reinterpretation exactly. Arithmetic
may produce only the NaNs allowed by the specification; preserving arbitrary NaN
payloads through JS Number arithmetic is not a valid assumption. Keep normal
numeric values and references distinguishable even when their JS payloads match.

### Frames and control

Use an iterative dispatch loop and explicit arrays for:

- Operand values.
- Call frames: instance, function address, PC, locals, operand base, caller
  continuation, control base and handler base.
- Control frames: kind, stack height, parameter/result types, label arity,
  continuation PC and loop-entry PC.
- Exception handlers: protected region, tag identities, destinations, payload
  signatures and unwind boundaries.

Every function has an implicit outer label. A branch retains the target's label
arguments, restores the target stack height, removes exited frames and handlers,
and transfers to the precomputed destination. Loop labels consume loop
parameters; block/function labels deliver results. `br_if` must preserve branch
arguments on the not-taken path. Return delivers exactly the function results.

Internal calls do not recurse through the JS call stack. Tail calls replace the
current frame after preserving arguments and restoring control/handler state.
Deep recursion must reach a documented VM limit, not an accidental JS stack
overflow; valid tail recursion must not accumulate call frames.

## 8. Execution semantics by subsystem

### Scalars

Implement wrapping integers, signed/unsigned comparisons, masked shift counts,
rotates, bit counts, sign extension, conversions and reinterpretation explicitly.
Use `Math.imul` for low-32-bit multiplication and normalized BigInt operations for
i64. Integer division by zero traps; signed minimum divided by -1 traps for
division, but signed remainder of that pair is zero.

Floating-point helpers must handle signed zero, NaNs, infinities, ties-to-even
`nearest`, min/max, copysign, correctly rounded f32 results, and conversion
boundaries. Saturating conversions do not use the trapping conversion path.
Do not equate `Math.round`, JS bitwise coercion, or Number-based i64 conversion
with WASM semantics. Add software helpers where JS operations cannot establish
the required result.

### Linear memories, tables and segments

Implement memory32 with a Uint8Array-backed resource and a 65,536-byte page.
Use little-endian DataView accesses. Compute unsigned base plus immediate offset
without wrapping the effective address to 32 bits, and check the complete access
before reading/writing. Validate alignment annotations, but allow dynamically
unaligned ordinary accesses.

Growth preserves contents, zeroes new bytes, honors declared/implementation
limits and returns the previous page count or the WASM failure sentinel. Host
views must have a documented invalidation policy when the backing allocation
changes; do not promise native `WebAssembly.Memory` buffer behavior accidentally.
Only expected allocation failures may be translated to growth failure.

Tables store typed references and enforce bounds, nullability and element types.
`call_indirect` checks table bounds, null and runtime signature compatibility;
`call_ref` and typed tail calls check their corresponding runtime conditions.
Keep memory/table indices for all operations, including nonzero indices.

Bulk operations check both complete ranges before observable writes, implement
overlap semantics, and handle zero-length accesses according to specification.
`memory.init`/`table.init` consume instance-local segment contents; drop makes the
segment empty according to the relevant lifecycle rule, not an unknown index.
Preserve active/passive/declarative distinctions and the prescribed segment
lifecycle after instantiation.

### SIMD

Implement every FD variant present in the inspected table with scalar JavaScript
lane/bit operations, not native WASM SIMD. Cover vector loads/stores and lane
access, shuffle/swizzle, widening/narrowing, saturating arithmetic, comparisons,
bitmasks, pairwise/dot products, conversions and floating-point variants.

Specify lane order independently of host endianness. Integer lanes wrap at their
width; comparison lanes produce all-zero/all-one bits. Distinguish floating
min/max from pseudo-min/max and preserve required signed-zero/NaN behavior.
Decode lane/shuffle immediates exactly and test every lane. SIMD is part of final
parity, not an optional permanent exclusion.

### GC and reference types

Use JS-managed branded objects with explicit canonical WASM type identity.
JavaScript garbage collection may reclaim unreachable graphs and cycles; no
custom moving collector is required initially. Avoid unbounded strong-reference
registries that keep otherwise unreachable guest objects alive.

Implement recursive type equivalence and declared subtyping, not just numeric
type-index equality. Struct/array fields enforce mutability and type. Packed
i8/i16 storage truncates on write and sign/zero extends on read. Default
construction is legal only for defaultable fields. Implement array
allocation/access/fill/copy and data/element initialization with complete range
checks. `array.len` has no immediate.

Represent i31 as a distinct 31-bit reference value with signed/unsigned extraction,
not as an arbitrary JS Number. Implement null checks, reference equality,
refinement branches, test/cast nullability and cast-failure traps. External/internal
reference conversions preserve the identity and round-trip behavior specified by
WASM; they are not an unchecked relabeling of arbitrary JS objects.

### Exceptions

Modern EH uses VM-owned tag identities and typed exception payloads.
`try_table` handlers transfer control using their target labels and deliver the
appropriate payload and, for reference handlers, exception reference. Implement
`throw` and `throw_ref`, cross-function propagation, null-exception traps and
uncaught guest exceptions.

A separate legacy profile implements `try`/`catch`/`catch_all`/`rethrow` using its
pinned historical semantics and complete handler state. Reject unsupported
legacy extensions such as absent `delegate` rather than guessing their encoding.
Do not reinterpret a modern module using legacy semantics.

Traps, resource exhaustion and implementation errors are not guest catchable
exceptions. Host failures propagate separately unless the host explicitly raises
a VM-owned guest exception. Do not accidentally make every JS `Error` catchable
by a guest `catch_all`.

## 9. Instantiation and host boundary

Instantiation is a distinct operation:

1. Verify a compiled module belongs to a compatible VM feature/type environment.
2. Resolve imports by exact module/name and kind; check function signatures,
   resource limits, global mutability/types and tag identity/types.
3. Allocate functions and declared resources, construct index maps, and evaluate
   validated constant initializers in specification order.
4. Initialize active element/data segments, respecting prechecks and side effects
   required by the specification, and establish passive/declarative lifecycles.
5. Resolve exports and invoke the start function exactly once with the same
   interpreter and resource budget.
6. Return a successfully initialized instance only after start succeeds.

Failure is observable and never returns a success-shaped partial instance.
Do not promise rollback of imported memories/tables or host side effects after
instantiation/start failure: apply the specification's sequencing, not a custom
transaction model.

Proposed facade:

```js
const { WasmVM } = require('./assembler/wasm-vm.js');

const vm = new WasmVM({ limits: { fuel: 1_000_000 } });
const module = vm.compile(wasmBytes);
const instance = vm.instantiate(module, imports);
const result = instance.exports.add(20, 22);
```

This API is illustrative; no such export exists yet. `compile` and `instantiate`
are synchronous for the initial release. Async fetching belongs to the embedding.
A later cooperative runner must have explicit suspension/resumption semantics.

Expose VM-owned memory/table/global/tag resources and explicitly typed host
function adapters. Do not require native WebAssembly objects for imports.
Define a VM-specific host ABI: i32/f32/f64 as documented Numbers, i64 as BigInt,
zero results as `undefined`, one as a scalar, multi-results as an ordered array,
v128 as a checked/copying 16-byte value, and references as validated opaque handles.
Float Numbers crossing this ABI cannot promise preservation of every NaN payload.

Check host results against declared types. Reject Promise returns in synchronous
imports. Support synchronous callbacks/reentrancy through explicit activation
boundaries, sharing the outer invocation's budget and restoring frames in `finally`.
Host exceptions and guest exceptions remain distinct. Reentrant resource mutation
must invalidate cached views and assumptions safely. Resource wrappers must not
allow host mutation to violate table/global typing.

There is no ambient filesystem, network, process or browser access. Applications
receive only the imports supplied by the embedding. WASI/Emscripten support is an
adapter project, not a consequence of decoding C-produced binaries.

## 10. Errors, resource controls and diagnostics

Use VM-owned error classes/codes, not native WebAssembly error constructors:

| Category | Meaning |
|---|---|
| DecodeError | Malformed bytes, lengths, flags, UTF-8 or opcode encodings. |
| UnsupportedFeatureError | A recognized feature outside the enabled implementation profile. |
| ValidationError | Decodable but ill-typed or structurally invalid module. |
| LinkError | Missing/incompatible host imports or resources. |
| Trap | WASM runtime trap such as OOB, null dereference or integer divide-by-zero. |
| GuestException | Uncaught WASM exception with VM tag identity and typed payload. |
| ResourceLimitError | Fuel, stack, allocation, cancellation or configured runtime limits. |
| HostError | Host import failure, retaining its cause and invocation context. |

Include absolute binary offset, section, function index, opcode and guest frames
when available. Debug names are diagnostic only. Unknown custom payloads are
retained/ignored without affecting semantics; optional malformed debug metadata
must not make an otherwise valid opaque custom payload executable or trusted.
Bound debug parsing and surface diagnostic warnings without crossing its ranges.

Set explicit documented limits for input bytes, counts, decoded instructions,
expanded locals, types/type-graph work, operand/control/call depth, memory pages,
table entries, guest allocations, and invocation work. Preflight before allocating.
Charge fuel for calls and instructions and proportional work for bulk operations,
growth, allocation and expensive helpers. Check cancellation between bounded work
chunks; a huge single helper must not bypass the budget.

Budget policy is observable. Distinguish host resource limits from specified
WASM growth failure; do not broadly catch RangeError/TypeError and call it success.
Fuel exhaustion does not roll back effects. Define whether a compiled module and
instance remain reusable after each error, and restore activation stacks.

A JavaScript interpreter is not a process-level sandbox. It cannot preempt a
blocking host callback or guarantee wall-clock/memory isolation inside a shared JS
process. Strong isolation requires an embedding worker/process boundary with its
own termination policy; it must still execute this interpreter, not native WASM.

## 11. Testing and completion contract

Keep the current assembler/disassembler suites as regression coverage, but add
independent valid binaries and expected observations. Shared encoder/decoder bugs
must be caught using a pinned official binary corpus, hand-built byte fixtures and
independent tools.

Required layers:

- Decoder tests for every binary variant and legal immediate shape, exact byte
  consumption, width edges, malformed/truncated inputs and D01-D14 regressions.
- Validator positive/negative tests, including unreachable code, recursive types,
  non-defaultable locals, malformed control and disabled features in unused bodies.
- Execution tests for every enabled opcode: results, memory/table/global changes,
  branch/call outcomes, exceptions and traps. Compare exact integer/vector bits
  and float bits where specified; compare spec-permitted NaN sets otherwise.
- Cross-instance imports, exported identity, imported start effects, resource
  growth/view invalidation, reentrant callbacks, and isolation of separate instances.
- Official specification tests pinned to compatible revisions. Record exclusions
  by feature; required-feature exclusions prevent the final parity claim.
- Optional differential tests against native engines/reference interpreters in
  separate test-only processes. Oracle use is never an execution dependency.
- A mandatory execution suite with the WebAssembly global unavailable or poisoned,
  covering compilation, validation, resource creation, start and invocation.
  Test without importing the native-dependent current round-trip harness.
- Node and browser execution tests using the same pure-JS core, including
  Uint8Array subviews with nonzero byte offsets.
- C89 integration executing the existing exported `test_entry` functions and
  asserting reviewed results/side effects with explicitly supplied imports.

Track decoder, validator, executor and behavioral-test coverage independently.
Final acceptance requires every targeted binary variant and section construct to
have all applicable stages complete, all required corpus tests passing, no
silent skips, no unexpected fallbacks, and no native-engine calls. Binary
byte-for-byte round-trip equality is not a substitute for these execution gates.

## 12. Delivery strategy

First correct/extract decoding and establish the feature manifest; then deliver
a validated core interpreter, memory/tables and host integration. Add the full
numeric edge cases, references/tail calls, SIMD, GC and both exception profiles
through dependency-ordered milestones. Early releases are explicitly incomplete.

Prioritize a readable interpreter and complete semantics over JIT or speculative
optimization. Profile only after behavioral gates exist. No schedule or throughput
claim is justified by the current decoder: implementing validation, execution,
GC typing, SIMD and EH is substantially more work than printing WAT.
