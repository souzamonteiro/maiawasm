# TODO: Make the WAT Assembler Feature-Complete

Goal: evolve the internal assembler so it can compile **any valid WAT** supported by the targeted WebAssembly feature set.

> Note: "any WAT" depends on which proposals/features are enabled. This plan assumes a configurable feature matrix and conformance-driven development.

## 1) Define scope and compatibility matrix

- [ ] Define baseline spec target (MVP + Core 1.0 + Core 2.0 pieces)
- [ ] Define proposal support policy (enabled/disabled by default)
- [ ] Add a feature flag system (e.g. SIMD, Threads, GC, Tail Calls, Memory64, Exceptions)
- [ ] Document exact syntax/semantics per enabled feature

## 2) Lexer completeness

- [ ] Audit all official text keywords/operators/immediates
- [ ] Add missing tokens and aliases from spec text format
- [ ] Support numeric literal edge-cases:
  - [ ] signed/unsigned forms
  - [ ] hex floats, NaN payloads, infinities
  - [ ] underscore separators (if accepted by target syntax)
- [ ] Ensure robust string escape decoding (UTF-8, hex escapes, edge-cases)

## 3) Parser completeness

- [ ] Cover all instruction families and text forms:
  - [ ] folded and flat instruction forms
  - [ ] block/loop/if label and result variants
  - [ ] full import/export descriptors
  - [ ] data/elem segment variants (active/passive/declarative)
  - [ ] full `call_indirect` and table syntax variants
- [ ] Add strict grammar validation with high-quality diagnostics
- [ ] Preserve source location info in AST for better errors

## 4) Semantic analysis and validation

- [ ] Implement full symbol resolution:
  - [ ] types, funcs, tables, memories, globals, locals, labels
- [ ] Implement proper label depth resolution for named branches
- [ ] Implement local index resolution for all forms
- [ ] Add module-level validation passes:
  - [ ] section ordering constraints
  - [ ] type consistency checks
  - [ ] import/export constraints

## 5) Code generation correctness

- [ ] Verify all opcodes and immediates against current spec tables
- [ ] Ensure prefixed instruction encoding is always correct (`0xFC`, `0xFD`, etc. + `u32 LEB128` subopcode)
- [ ] Implement complete block type encoding (including multi-value/type index cases)
- [ ] Implement complete element/data segment encodings
- [ ] Validate memory/table/global/type section binary layouts
- [ ] Ensure canonical and deterministic section emission

## 6) Feature proposal coverage

- [ ] SIMD (full instruction coverage, lane ops, constants, shuffles)
- [ ] Bulk memory + reference types (all forms)
- [ ] Multi-value and typed `select`
- [ ] Non-trapping float-to-int conversions
- [ ] Sign-extension operators
- [ ] Threads/atomics (if targeted)
- [ ] Exceptions (if targeted)
- [ ] Memory64 (if targeted)
- [ ] Tail calls, GC, function references (if targeted)

## 7) Error handling and DX

- [ ] Standardize error categories (lex/parse/semantic/codegen)
- [ ] Provide actionable messages with file:line:column
- [ ] Add "expected vs got" context in parser errors
- [ ] Add optional verbose debug output (tokens/AST/sections)

## 8) Test strategy (must-have)

- [ ] Add conformance corpus integration (spec tests / WABT comparisons)
- [ ] Add golden tests for each instruction family
- [ ] Add invalid-input tests for each parser/codegen rule
- [ ] Add fuzz/property tests for parser and binary stability
- [ ] Add roundtrip tests (`wat -> wasm -> validate -> instantiate`)
- [ ] Add CI gate: no regressions on full suite

## 9) Compatibility verification

- [ ] Validate output with multiple runtimes (Node, browser engines, Wasmtime/Wasmer if available)
- [ ] Compare behavior (not only bytes) against reference toolchains
- [ ] Keep hash-equality tests optional; prioritize semantic equivalence and validity

## 10) Tooling and architecture improvements

