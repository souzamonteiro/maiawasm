#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

GRAMMAR_FILE="$ROOT_DIR/grammar/WAT.ebnf"
OUT_PARSER="$SCRIPT_DIR/wat-parser.js"
OUT_XML="$SCRIPT_DIR/_wat-grammar.xml"
TREX_SCRIPT="$ROOT_DIR/maiacc/bin/tREx.sh"

if [ ! -f "$GRAMMAR_FILE" ]; then
	echo "Erro: grammar nao encontrada em: $GRAMMAR_FILE" >&2
	exit 1
fi

if [ ! -f "$TREX_SCRIPT" ]; then
	echo "Erro: gerador nao encontrado em: $TREX_SCRIPT" >&2
	exit 1
fi

echo "Gerando parser WAT a partir de: $GRAMMAR_FILE"
bash "$TREX_SCRIPT" --ebnf --to-xml "$OUT_XML" "$GRAMMAR_FILE" "$OUT_PARSER"
echo "Parser atualizado em: $OUT_PARSER"
echo "XML auxiliar em: $OUT_XML"