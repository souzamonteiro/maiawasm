'use strict';

const blockNames = new Set(['block', 'loop', 'if', 'try', 'try_table']);
const branchNames = new Set(['br', 'br_if', 'br_on_null', 'br_on_non_null', 'br_on_cast', 'br_on_cast_fail']);

class ControlAnalyzer {
  constructor({ functionBody = false } = {}) {
    this.functionBody = functionBody;
    this.frames = [{ kind: functionBody ? 'function' : 'expression', startIndex: -1, parent: null,
      endIndex: null, elseIndex: null, handlers: [] }];
    this.stack = [0];
    this.branches = [];
    this.closed = false;
  }

  fail(instruction, message) {
    throw new Error(`Invalid control (${instruction.name}) at offset ${instruction.offset}: ${message}`);
  }

  target(instruction, depth) {
    if (!Number.isInteger(depth) || depth < 0 || depth >= this.stack.length) {
      this.fail(instruction, `label depth ${depth} out of range (labels=${this.stack.length})`);
    }
    return { depth, frameIndex: this.stack[this.stack.length - 1 - depth] };
  }

  accept(instruction, instructionIndex) {
    if (this.closed) this.fail(instruction, 'instruction after outer end');
    const { name, immediates } = instruction;
    const frameIndex = this.stack[this.stack.length - 1];
    const frame = this.frames[frameIndex];
    if (blockNames.has(name)) {
      // try_table handlers resolve in the surrounding label context.
      if (name === 'try_table' && this.functionBody) {
        immediates.catches.forEach((entry, catchIndex) => {
          this.branches.push({ instructionIndex, kind: 'catch', catchIndex,
            targets: [this.target(instruction, entry.labelIndex)] });
        });
      }
      const child = { kind: name, startIndex: instructionIndex, parent: frameIndex,
        endIndex: null, elseIndex: null, handlers: [] };
      this.frames.push(child);
      this.stack.push(this.frames.length - 1);
    } else if (name === 'else') {
      if (frame.kind !== 'if') this.fail(instruction, 'else outside its if');
      if (frame.elseIndex !== null) this.fail(instruction, 'duplicate else');
      frame.elseIndex = instructionIndex;
    } else if (name === 'catch' || name === 'catch_all') {
      if (frame.kind !== 'try') this.fail(instruction, 'legacy catch outside its try');
      if (frame.handlers.length && frame.handlers[frame.handlers.length - 1].kind === 'catch_all') {
        this.fail(instruction, 'handler after catch_all');
      }
      const handler = { kind: name, instructionIndex };
      if (name === 'catch') handler.tagIndex = immediates.tagIndex;
      frame.handlers.push(handler);
    } else if (name === 'end') {
      frame.endIndex = instructionIndex;
      this.stack.pop();
      this.closed = this.stack.length === 0;
    } else if (this.functionBody) {
      if (branchNames.has(name)) {
        this.branches.push({ instructionIndex, kind: name,
          targets: [this.target(instruction, immediates.labelIndex)] });
      } else if (name === 'br_table') {
        this.branches.push({ instructionIndex, kind: name,
          targets: [...immediates.targets, immediates.defaultTarget].map(depth => this.target(instruction, depth)) });
      } else if (name === 'return') {
        this.branches.push({ instructionIndex, kind: name, targets: [{ depth: this.stack.length - 1, frameIndex: 0 }] });
      } else if (name === 'rethrow') {
        const target = this.target(instruction, immediates.labelIndex);
        const caught = this.frames[target.frameIndex];
        if (caught.kind !== 'try' || caught.handlers.length === 0) {
          this.fail(instruction, 'rethrow target is not an enclosing active legacy catch');
        }
        this.branches.push({ instructionIndex, kind: name,
          targets: [{ ...target, handlerIndex: caught.handlers[caught.handlers.length - 1].instructionIndex }] });
      }
    }
    return this.closed;
  }

  finish() {
    if (!this.closed) throw new Error('Unterminated expression in control analysis');
    for (const branch of this.branches) {
      for (const target of branch.targets) {
        const frame = this.frames[target.frameIndex];
        target.kind = frame.kind;
        // These are instruction destinations only, not validated branch arities.
        if (branch.kind !== 'rethrow') target.targetIndex = frame.kind === 'loop' ? frame.startIndex + 1 : frame.endIndex + 1;
      }
    }
    return { frames: this.frames, branches: this.branches };
  }
}

function analyzeFunctionControl(instructions) {
  const analyzer = new ControlAnalyzer({ functionBody: true });
  instructions.forEach((instruction, index) => analyzer.accept(instruction, index));
  return analyzer.finish();
}

module.exports = { ControlAnalyzer, analyzeFunctionControl };
