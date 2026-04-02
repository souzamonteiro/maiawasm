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

  parse() {
    const collector = new ParseTreeCollector();
    const parser = new OriginalParser(this.input, collector);

    try {
      parser.parse();
      if (!collector.root) throw new Error('Parser produced no tree');
      return collector.root;
    } catch (err) {
      throw new Error(`WAT parse failed: ${err.message}`);
    }
  }
}

module.exports = WATParser;