- [ ] Split `wat-assembler.js` into modules (lexer/parser/resolver/validator/codegen)
- [ ] Introduce shared opcode/type tables generated from spec metadata
- [ ] Add internal IR contracts and schema checks
- [ ] Add benchmarks and performance targets for large modules

## 11) Release criteria for "feature-complete"

- [ ] 100% pass on selected conformance profile
- [ ] 0 known invalid WASM emissions on valid inputs in test corpus
- [ ] Documented unsupported features (if any)
- [ ] Stable CLI behavior and versioned compatibility notes

## 12) MaiaAssembly-specific objective coverage (from implementation guide)

This section tracks what is still required for the MaiaAssembly emitter target described in
[../grammar/MaiaAssembly to WebAssembly Compiler Implementation Guide.md](../grammar/MaiaAssembly%20to%20WebAssembly%20Compiler%20Implementation%20Guide.md).

### 12.1 Required instruction coverage for emitter templates

- [ ] Confirm complete support for all op families used by MaiaAssembly templates:
  - [ ] numeric arithmetic (`add/sub/mul/div/rem`) for `i32/i64/f32/f64`
  - [ ] comparisons (`eq/ne/lt/le/gt/ge`) signed and unsigned variants
  - [ ] bitwise ops (`and/or/xor/shl/shr/rot`)
  - [ ] unary ops (`eqz`, sign-extension, reinterpret/casts as needed)
  - [ ] conversion ops (`i32.trunc_f64_s`, `f64.convert_i32_s`, etc.)
  - [ ] memory load/store variants for arrays/matrices and runtime structs
- [ ] Ensure parser handles both folded and flat forms generated by emitter patterns

### 12.2 Control-flow forms used by MaiaAssembly lowering

- [ ] Validate full lowering support for:
  - [ ] if/then/else and ternary patterns (`if (result ...)`)
  - [ ] while/for/do-while loop templates
  - [ ] switch lowering based on `br_table` or cascaded conditionals
  - [ ] block labels and nested branch depth correctness
- [ ] Add dedicated tests matching the guide's `while`, `for`, `do-while`, `switch` skeletons

### 12.3 Function model and calling conventions

- [ ] Fully support typed function signatures used by MaiaAssembly emitter output
- [ ] Guarantee reliable `call` and `call_indirect` handling with explicit type-use forms
- [ ] Validate function table workflows for indirect calls and dispatch patterns
- [ ] Add checks for mismatched signatures in indirect calls (clear diagnostics)

### 12.4 Global/local variable model expected by MaiaAssembly

- [ ] Validate mutable/immutable globals in all forms used by emitter
- [ ] Ensure stable named local resolution across parameters + locals + `local.tee`
- [ ] Add tests for assignment compound patterns (`+=`, `-=`, `*=` etc.)

### 12.5 Memory model required by arrays/matrices/runtime data

- [ ] Confirm complete data segment handling for runtime strings/static data
- [ ] Validate memory index handling if multiple memories are introduced
- [ ] Support robust addressing patterns emitted for:
  - [ ] 1D arrays (`base + index * element_size`)
  - [ ] 2D matrices (`base + ((row * cols + col) * element_size)`)
- [ ] Add alignment/offset immediate tests for all relevant load/store widths

### 12.6 Runtime integration imports/exports

- [ ] Ensure import descriptor support for system/math runtime symbols (`print`, `pow`, etc.)
- [ ] Validate export generation for compiled Maia functions (`main`, user functions)
- [ ] Add tests for mixed import+defined function modules

### 12.7 Error handling patterns from MaiaAssembly runtime

- [ ] Ensure `unreachable` and trap-oriented patterns compile correctly
- [ ] Validate bounds-check templates and runtime error-call sequences
- [ ] Add negative tests for malformed emitter output (bad index/type/label)

### 12.8 Numeric semantics needed by Maia language features

- [ ] Define exact Maia semantics for division/remainder/sign behavior
- [ ] Ensure selected WASM ops match Maia semantics or inject helper lowering
- [ ] Decide policy for power operator (`**`) lowering via runtime import vs intrinsic expansion

### 12.9 ABI contract between MaiaAssembly emitter and webassembler

