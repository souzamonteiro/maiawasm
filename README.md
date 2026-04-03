# MaiaWASM

![tREx](images/TheAssembler.png)

WAT-to-WASM assembler in JavaScript, with a parser generated from EBNF grammar and a tREx-based pipeline (`maiacc` submodule).

## Overview

This repository provides:

- WebAssembly module assembly from WAT
- WAT parser generated from `grammar/WAT.ebnf`
- validation suites for stable and proposal-spec scenarios

The recommended workflow for syntax and parser changes is always:

1. update the grammar (`grammar/WAT.ebnf`)
2. regenerate the parser via `maiacc`
3. run validation suites
4. commit the regenerated output

## Main Structure

- `assembler/`: assembler, generated parser, and tests
- `grammar/`: EBNF grammars (including WAT)
- `maiacc/`: parser-generator submodule (tREx)
- `docs/`: architecture and evolution docs

## Requirements

- Node.js 18+
- Git with submodule support

## Setup

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/souzamonteiro/maiawasm.git
cd maiawasm
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Quick Usage

Assemble a fixture:

```bash
node assembler/wat-assembler.js assembler/tests/fixtures/01-basic-module.wat -o test.wasm
```

Optional validation (if `wabt` is installed):

```bash
wasm-validate test.wasm
```

## Testes

Main assembler suite:

```bash
node assembler/test-assembler.js
```

Proposal suite:

```bash
node assembler/test-assembler-proposals.js
```

Internal fixtures suite:

```bash
node assembler/tests/run-tests.js
```

## Regenerating the WAT Parser (Canonical Flow)

Whenever `grammar/WAT.ebnf` changes, regenerate `assembler/wat-parser.js` via `maiacc`:

```bash
bash ./maiacc/bin/tREx.sh --ebnf --to-xml assembler/_wat-grammar.xml ./grammar/WAT.ebnf ./assembler/wat-parser.js
```

Optionally remove the temporary XML after regeneration:

```bash
rm -f assembler/_wat-grammar.xml
```

## Contribution Best Practices

- do not manually edit `assembler/wat-parser.js` for grammar rule changes
- prefer changes in `grammar/WAT.ebnf` and/or the generator in `maiacc`
- run suite validation before committing
- keep commits small with clear messages

## Related Documentation

- `docs/ARCHITECTURE.md`
- `assembler/README.md`
- `docs/WEBASSEMBLER_COM_REX_WATJS.md`
- `maiacc/README.md`

## License

This project is distributed under the license defined in `LICENSE`.
