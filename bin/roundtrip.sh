#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: roundtrip.sh <input.wat> [output-dir]

Pipeline:
  1) WAT -> WASM   (wat2wasm.sh)
  2) WASM -> WAT   (wasm2wat.sh)
  3) WAT -> WASM   (wat2wasm.sh)
  4) Validate both WASM outputs (WebAssembly.validate)

If output-dir is omitted, files are written to:
  <input-dir>/<input-name>.roundtrip/
USAGE
}

abspath() {
	local p="$1"
	if [[ "$p" = /* ]]; then
		printf '%s\n' "$p"
	else
		printf '%s/%s\n' "$(pwd -P)" "$p"
	fi
}

if [[ "${1:-}" = "-h" || "${1:-}" = "--help" ]]; then
	usage
	exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
	usage
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
WAT2WASM="$SCRIPT_DIR/wat2wasm.sh"
WASM2WAT="$SCRIPT_DIR/wasm2wat.sh"

if [[ ! -x "$WAT2WASM" ]]; then
	echo "Error: missing executable $WAT2WASM" >&2
	exit 1
fi
if [[ ! -x "$WASM2WAT" ]]; then
	echo "Error: missing executable $WASM2WAT" >&2
	exit 1
fi

INPUT_WAT="$(abspath "$1")"
if [[ ! -f "$INPUT_WAT" ]]; then
	echo "Error: input file not found: $INPUT_WAT" >&2
	exit 1
fi

BASE_NAME="$(basename "$INPUT_WAT")"
BASE_NAME="${BASE_NAME%.*}"

if [[ $# -eq 2 ]]; then
	OUT_DIR="$(abspath "$2")"
else
	OUT_DIR="$(dirname "$INPUT_WAT")/${BASE_NAME}.roundtrip"
fi
mkdir -p "$OUT_DIR"

WASM1="$OUT_DIR/${BASE_NAME}.step1.wasm"
WAT2="$OUT_DIR/${BASE_NAME}.step2.wat"
WASM3="$OUT_DIR/${BASE_NAME}.step3.wasm"

"$WAT2WASM" "$INPUT_WAT" "$WASM1"
"$WASM2WAT" "$WASM1" "$WAT2"
"$WAT2WASM" "$WAT2" "$WASM3"

node - "$WASM1" "$WASM3" <<'NODE'
const fs = require('fs');

const [wasm1Path, wasm3Path] = process.argv.slice(2);
const wasm1 = fs.readFileSync(wasm1Path);
const wasm3 = fs.readFileSync(wasm3Path);

if (!WebAssembly.validate(new Uint8Array(wasm1))) {
  console.error(`Validation failed: ${wasm1Path}`);
  process.exit(1);
}
if (!WebAssembly.validate(new Uint8Array(wasm3))) {
  console.error(`Validation failed: ${wasm3Path}`);
  process.exit(1);
}

console.log('WebAssembly.validate: PASS');
NODE

if command -v wasm-validate >/dev/null 2>&1; then
	if wasm-validate "$WASM1" && wasm-validate "$WASM3"; then
		echo "wabt wasm-validate: PASS"
	else
		echo "wabt wasm-validate: WARN (tool may not support all proposal features in this module)"
	fi
fi

echo "Roundtrip completed successfully."
echo "Artifacts in: $OUT_DIR"
echo "  - $WASM1"
echo "  - $WAT2"
echo "  - $WASM3"
