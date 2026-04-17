#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
LINKER="$REPO_ROOT/assembler/wasm-linker.js"

if [[ ! -f "$LINKER" ]]; then
  echo "Error: linker not found at $LINKER" >&2
  exit 1
fi

run_case() {
  local label="$1"
  shift
  echo "[RUN] $label"
  node "$LINKER" "$@"
  echo
}

echo "=== Static linker regression ==="
echo "repo: $REPO_ROOT"
echo

run_case "single: local memory" \
  "$REPO_ROOT/assembler/tests/expected/04-memory.wasm" \
  --static -w /tmp/verify_local_memory_single.wasm

run_case "single: local table" \
  "$REPO_ROOT/assembler/tests/expected/05-table.wasm" \
  --static -w /tmp/verify_local_table_single.wasm

if [[ -f /tmp/mem_app2.wasm && -f /tmp/mem_lib.wasm ]]; then
  run_case "multi: memory resolution" \
    /tmp/mem_app2.wasm /tmp/mem_lib.wasm \
    --static -w /tmp/verify_mem_linked2.wasm -e mem_app2
else
  echo "[SKIP] multi: memory resolution (missing /tmp/mem_app2.wasm or /tmp/mem_lib.wasm)"
  echo
fi

if [[ -f /tmp/table_elem_app.wasm && -f /tmp/table_lib.wasm ]]; then
  run_case "multi: table/elem resolution" \
    /tmp/table_elem_app.wasm /tmp/table_lib.wasm \
    --static -w /tmp/verify_table_linked2.wasm -e table_elem_app
else
  echo "[SKIP] multi: table/elem resolution (missing /tmp/table_elem_app.wasm or /tmp/table_lib.wasm)"
  echo
fi

if [[ -f /tmp/global_app2.wasm && -f /tmp/global_lib.wasm ]]; then
  run_case "multi: global resolution" \
    /tmp/global_app2.wasm /tmp/global_lib.wasm \
    --static -w /tmp/verify_global_linked2.wasm -e global_app2
else
  echo "[SKIP] multi: global resolution (missing /tmp/global_app2.wasm or /tmp/global_lib.wasm)"
  echo
fi

echo "Static linker regression finished."
