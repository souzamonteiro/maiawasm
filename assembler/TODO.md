# WASM Disassembler TODO

## Decoder hardening update (2026-10-16)

- [x] Reject unknown/duplicate/out-of-order standard sections and unconsumed
  payload bytes, while allowing repeated custom sections.
- [x] Emit the assembler tag section before globals, as required by binary order.
- [x] Decode `array.len` without consuming the next byte.
- [x] Reject unknown opcodes and truncated SIMD constants/shuffles/lane bytes;
  check shuffle and lane ranges.
- [x] Reset parsed state/debug names on every disassembly and restore section
  bounds after parse errors.
- [x] Add binary-integrity regressions and include them in the aggregate runner.
- [x] Correct all GC test/cast opcodes and cast-branch immediate order, preserve
  s33 heap indices, and correct the `exn` abstract heap code.
- [x] Preserve all `try_table` catches with correct tag/label order and surrounding
  label resolution; regenerate numeric/symbolic catch-label grammar.
- [x] Decode, print and assemble all eight element forms; preserve typed reference
  bytes and correctly remap element types/references during static linking.
- [x] Add independent proposal-byte, native GC/EH, WABT element and static-link
  element/type-remapping regressions to the aggregate disassembler runner.
- [x] Bound every section-parser read to its enclosing payload, parse local
  declarations inside function-body limits, and enforce exact consumption of
  known name subsections without consuming adjacent bodies/subsections.
- [x] Check vector/byte lengths before iteration/slicing, bound existing
  initializer immediate reads, and reject unsupported data-segment flags.
- [x] Add nested-boundary regressions, including 108 payload truncations, legal
  padded LEBs, opaque name subsections and nested parse-error recovery.
- [x] Preserve recursive type groups and flattened indices, subtype finality and
  supertypes, reference/storage types and byte ranges; reject unknown type forms
  and invalid mutability rather than substituting `i32`.
- [x] Print standard recursive/subtype/struct/array WAT and regenerate the grammar
  parser; encode explicit references in signatures, fields, tables, globals,
  locals, block results and typed select without dropping their heap types.
- [x] Retain legacy assembler type syntax while supporting standard recursive
  groups, standard mutable fields and forward named references.
- [x] Reject type graphs/signatures/locals unsupported by static-link remapping.
- [x] Test recursive/reference round trips, native typed-reference execution and
  type decoding/encoding with native `WebAssembly` removed.
- [x] Preserve full memory indices and scalar/SIMD multi-memory memargs, check
  natural alignment, retain padded offsets and reject unsupported address flags.
- [x] Validate memory32/table32 limit encodings, ordering and address bounds.
- [x] Correct `memory.init` text/binary operand order and SIMD memory-lane
  encoding; regenerate the parser for explicit memory operands and attributes.
- [x] Remap implicit/explicit memory accesses and active data targets in static
  linking, without requiring an imported memory for local/passive data.
- [x] Test all 45 scalar/SIMD memory layouts, native multi-memory results/effects,
  growth, lanes and traps, plus independent WABT and static-link memory regressions.
- [x] Decode all interpreted binary names with fatal UTF-8 and preserve a leading
  BOM; retain arbitrary byte vectors for data and opaque custom payloads.
- [x] Share exact WAT string quoting/decoding for escaped names, Unicode scalars
  and data bytes; reject invalid escapes, raw controls and lone surrogates.
- [x] Keep assembler compatibility rewrites out of strings/comments and prevent
  CLI comment stripping from destroying `;;` inside names/data.
- [x] Test all 256 data-byte values, malformed UTF-8 at each name surface, native
  import/export identity, CLI string handling and independent WABT assembly.
- [x] Render f32/f64 constants from raw bits with exact hexadecimal finite values,
  signed zero/infinities and explicit signed NaN payloads.
- [x] Encode decimal/hex float literals with a single target-width ties-to-even
  rounding, gradual underflow and explicit invalid-payload/overflow errors.
- [x] Regenerate grammar/parser for signed integer float operands and floating
  literal forms; encode all six SIMD constant shapes at their declared widths.
- [x] Test 8,192 deterministic bit patterns, function/global byte identity,
  midpoint rounding, native reinterpretation and SIMD memory effects; qualify
  the two observed WABT 1.0.39 normal/subnormal midpoint disagreements explicitly.
- [x] Extract raw float/vector immediates into instruction records, with named
  index/type/memory/control immediates and absolute binary ranges.
