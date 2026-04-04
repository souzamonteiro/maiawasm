#!/usr/bin/env bash
set -euo pipefail

echo "Running assembler/disassembler test flow..."

node tests/run-tests.js
node test-assembler.js
node test-assembler-proposals.js
node tests/run-disassembler-tests.js

echo
echo "All test flows completed successfully."