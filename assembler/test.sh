# Assemble a single file
node wat-assembler.js tests/fixtures/01-basic-module.wat -o test.wasm

# Validate with wasm-validate (if installed)
wasm-validate test.wasm

# Inspect with wasm-objdump
wasm-objdump -h test.wasm