- [x] Share a bounded Uint8Array/DataView instruction reader and decoder with a
  separate WAT printer; preserve the legacy instruction-string API.
- [x] Replace initializer byte scanning with shared instruction decoding across
  globals, data offsets, element offsets and expression items.
- [x] Enforce outer function terminators, nested block closure and no trailing
  body bytes; retain decoded body/initializer records for downstream consumers.
- [x] Print multi-instruction initializer sequences and correct `table.init`
  element/table binary order versus table/element WAT order.
- [x] Test all 483 decoder variants and 719 truncations, view-relative bounds,
  embedded end bytes, native/WABT distinct table operands and Buffer/native-free
  instruction decoding in a fresh process.
- [x] Extract standalone module/type decoding with structured reference types and
  shared bounded Uint8Array reads; preserve legacy printer/linker fields through
  a compatibility adapter.
- [x] Copy standalone decoder input by default; expose section/body ranges,
  custom payload bytes and direct initializer links without generating WAT.
- [x] Reject unknown import/export kinds and nonzero imported/local tag attributes.
- [x] Test all standard sections, all import/export kinds, structured recursive/
  reference/packed types and eight element forms; check 51 nested truncations,
  copy/borrow ownership, subviews and Buffer/native/printer-free module decoding.
- [x] Validate expression `else`/legacy handler placement and ordering; check all
  function branch depths, `try_table` surrounding labels and legacy `rethrow`
  active-catch contexts, including unreachable code.
- [x] Retain structural frame/end/else/handler and branch destination links,
  without mutating instruction records; verify 20,000 nested blocks, exact
  links, invalid binaries, native/independent WABT and native-free decoding.
- [ ] Complete canonical type identity, full per-declaration ranges, resource
  limits and immutable compiled-module representation; decoded records remain
  unvalidated and are not executable VM modules.

Earlier checked items below describe historical tested coverage, not full binary
conformance. Registry integration, recursive type equivalence, complete type/control
validation and WAT preservation still need work. Track the detailed remaining
corrections in the [VM roadmap](../docs/WASM_VM_ROADMAP.md).

## Status update (2026-04-06)

- [x] Synced parser-generator refactor from MaiaCC into `maiawasm/maiacc` (generation snippets moved to templates).
- [x] Rebuilt `assembler/wat-parser.js` using the canonical flow from `grammar/WAT.ebnf`.
- [x] Ran assembler test suite after sync/regeneration: `10 passed, 0 failed`.
- [ ] Keep conformance expansion and byte-equality improvements open (hash mismatch is still acceptable today when wasm is valid).

## Critical (required to run reliably)

- [x] Implement all section parsers currently referenced but missing:
	- `parseFunctionSection`
	- `parseTableSection`
	- `parseMemorySection`
	- `parseGlobalSection`
	- `parseExportSection`
	- `parseStartSection`
	- `parseElementSection`
	- `parseCodeSection`
	- `parseDataSection`
	- `parseDataCountSection`
	- `parseTagSection`
- [x] Implement all section generators currently referenced but missing:
	- `generateFunctionSection`
	- `generateTableSection`
	- `generateMemorySection`
	- `generateGlobalSection`
	- `generateExportSection`
	- `generateStartSection`
	- `generateElementSection`
	- `generateDataCountSection`
	- `generateCodeSection`
	- `generateDataSection`
	- `generateTagSection`
- [x] Add `OPCODE_FD_NAME` mapping (vector/SIMD prefixed opcodes) or remove the `0xfd` branch until implemented.
- [x] Add bounds checking for all reads (`offset`, section length, immediate length) to prevent out-of-range access.

## Correctness and Spec Coverage

- [x] Complete opcode tables (base + prefixed) using the same canonical source as the assembler.
- [x] Implement immediate decoding for all instructions, especially:
	- control flow (`block`, `loop`, `if`, `br_table`, `call_indirect`)
	- memory ops (align/offset memarg)
	- table/reference ops
	- GC/exception handling instructions
	- bulk memory and SIMD prefixed ops

Immediate coverage matrix (current status):
- [x] Base opcodes: index immediates, block types (empty/valtype/typeidx), `br_table`, `call_indirect`/`return_call_indirect`, memory memarg, typed `select`, `ref.null` heaptype.
- [x] `0xFC` family: `memory.init`, `data.drop`, `memory.copy`, `memory.fill`, `table.init`, `elem.drop`, `table.copy`, `table.grow/size/fill`.
- [x] `0xFB` family: GC immediates decoded for `struct.*`, `array.*`, `ref.test/cast`, `br_on_cast*`, including heap-type rendering (`func`/`extern` + nullability flags).
- [x] `0xFD` family: canonical SIMD opcode map loaded from assembler source; immediates for memarg/lane, `v128.const`, and `i8x16.shuffle` decoded.

