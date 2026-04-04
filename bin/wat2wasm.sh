#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: wat2wasm.sh <input.wat> [output.wasm]

Converts WAT to WASM using assembler/wat-assembler.js.
If output is omitted, writes alongside input with .wasm extension.
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
ASSEMBLER_JS="$REPO_ROOT/assembler/wat-assembler.js"

if [[ ! -f "$ASSEMBLER_JS" ]]; then
	echo "Error: assembler not found at $ASSEMBLER_JS" >&2
	exit 1
fi

INPUT_WAT="$(abspath "$1")"
if [[ ! -f "$INPUT_WAT" ]]; then
	echo "Error: input file not found: $INPUT_WAT" >&2
	exit 1
fi

if [[ $# -eq 2 ]]; then
	OUTPUT_WASM="$(abspath "$2")"
else
	OUTPUT_WASM="${INPUT_WAT%.*}.wasm"
fi

mkdir -p "$(dirname "$OUTPUT_WASM")"

node - "$INPUT_WAT" "$OUTPUT_WASM" "$ASSEMBLER_JS" <<'NODE'
const fs = require('fs');

const [inputWat, outputWasm, assemblerPath] = process.argv.slice(2);
const WatAssembler = require(assemblerPath);

try {
	const source = fs.readFileSync(inputWat, 'utf8')
		.split('\n')
		.map(line => line.replace(/;;.*$/, ''))
		.join('\n')
		.trim();
	const wasm = new WatAssembler().assemble(source);
	fs.writeFileSync(outputWasm, Buffer.from(wasm));
	console.log(`WASM written to ${outputWasm}`);
} catch (err) {
	console.error(`wat2wasm failed: ${err.message}`);
	process.exit(1);
}
NODE
