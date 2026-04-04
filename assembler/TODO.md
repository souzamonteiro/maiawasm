# WASM Disassembler TODO

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
