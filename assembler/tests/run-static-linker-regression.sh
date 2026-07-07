#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
LINKER="$REPO_ROOT/assembler/wasm-linker.js"
ASSEMBLER="$REPO_ROOT/assembler/wat-assembler.js"
STATIC_FIXTURES_DIR="$REPO_ROOT/assembler/tests/fixtures/static-linker"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [[ ! -f "$LINKER" ]]; then
  echo "Error: linker not found at $LINKER" >&2
  exit 1
fi

if [[ ! -f "$ASSEMBLER" ]]; then
  echo "Error: assembler not found at $ASSEMBLER" >&2
  exit 1
fi

if [[ ! -d "$STATIC_FIXTURES_DIR" ]]; then
  echo "Error: static-linker fixtures not found at $STATIC_FIXTURES_DIR" >&2
  exit 1
fi

assemble_fixture() {
  local input_wat="$1"
  local output_wasm="$2"
  node - "$input_wat" "$output_wasm" "$ASSEMBLER" <<'NODE'
const fs = require('fs');

const [inputWat, outputWasm, assemblerPath] = process.argv.slice(2);
const WatAssembler = require(assemblerPath);

const source = fs.readFileSync(inputWat, 'utf8')
  .split('\n')
  .map(line => line.replace(/;;.*$/, ''))
  .join('\n')
  .trim();

const wasm = new WatAssembler().assemble(source);
fs.writeFileSync(outputWasm, Buffer.from(wasm));
NODE
}

run_case() {
  local label="$1"
  shift
  echo "[RUN] $label"
  node "$LINKER" "$@"
  echo
}

assert_export_result() {
  local wasm_file="$1"
  local export_name="$2"
  local expected="$3"
  node - "$wasm_file" "$export_name" "$expected" <<'NODE'
const fs = require('fs');

const [wasmFile, exportName, expectedText] = process.argv.slice(2);
const expected = Number(expectedText);
const bytes = fs.readFileSync(wasmFile);

(async () => {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  if (typeof instance.exports[exportName] !== 'function') {
    throw new Error(`Missing function export: ${exportName}`);
  }
  const actual = Number(instance.exports[exportName]());
  if (actual !== expected) {
    throw new Error(`Unexpected result for ${exportName}: expected ${expected}, got ${actual}`);
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
NODE
}

echo "=== Static linker regression ==="
echo "repo: $REPO_ROOT"
echo

run_case "single: local memory" \
  "$REPO_ROOT/assembler/tests/expected/04-memory.wasm" \
  --static -w "$TMP_DIR/verify_local_memory_single.wasm"

run_case "single: local table" \
  "$REPO_ROOT/assembler/tests/expected/05-table.wasm" \
  --static -w "$TMP_DIR/verify_local_table_single.wasm"

assemble_fixture "$STATIC_FIXTURES_DIR/mem_lib.wat" "$TMP_DIR/mem_lib.wasm"
assemble_fixture "$STATIC_FIXTURES_DIR/mem_app2.wat" "$TMP_DIR/mem_app2.wasm"
run_case "multi: memory resolution" \
  "$TMP_DIR/mem_app2.wasm" "$TMP_DIR/mem_lib.wasm" \
  --static -w "$TMP_DIR/verify_mem_linked2.wasm" -e mem_app2
assert_export_result "$TMP_DIR/verify_mem_linked2.wasm" "mem_app2" 65

assemble_fixture "$STATIC_FIXTURES_DIR/table_lib.wat" "$TMP_DIR/table_lib.wasm"
assemble_fixture "$STATIC_FIXTURES_DIR/table_elem_app.wat" "$TMP_DIR/table_elem_app.wasm"
run_case "multi: table/elem resolution" \
  "$TMP_DIR/table_elem_app.wasm" "$TMP_DIR/table_lib.wasm" \
  --static -w "$TMP_DIR/verify_table_linked2.wasm" -e table_elem_app
assert_export_result "$TMP_DIR/verify_table_linked2.wasm" "table_elem_app" 42

assemble_fixture "$STATIC_FIXTURES_DIR/global_lib.wat" "$TMP_DIR/global_lib.wasm"
assemble_fixture "$STATIC_FIXTURES_DIR/global_app2.wat" "$TMP_DIR/global_app2.wasm"
run_case "multi: global resolution" \
  "$TMP_DIR/global_app2.wasm" "$TMP_DIR/global_lib.wasm" \
  --static -w "$TMP_DIR/verify_global_linked2.wasm" -e global_app2
assert_export_result "$TMP_DIR/verify_global_linked2.wasm" "global_app2" 7

echo "Static linker regression finished."
