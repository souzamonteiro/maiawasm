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

## Running Tests

```bash
# Run all tests
npm test

# Run disassembler suite (includes external wabt validation when available)
node tests/run-disassembler-tests.js

# Generate expected outputs (requires wabt)
npm run test:generate

# Clean generated outputs
npm run test:clean

# Run all steps (clean, generate, test)
npm run test:all
```