# MaiaWASM Architecture

This document describes the current architecture of MaiaWASM, focusing on:

- the WAT-to-WASM assembly flow
- the grammar-to-parser generation flow
- the recommended change lifecycle for grammar/parser updates

## 1. High-Level Assembly Pipeline

```mermaid
flowchart LR
  A[WAT source] --> B[Lexer\nassembler/wat-parser.js]
  B --> C[Parser\nassembler/wat-parser.js]
  C --> D[AST / Parse output]
  D --> E[Assembler adapter\nassembler/wat-parser-adapter.js]
  E --> F[Binary emitter\nassembler/wat-assembler.js]
  F --> G[WASM bytes]
  G --> H[Validation\nWebAssembly.validate / tests]
```

### Notes

- The parser is generated code and should be treated as an artifact.
- Main behavior changes for syntax should start from grammar and generator sources.
- Validation happens through automated suites and runtime module validation.

## 2. Grammar-to-Parser Generation Flow

```mermaid
flowchart LR
  Dev[Developer edits grammar/WAT.ebnf] --> Gen[Run maiacc/bin/tREx.sh]
  Gen --> XML[assembler/_wat-grammar.xml]
  Gen --> Parser[assembler/wat-parser.js regenerated]
  Parser --> Tests[Run assembler test suites]
  Tests -->|Pass| Commit[Commit grammar + generated parser]
  Tests -->|Fail| Fix[Adjust EBNF or parser-generator in maiacc]
  Fix --> Gen
```

### Canonical command

```bash
bash ./maiacc/bin/tREx.sh --ebnf --to-xml assembler/_wat-grammar.xml ./grammar/WAT.ebnf ./assembler/wat-parser.js
```

## 3. Change Lifecycle Sequence

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant Gram as grammar/WAT.ebnf
  participant TREx as maiacc/bin/tREx.sh
  participant Gen as parser-generator
  participant WatParser as assembler/wat-parser.js
  participant Tests as test-assembler scripts

  Dev->>Gram: Update syntax rule
  Dev->>TREx: Run regeneration command
  TREx->>Gen: Convert EBNF to XML + generate parser
  Gen-->>WatParser: Write regenerated parser
  Dev->>Tests: Execute strict + proposal suites
  Tests-->>Dev: Pass/fail report
  alt Suites pass
    Dev->>Dev: Commit + push
  else Suites fail
    Dev->>Gram: Refine grammar or maiacc generator
  end
```

## 4. Repository Components

- `assembler/`: assembler implementation, adapter, generated parser, and suites
- `grammar/`: EBNF grammar definitions
- `maiacc/`: parser-generator submodule used in regeneration
- `docs/`: architecture and process documentation

## 5. Design Principles

- Grammar-first changes: update grammar/generator first, not generated parser by hand.
- Generated artifacts are reproducible: parser output should be regenerated from source.
- Validation is mandatory: run strict and proposal suites before commit.
- Keep generated and source changes synchronized in commits.

## 6. Recommended Verification Checklist

1. Grammar/source changes are in place.
2. `assembler/wat-parser.js` was regenerated through `maiacc`.
3. Strict suite passes (`node assembler/test-assembler.js`).
4. Proposal suite passes (`node assembler/test-assembler-proposals.js`).
5. Commit includes both source-of-truth updates and regenerated artifacts.