- [ ] Freeze and version the MaiaAssembly grammar baseline in [grammar/MaiaAssembly.ebnf](grammar/MaiaAssembly.ebnf)
- [ ] Write a strict contract doc for the WAT subset emitted by MaiaAssembly:
  - [ ] naming conventions for generated symbols
  - [ ] required section order and field forms
  - [ ] allowed folded/flat syntax forms
  - [ ] required feature flags/proposals
- [ ] Enforce contract checks in pre-validation pass before codegen

### 12.10 Conformance suite specifically for MaiaAssembly goal

- [ ] Create `tests/fixtures/maia/` with end-to-end emitter-like samples:
  - [ ] expressions
  - [ ] assignments
  - [ ] control flow
  - [ ] functions/calls/indirect calls
  - [ ] globals/locals
  - [ ] arrays/matrices
  - [ ] runtime imports/exports
  - [ ] error-handling patterns
- [ ] Add execution tests (not only binary validity): instantiate and assert results
- [ ] Add "guide parity" tests that mirror examples from the implementation guide

### 12.11 Alignment backlog: MaiaAssembly EBNF -> Guide WAT -> Assembler

Goal: guarantee a deterministic pipeline where valid MaiaAssembly input is lowered to a WAT subset that both
[Wat.ebnf](grammar/Wat.ebnf) and `wat-assembler.js` accept.

- [ ] Define and version a **lowering contract** document:
  - [ ] MaiaAssembly construct -> canonical WAT pattern mapping
  - [ ] which guide snippets are templates vs standalone module fragments
  - [ ] required runtime prelude/imports (`math.pow`, system I/O, etc.)
- [ ] Add a normalization pass in emitter output (before assembly):
  - [ ] normalize folded/flat instruction forms to one canonical form supported by assembler
  - [ ] normalize assignment shapes (`local.set`/`global.set`) to accepted parser forms
  - [ ] normalize boolean patterns (`eqz`/comparisons) and sign-extension usage policy
- [ ] Close known Guide vs assembler gaps (observed validation failures):
  - [ ] implement/sign off `i32.extend8_s` and related sign-extension ops in parser+codegen
  - [ ] complete folded-expression parsing for nested forms used in guide (`local.set (...)`, deep arithmetic trees)
  - [ ] complete `call_indirect` typed forms used by guide templates
  - [ ] support/stabilize symbol resolution expectations for guide-style runtime calls/globals
- [ ] Add an emitter-side dependency declaration step:
  - [ ] auto-insert/import required runtime symbols referenced by lowering templates
  - [ ] fail fast with actionable diagnostics when required symbols are missing
- [ ] Add **end-to-end MaiaAssembly pipeline tests**:
  - [ ] `maiaasm -> wat` golden tests (text output parity)
  - [ ] `maiaasm -> wat -> wasm` build tests (assembler acceptance)
  - [ ] `maiaasm -> wat -> wasm -> run` semantic tests (runtime parity)
  - [ ] one test group per guide chapter (expressions, control flow, functions, arrays/matrices, runtime)
- [ ] Add acceptance gates specific to this alignment:
  - [ ] 100% of guide parity fixtures parse in [Wat.ebnf](grammar/Wat.ebnf)
  - [ ] 100% of required guide parity fixtures assemble in `wat-assembler.js`
  - [ ] 100% of mandatory MaiaAssembly lowering fixtures pass semantic runtime assertions

## 13) Current practical answer for MaiaAssembly objective

- [ ] Not yet guaranteed for all possible MaiaAssembly-emitted WAT modules
- [ ] Required next milestone: pass dedicated MaiaAssembly conformance + alignment pack (Sections 12.10 and 12.11)
- [ ] Required acceptance gate: semantic parity with expected Maia runtime behavior and guide-parity assembly success

## 14) Progress scoring model (weighted)

Use this section to track progress as a percentage in a repeatable way.

### 14.1 Weights by area

