#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: wasm2wat.sh <input.wasm> [output.wat]

Converts WASM to WAT using assembler/wasm-disassembler.js.
If output is omitted, writes alongside input with .wat extension.
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
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
DISASSEMBLER_JS="$REPO_ROOT/assembler/wasm-disassembler.js"

if [[ ! -f "$DISASSEMBLER_JS" ]]; then
	echo "Error: disassembler not found at $DISASSEMBLER_JS" >&2
	exit 1
fi

INPUT_WASM="$(abspath "$1")"
if [[ ! -f "$INPUT_WASM" ]]; then
	echo "Error: input file not found: $INPUT_WASM" >&2
	exit 1
fi

if [[ $# -eq 2 ]]; then
	OUTPUT_WAT="$(abspath "$2")"
else
	OUTPUT_WAT="${INPUT_WASM%.*}.wat"
fi

mkdir -p "$(dirname "$OUTPUT_WAT")"

node - "$INPUT_WASM" "$OUTPUT_WAT" "$DISASSEMBLER_JS" <<'NODE'
const fs = require('fs');

const [inputWasm, outputWat, disassemblerPath] = process.argv.slice(2);
const { disassembleWASM } = require(disassemblerPath);

try {
	const wasm = fs.readFileSync(inputWasm);
	const wat = disassembleWASM(wasm);
	fs.writeFileSync(outputWat, wat, 'utf8');
	console.log(`WAT written to ${outputWat}`);
} catch (err) {
	console.error(`wasm2wat failed: ${err.message}`);
	process.exit(1);
}
NODE
