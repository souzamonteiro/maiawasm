#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: wasm-link.sh <module1.wasm> [module2.wasm ...] [options]

Wrapper around assembler/wasm-linker.js.

Examples:
  wasm-link.sh app.wasm math.wasm --strict
  wasm-link.sh app.wasm math.wasm -o linked-loader.js -e app
USAGE
}

if [[ "${1:-}" = "-h" || "${1:-}" = "--help" ]]; then
	usage
	exit 0
fi

if [[ $# -lt 1 ]]; then
	usage
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
LINKER_JS="$REPO_ROOT/assembler/wasm-linker.js"

if [[ ! -f "$LINKER_JS" ]]; then
	echo "Error: linker not found at $LINKER_JS" >&2
	exit 1
fi

node "$LINKER_JS" "$@"
