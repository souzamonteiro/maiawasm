/**
 * Adapter wrapper for the generated WAT Parser
 * Converts the event stream from the generated parser into a concrete parse
 * tree that wat-assembler.js can traverse.
 */
const OriginalParser = require('./wat-parser.js');

class ParseTreeCollector {
  constructor() {
    this.root = null;
    this.stack = [];
  }

  startNonterminal(name, pos) {
    const node = { type: name, children: [] };
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push(node);
    }
    this.stack.push(node);
  }

  endNonterminal(name, pos) {
    if (this.stack.length === 0) return;
    const node = this.stack.pop();
    // Only set root when the outermost nonterminal finishes
    if (this.stack.length === 0) {
      this.root = node;
    }
  }

  abortNonterminal(name, pos) {
    if (this.stack.length > 0) {
      const node = this.stack.pop();
      // Remove from parent's children (backtracking path discarded)
      if (this.stack.length > 0) {
        const parent = this.stack[this.stack.length - 1];
        const idx = parent.children.lastIndexOf(node);
        if (idx !== -1) parent.children.splice(idx, 1);
      }
    }
  }

  terminal(type, text, pos) {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push({ type, text });
    }
  }

  checkpoint() {
    // Save snapshot of children lengths for each frame so abortNonterminal
    // can clean up correctly even if abortNonterminal is not called per node.
    return this.stack.map(frame => ({ node: frame, len: frame.children.length }));
  }

  restore(mark) {
    if (!Array.isArray(mark)) return;
    // Trim stack back to saved depth and restore children arrays
    this.stack.length = mark.length;
    for (const { node, len } of mark) {
      node.children.length = len;
    }
  }
}

class WATParser {
  constructor(input) {
    this.input = input;
  }

  parse(inputLabel = 'WAT input') {
    const collector = new ParseTreeCollector();
    const parser = new OriginalParser(this.input, collector);

    try {
      parser.parse();
      if (!collector.root) throw new Error('Parser produced no tree');
      return collector.root;
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const offset = extractOffsetFromError(err, parser);
      if (offset === null || this.input.length === 0) {
        throw new Error(`Parse failed for ${inputLabel}: ${message}`);
      }

      const loc = offsetToLineColumn(this.input, offset);
      throw new Error(
        `Parse failed for ${inputLabel}: ${message} at line ${loc.line}, column ${loc.column} (offset ${loc.offset})`
      );
    }
  }
}

function offsetToLineColumn(text, offset) {
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, text.length));
  let line = 1;
  let column = 1;

  for (let i = 0; i < safeOffset; i++) {
    const ch = text[i];
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i++;
      }
      line++;
      column = 1;
    } else if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { line, column, offset: safeOffset };
}

function extractOffsetFromError(err, parser) {
  if (parser && Array.isArray(parser.tokens) && Number.isInteger(parser.position)) {
    const token = parser.tokens[parser.position] || null;
    if (token && Number.isInteger(token.start)) {
      return token.start;
    }
  }

  const message = err && err.message ? String(err.message) : '';
  const match = message.match(/\b(?:position|offset)\s+(\d+)\b/i);
  if (match) {
    return Number(match[1]);
  }

  return null;
}

module.exports = WATParser;
