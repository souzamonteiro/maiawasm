# WAT Assembler (internal)

WAT -> WASM assembler written in JavaScript, with no external backend dependency in the `assemble()` flow.

Main file: [wat-assembler.js](wat-assembler.js)

## Current status

- Internal pipeline (lexer, parser, resolver, codegen)
- Local test suite passing in [tests](tests)
- Produces valid WASM for the scenarios currently covered

> Full WAT specification coverage still requires incremental expansion.

## Recent changes

- fixed folded `if` parsing/generation (condition emitted before `if` opcode)
- fixed named local resolution (`param`/`local`)
- fixed local and label index generation
- fixed prefixed table instructions (`0xFC`)
- fixed SIMD encoding (`0xFD`, subopcodes encoded as `u32 LEB128`)
- fixed global value type handling (`valueType`)
- preserved escaped import/export names and arbitrary data bytes using shared
  [string helpers](wasm-strings.js), with fatal UTF-8 for names and support for
  supplementary Unicode scalars and `\u{...}` escapes
- kept compatibility rewrites and CLI comment handling from modifying string
  contents; invalid escapes, lone surrogates and raw controls now fail explicitly
- preserved scalar float bits through exact hexadecimal WAT output, including
  signed zero, infinities and NaN payloads, using shared
  [float helpers](wasm-floats.js) and single target-width literal rounding
- corrected `v128.const` packing for all six lane shapes, including exact floating
  lane payloads and width-checked integer lanes
- extracted a [structured instruction decoder](wasm-instructions.js) and
  [WAT printer](wasm-instruction-wat.js); function bodies and initializer
  boundaries now share one immediate decoder
- corrected `table.init` binary element/table operand order and preserved
  multi-instruction global/data-offset initializers in WAT output
- added a [standalone module decoder](wasm-module.js) using Uint8Array, structured
  reference types and default input copying, without generating WAT or requiring
  Buffer/native WebAssembly; the disassembler keeps its legacy type fields
- rejected unknown import/export kinds and nonzero tag attributes instead of
  discarding them; decoding is still not full semantic validation
- added [structural control analysis](wasm-control.js): expression delimiter and
  legacy handler placement checks, function branch/rethrow/catch label checks,
  and decoded frame/branch links; operand/type validation remains unfinished

## How to extend

1. **Lexer**
   - add token(s) in [wat-assembler.js](wat-assembler.js)
   - map new keywords in the lexer keyword dictionary

2. **Parser**
   - add parsing support in `parseInstruction()` or section-specific parsers
   - define a clear AST node (`type` + operands/immediates)

3. **Codegen**
   - map AST nodes in `generateInstruction()`
   - for prefixed opcodes (`0xFC`/`0xFD`), emit subopcode as `u32 LEB128`

4. **Tests**
   - add fixtures in [tests/fixtures](tests/fixtures)
   - compare/update expected outputs in [tests/expected](tests/expected)
   - run `npm run test`

## When something is not supported

If you see errors like `Unknown instruction ...`, follow this sequence:

1. **Identify the exact WAT shape**
   - example: `i32.trunc_sat_f32_s`, `memory.copy`, `v128.const`, folded `if`, etc.

2. **Classify the missing piece**
   - new keyword/token
   - new parser syntax (operands/immediates)
   - new opcode in codegen
   - or a combination

3. **Implement in lexer**
   - create/add `TokenType`
   - include it in the `keywords` map

4. **Implement in parser**
   - update `parseInstruction()` (or section parser)
   - normalize to a clear AST node, for example:
     - `type`: canonical instruction name
     - immediate fields (`lane`, `offset`, `align`, `typeIndex`, etc.)

5. **Implement in codegen**
   - add a `case` in `generateInstruction()`
   - emit the correct opcode and immediates
   - for prefixed instructions:
     - prefix `0xFC` or `0xFD`
     - subopcode as `u32 LEB128`

6. **Validate semantically**
   - generate WASM
   - validate with `WebAssembly.validate(...)` or instantiate `WebAssembly.Module(...)`

7. **Cover with tests**
   - add a fixture in [tests/fixtures](tests/fixtures)
   - update expected in [tests/expected](tests/expected)
   - keep a positive case and, when useful, a negative case

## Quick extension checklist

- token added
- parser accepts syntax
- AST is consistent
- codegen emits correct opcode/immediates
- generated module is valid WASM
- test added and passing

## MaiaAssembly opcode naming note

For MaiaAssembly source files (see [grammar/MaiaAssembly.ebnf](grammar/MaiaAssembly.ebnf)), prefer opcode mnemonics in `op_*` form (for example, `op_local_get`, `op_i32_add`, `op_call_indirect`).

This avoids lexer collisions with reserved words and keeps REx parsing deterministic.

## Current limits

The assembler covers the scenarios currently tested, but does not guarantee 100% WAT spec coverage.
Recommended strategy: incremental support + matching fixture.

## Commands

- `npm run test`
- `npm run test:watch`
- `npm run test:generate`
- `npm run test:clean`

## Scalable testing guide

For a fixture-first, scalable workflow (parser + AST snapshot + AST roundtrip + assembler evolution), see:

- [docs/WEBASSEMBLER_TESTING_GUIDE.md](docs/WEBASSEMBLER_TESTING_GUIDE.md)

## WebAssembler from REx WAT.js

If your goal is to build the assembler pipeline starting from the parser generated by REx (`WAT.js`), see:

- [docs/WEBASSEMBLER_COM_REX_WATJS.md](docs/WEBASSEMBLER_COM_REX_WATJS.md)
