# C89 Mini Suite (Emscripten Validation)

Small C89 programs split by feature area to approximate the coverage of `examples/test.c` with focused files.

## Files

- `01_arithmetic_ops.c`: arithmetic, relational, logical, ternary, precedence.
- `02_control_flow.c`: `if/else`, `switch`, `for`, `while`, `do-while`, `break`, `continue`, `goto`.
- `03_functions_recursion.c`: function calls, recursion, binary search recursion.
- `04_arrays_matrix.c`: arrays, 2D matrix iteration, bubble sort.
- `05_pointers_and_funcptr.c`: pointers, pointer-to-pointer, function pointers, array of pointers.
- `06_struct_union_enum.c`: `struct`, `union`, `enum`, `typedef`.
- `07_globals_static_memory.c`: globals, static storage, simple allocator simulation.
- `08_bitwise_casts.c`: bitwise operations and type casting patterns.
- `09_preprocessor_strings.c`: macros, string literals, manual `strlen`-style loop.

## End-to-End Validation

Run from project root:

```bash
node tests/test-emscripten-c89-roundtrip.js
```

This script does all stages:

1. Compile each file with `emcc` from `~/emsdk`.
2. Disassemble generated `.wasm` with `wasm-disassembler.js`.
3. Re-assemble generated `.wat` with `wat-assembler.js`.
4. Validate both original and roundtrip wasm with `WebAssembly.validate`.

Outputs are written to:

- `tests/outputs/emscripten-c89-roundtrip/`