Coverage tests:
- [x] Added immediate-format matrix tests in `tests/test-disassembler-immediates.js`.

Progress note:
- [x] Immediate decoding implemented for core control flow, call/call_indirect, local/global/table access, memory memarg, and main `0xFC` prefixed ops used by current assembler tests.
- [x] `0xFB` (GC) immediate decoding now covers the GC forms exercised by tests, including readable heap-type output for `ref.test/cast` and `br_on_cast*`.
- [x] Core `0xFD` (SIMD) decoding and output compatibility are now sufficient for stable round-trip on `08-simd.wat`.
- [x] Expanded immediate decoding coverage to include additional reference/control instructions (`return_call`, `call_ref`, `return_call_ref`, `throw`, `rethrow`, `br_on_*`, typed `select`, `try_table`) and safer memory immediate handling.
- [x] Decode block types correctly (type index, valtype, and empty block type forms).
- [x] Handle custom sections (section id `0`) including name section support.
- [x] Decode signed/unsigned integer widths exactly as defined by WASM spec.

## WAT Output Quality

- [ ] Emit valid and round-trippable WAT format.
- [ ] Add deterministic formatting (indentation, line breaks, stable ordering).
- [ ] Resolve index spaces cleanly (imported vs defined funcs/tables/memories/globals/tags).
- [ ] Optionally generate symbolic names (`$func0`, `$type1`) when debug names are missing.

## Testing and Validation

- [x] Add disassembler smoke tests for core flows (types, exports, code, memory, control-flow).
- [x] Add unit tests for all primitive decoders (`ULEB128`, `SLEB128`, UTF-8, floats).
- [ ] Add fixture-based tests for each section type.
- [ ] Add round-trip tests:
	1. WASM -> WAT (this disassembler)
	2. WAT -> WASM (existing assembler)
	3. Byte-level comparison or semantic validation via runtime.

Progress note:
- [x] Added automated round-trip suite for stable fixtures in `tests/test-disassembler-roundtrip.js` with semantic validation (`WebAssembly.validate`).
- [x] Stable round-trip currently covers all non-error fixtures (`01` to `09`) with semantic validation.
- [x] Added aggregate disassembler runner `tests/run-disassembler-tests.js` and integrated it into `test.sh` main flow.
- [x] Add negative tests for malformed binaries (truncated section, invalid opcode, invalid length).

Progress note:
- [x] Added malformed-binary negative suite in `tests/test-disassembler-negative.js` covering truncated section length, truncated LEB, unterminated expression, and truncated instruction immediate.
- [x] Added primitive decoder unit tests in `tests/test-disassembler-primitives.js`.
- [x] Added custom-section/name-section parsing tests in `tests/test-disassembler-custom-sections.js`.
- [x] Added s33 heaptype immediate tests (including multi-byte type indexes) in `tests/test-disassembler-immediates.js` for `ref.null`, `ref.test/cast`, and `br_on_cast*`.
- [x] Added Emscripten C89 mini-suite validation (`examples/c89-mini-suite/*.c`) and end-to-end pipeline test in `tests/test-emscripten-c89-roundtrip.js` (emcc -> disassemble -> re-assemble -> validate).
- [x] Validate output with external tools (`wasm-tools`, `wabt`) when available.

Progress note:
- [x] Added external validation suite in `tests/test-disassembler-external-wabt.js` and validated stable fixtures (`01` to `09`) with `wat2wasm` + `wasm2wat`.
- [x] Adjusted emitted `memory.init`/`memory.copy`/`memory.fill` syntax to omit default memory index `0`, improving WABT compatibility.

## CLI and Developer Experience

- [ ] Add CLI flags:
	- `--input <file.wasm>`
	- `--output <file.wat>`
	- `--no-names`
	- `--strict`
	- `--verbose`
- [ ] Return non-zero exit code on failure.
- [ ] Improve error messages with section/opcode context and byte offset.

## Optional Improvements

- [ ] Streaming/incremental disassembly for large binaries.
- [ ] Source-map-like metadata from byte offsets to WAT lines.
- [ ] Performance profile and optimize hot decoding paths.