| Area | Weight |
|---|---:|
| Core assembler correctness (Sections 1–5) | 35% |
| Feature coverage (Section 6) | 15% |
| Diagnostics and developer experience (Section 7) | 5% |
| Test strategy and conformance (Section 8) | 15% |
| Runtime/toolchain compatibility (Section 9) | 10% |
| Architecture and maintainability (Section 10) | 5% |
| MaiaAssembly-specific objective coverage (Section 12) | 15% |
| **Total** | **100%** |

### 14.2 Current estimate (as of 2026-03-13)

| Area | Completion (0–100) | Weighted contribution |
|---|---:|---:|
| Core assembler correctness | 75% | 26.25% |
| Feature coverage | 55% | 8.25% |
| Diagnostics and DX | 45% | 2.25% |
| Test strategy and conformance | 50% | 7.50% |
| Compatibility verification | 55% | 5.50% |
| Architecture and maintainability | 40% | 2.00% |
| MaiaAssembly-specific coverage | 45% | 6.75% |
| **Overall** |  | **58.50%** |

Rounded practical estimate: **~60%** complete toward the full MaiaAssembly objective.

### 14.3 Why this differs from local test pass rate

`npm run test` passing means current fixtures are covered.
It does **not** imply full WAT/spec coverage, full MaiaAssembly lowering coverage, or full conformance validation.

### 14.4 Update rule

Whenever a milestone lands, update:

1. area completion value (0–100)
2. weighted contribution = `weight * completion`
3. overall percentage sum

Recommended cadence: update after each merged feature group (parser family, opcode family, conformance batch, Maia fixture pack).

## 15) Priority roadmap (easiest -> hardest)

Use this ordering to sequence implementation work with the highest chance of early progress and low rework.

| Priority | Work item | Why this order | Depends on | Estimated difficulty |
|---|---|---|---|---|
| P1 | Freeze MaiaAssembly->WAT lowering contract (Section 12.11) | Removes ambiguity and prevents downstream churn | None | Easy |
| P2 | Add guide parity fixture inventory and chapter mapping | Creates measurable scope for all later tasks | P1 | Easy |
| P3 | Add emitter output normalization rules (folded/flat canonicalization policy) | Reduces parser/codegen surface before adding features | P1 | Easy-Medium |
| P4 | Improve diagnostics categories/messages (lex/parse/semantic/codegen) | Speeds iteration and debugging for all subsequent milestones | None | Easy-Medium |
| P5 | Add missing sign-extension instruction support (`i32.extend8_s` family) | Unblocks known guide failures with limited blast radius | P3 | Medium |
| P6 | Complete nested folded-expression parsing used by guide templates | Needed for assignment/control-flow forms that currently fail | P3 | Medium |
| P7 | Stabilize runtime symbol dependency handling (auto-import or fail-fast) | Resolves many Unknown function/global guide failures | P1, P2 | Medium |
| P8 | Complete `call_indirect` typed forms and validation paths | Core requirement for function model and switch/dispatch templates | P6, P7 | Medium-Hard |
| P9 | Expand numeric/conversion operator coverage to full Maia needs | Required for language semantics parity and runtime correctness | P5 | Medium-Hard |
| P10 | Add end-to-end pipeline tests (`maiaasm -> wat -> wasm -> run`) | Converts feature work into enforceable acceptance gates | P2, P6, P7, P8 | Hard |
| P11 | Enforce guide parity gates in CI (parse + assemble + semantic runtime pass) | Prevents regressions and validates delivery target continuously | P10 | Hard |
| P12 | Conformance hardening against external corpora/toolchains | Final confidence layer after internal parity is stable | P10, P11 | Hard |

### 15.1 Suggested milestone grouping

- **Milestone A (Foundation):** P1-P4  
  Output: stable contract, test inventory, normalization policy, better diagnostics.
- **Milestone B (Known guide blockers):** P5-P8  
  Output: current guide-template blockers addressed in parser/codegen/resolution.
- **Milestone C (Proof of pipeline):** P9-P10  
  Output: MaiaAssembly to WAT to WASM to runtime semantic checks.
- **Milestone D (Release confidence):** P11-P12  
  Output: CI-enforced parity + broader conformance confidence.
