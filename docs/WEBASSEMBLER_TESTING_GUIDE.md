# Scalable Guide to Evolving the WebAssembler

This document describes a practical and safe workflow to evolve the WebAssembler, starting with well-structured fixtures and scaling to new features without rework.

## 1) Goal

Ensure every new feature passes layered validation:

1. **Parser accepts/rejects correctly**
2. **AST is stable (snapshot)**
3. **AST roundtrip works (`WAT -> AST -> WAT -> AST`)**
4. **Assembler generates valid and expected binaries**

This makes it easy to add new fixtures and expand coverage incrementally.

---

## 2) Current Test Status

Main parser test file:
- [tests/test-parser.js](../tests/test-parser.js)

Available modes:

- **Default**: validates parse success/failure
- **AST Snapshot**: validates AST against saved snapshots
- **AST Roundtrip**: validates structural consistency `AST -> WAT -> AST`

AST snapshots:
- [tests/expected-ast](../tests/expected-ast)

Input fixtures:
- [tests/fixtures](../tests/fixtures)

---

## 3) Commands

From the [wasm](..) directory:

### 3.1 Build parser (when grammar changes)

```bash
./build.sh
```

> Note: `build.sh` regenerates [WAT.js](../WAT.js). If needed in your Node flow, ensure `module.exports = WAT` is present at the end of the file.

### 3.2 Basic parser test

```bash
node tests/test-parser.js
```

### 3.3 Verify AST snapshots

```bash
AST_CHECK=1 node tests/test-parser.js
```

### 3.4 Update AST snapshots

```bash
AST_CHECK=1 UPDATE_AST=1 node tests/test-parser.js
```

### 3.5 Validate AST roundtrip

```bash
ROUNDTRIP_CHECK=1 node tests/test-parser.js
```

### 3.6 Run everything (recommended for PRs)

```bash
AST_CHECK=1 ROUNDTRIP_CHECK=1 node tests/test-parser.js
```

---

## 4) How to Create Fixtures Correctly

### 4.1 Naming convention

Use incremental and descriptive names:

- `11-memory-bulk.wat`
- `12-gc-struct.wat`
- `13-exceptions.wat`
- `14-errors-memory.error.wat` (optional explicit error naming)

In [tests/test-parser.js](../tests/test-parser.js), register:

- `shouldPass: true` for valid cases
- `shouldPass: false` for invalid cases

### 4.2 Minimum rule per new feature

For each new feature, include at least:

1. **1 positive fixture** (must parse)
2. **1 negative fixture** (must fail)

Example: if you add `memory.init`, create one valid and one invalid immediate/index usage case.

### 4.3 Recommended granularity

- Prefer small fixtures focused on **one feature**
- Keep one integrated fixture with multiple combined features

---

## 5) Scalable Flow to Add a New Feature

For each spec feature:

1. **Write fixtures** (positive/negative)
2. **Run basic parser tests**
3. **Run AST snapshot checks**
4. **If AST changed intentionally**, update snapshots
5. **Run AST roundtrip checks**
6. **(Assembler) generate WASM and validate binary**
7. **Add regression coverage**

Quick checklist:

- [ ] parser accepts valid syntax
- [ ] parser rejects invalid syntax
- [ ] AST is stable (or intentionally updated)
- [ ] AST roundtrip is consistent
- [ ] WASM binary is valid/expected (when applicable)

---

## 6) Layered Evolution Strategy

### Layer A — Parser (active)

- [tests/test-parser.js](../tests/test-parser.js)
- Focus: syntax and structure

### Layer B — AST (active)

- Snapshots in [tests/expected-ast](../tests/expected-ast)
- Catches structural regressions early

### Layer C — Assembler

Use/expand existing tests to compare:

- generated `.wasm` validation
- expected output comparison
- `WebAssembly.validate(...)` and/or instantiation

### Layer D — Runtime semantics

Optional for critical features:

- instantiate module and verify exported behavior
- useful for semantically sensitive instructions

---

## 7) How to Keep Growth Efficient

1. Standardize fixture templates
2. Keep per-feature cases small
3. Group by category (memory, table, simd, gc, exceptions)
4. Always pair positive + negative cases
5. Run AST + roundtrip checks before commit

---

## 8) Snapshot Update Policy

Update snapshots (`UPDATE_AST=1`) **only** when:

- grammar/parser changed intentionally
- the new AST was reviewed

Avoid bulk snapshot updates without reviewing diffs.

---

## 9) Recommended Next Step

To reduce manual work, evolve toward:

- automatic fixture discovery (instead of a fixed list)
- fixture metadata manifest (feature, level, expected result)
- filtered execution (`--feature=simd`, `--only=14-errors-*`)

This keeps suite growth linear and predictable.
