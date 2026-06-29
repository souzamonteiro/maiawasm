#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running assembler/disassembler test flow..."

node "$SCRIPT_DIR/tests/run-tests.js"
node "$SCRIPT_DIR/test-assembler.js"
node "$SCRIPT_DIR/test-assembler-proposals.js"
node "$SCRIPT_DIR/tests/run-disassembler-tests.js"

echo
echo "All test flows completed successfully."
