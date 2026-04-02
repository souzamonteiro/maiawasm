/**
 * Adapter wrapper for the generated WAT Parser
 * Converts the parser output to the AST format expected by wat-assembler.js
 */
const OriginalParser = require('./wat-parser.js');

class ParseTreeCollector {
  constructor() {
    this.root = null;
    this.stack = [];
  }

  startNonterminal(name, pos) {
    const node = { type: name, children: [], name: name };
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push(node);
    }
    this.stack.push(node);
  }

  endNonterminal(name, pos) {
    if (this.stack.length > 0) {
      this.root = this.stack.pop();
    }
  }

  terminal(type, text, pos) {
    // Optionally capture terminals
  }

  error(msg) {
    console.warn('Parser error:', msg);
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
      const result = parser.parse();
      return result || collector.root;
    } catch (err) {
      throw new Error(`WAT parse failed: ${err.message}`);
    }
  }
}

module.exports = WATParser;
