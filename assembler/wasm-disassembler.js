/**
 * WASM to WAT Disassembler
 * Converts WebAssembly binary to WAT text format
 * Compatible with WebAssembly 3.0 and the wat-assembler.js format
 */
'use strict';

const { quoteWatBytes, quoteWatName } = require('./wasm-strings.js');
const { decodeInstructions: decodeInstructionRecords } = require('./wasm-instructions.js');
const { instructionToWat, valueTypeToWat } = require('./wasm-instruction-wat.js');
const { ModuleDecoder } = require('./wasm-module.js');

// ============================================================================
// DECODING HELPERS
// ============================================================================

const {
  decodeULEB128,
  decodeSLEB128,
  decodeUTF8,
  decodeF32,
  decodeF64,
  ValTypeName,
  PackedTypeName,
  HeapTypeName
} = require('./wasm-binary.js');

// ============================================================================
// SECTION DECODING
// ============================================================================

class WasmDisassembler extends ModuleDecoder {
  resetState() {
    super.resetState();
    this.output = [];
  }

  readValueType(context, referenceOnly = false) {
    const type = super.readValueType(context, referenceOnly);
    return typeof type === 'object' ? valueTypeToWat(type) : type;
  }

  parseSubtype() {
    const type = super.parseSubtype();
    if (type.kind === 'func') {
      type.params = type.params.map(value => this.typeToString(value));
      type.results = type.results.map(value => this.typeToString(value));
    }
    return type;
  }

  typeToString(type) {
    if (typeof type === 'string') return type;
    if (PackedTypeName[type]) return PackedTypeName[type];
    return valueTypeToWat(type);
  }

  disassemble() {
    super.decode();
    this.output = ['(module'];
    this.generateTypeSection();
    this.generateImportSection();
    this.generateFunctionSection();
    this.generateTableSection();
    this.generateMemorySection();
    this.generateGlobalSection();
    this.generateExportSection();
    this.generateStartSection();
    this.generateElementSection();
    this.generateDataCountSection();
    this.generateCodeSection();
    this.generateDataSection();
    this.generateTagSection();
    this.output.push(')');
    return this.output.join('\n');
  }

  generateTypeSection() {
    if (this.typeGroups.length === 0) return;
    this.output.push('');
    const composite = type => {
      if (type.kind === 'func') {
        const params = type.params.length ? ` (param ${type.params.join(' ')})` : '';
        const results = type.results.length ? ` (result ${type.results.join(' ')})` : '';
        return `(func${params}${results})`;
      }
      const field = f => f.mutable ? `(mut ${this.typeToString(f.storage)})` : this.typeToString(f.storage);
      if (type.kind === 'struct') return `(struct${type.fields.map(f => ` (field ${field(f)})`).join('')})`;
      return `(array ${field(type.field)})`;
    };
    const subtype = type => {
      const body = composite(type);
      const st = type.subtype;
      if (!st.explicit) return body;
      return `(sub${st.isFinal ? ' final' : ''}${st.supertypes.map(i => ` ${i}`).join('')} ${body})`;
    };
    this.typeGroups.forEach(group => {
      const types = this.typeSection.slice(group.startIndex, group.startIndex + group.size);
      if (group.recursive) {
        this.output.push(`  (rec${types.map(t => ` (type ${subtype(t)})`).join('')})`);
      } else {
        this.output.push(`  (type ${subtype(types[0])})`);
      }
    });
  }

  generateImportSection() {
    if (this.importSection.length === 0) return;
    
    this.output.push('');
    this.importSection.forEach(imp => {
      this.output.push(`  (import ${quoteWatName(imp.module)} ${quoteWatName(imp.name)}`);
      switch (imp.kind) {
        case 0x00: // Function
          this.output.push(`    (func (type ${imp.typeIdx})))`);
          break;
        case 0x01: // Table
          this.output.push(`    (table ${this.limitsToString(imp.tableType.limits)} ${this.typeToString(imp.tableType.elemType)}))`);
          break;
        case 0x02: // Memory
          this.output.push(`    (memory ${this.limitsToString(imp.memoryType)}))`);
          break;
        case 0x03: // Global
          this.output.push(`    (global ${imp.globalType.mutable ? '(mut ' : ''}${this.typeToString(imp.globalType.valType)}${imp.globalType.mutable ? ')' : ''}))`);
          break;
        case 0x04: // Tag
          this.output.push(`    (tag (type ${imp.typeIdx})))`);
          break;
      }
    });
  }

  limitsToString(limits) {
    if (limits.max !== undefined) {
      return `${limits.min} ${limits.max}`;
    }
    return `${limits.min}`;
  }

  decodeExpressionInstructions(code, localTypes) {
    const instructions = this.decodeInstructions(code, localTypes);
    if (instructions.length > 0 && instructions[instructions.length - 1] === 'end') {
      instructions.pop();
    }
    return instructions;
  }

  getImportedFunctionCount() {
    return this.importSection.filter(imp => imp.kind === 0x00).length;
  }

  generateFunctionSection() {
    // Functions are emitted together with code bodies in generateCodeSection.
  }

  generateTableSection() {
    if (this.tableSection.length === 0) return;

    this.output.push('');
    this.tableSection.forEach(table => {
      this.output.push(`  (table ${this.limitsToString(table.limits)} ${this.typeToString(table.elemType)})`);
    });
  }

  generateMemorySection() {
    if (this.memorySection.length === 0) return;

    this.output.push('');
    this.memorySection.forEach(memory => {
      this.output.push(`  (memory ${this.limitsToString(memory)})`);
    });
  }

  generateGlobalSection() {
    if (this.globalSection.length === 0) return;

    this.output.push('');
    this.globalSection.forEach(global => {
      const typeName = this.typeToString(global.globalType.valType);
      const globalType = global.globalType.mutable ? `(mut ${typeName})` : typeName;
      const instructions = this.decodeExpressionInstructions(global.initExpr, []);
      const initInstr = instructions.join(' ');
      this.output.push(`  (global ${globalType} ${instructions.length === 1 ? `(${initInstr})` : initInstr})`);
    });
  }

  generateExportSection() {
    if (this.exportSection.length === 0) return;

    this.output.push('');
    this.exportSection.forEach(exp => {
      const kindMap = {
        0x00: 'func',
        0x01: 'table',
        0x02: 'memory',
        0x03: 'global',
        0x04: 'tag'
      };
      const kind = kindMap[exp.kind] || 'unknown';
      this.output.push(`  (export ${quoteWatName(exp.name)} (${kind} ${exp.index}))`);
    });
  }

  generateStartSection() {
    if (this.startSection === null) return;

    this.output.push('');
    this.output.push(`  (start ${this.startSection})`);
  }

  generateElementSection() {
    if (this.elementSection.length === 0) return;

    this.output.push('');
    this.elementSection.forEach(elem => {
      const parts = ['  (elem'];
      if (elem.mode === 'declarative') {
        parts.push('declare');
      } else if (elem.mode === 'active') {
        if (elem.tableIndex !== 0) parts.push(`(table ${elem.tableIndex})`);
        const offset = this.decodeExpressionInstructions(elem.initExpr, []).join(' ');
        parts.push(`(offset ${offset})`);
      }
      if (elem.useExpressions) {
        parts.push(typeof elem.reftype === 'string' ? elem.reftype :
          ValTypeName[elem.reftype] || `(ref null ${HeapTypeName[elem.reftype]})`);
        parts.push(...elem.elements.map(expr => `(item ${this.decodeExpressionInstructions(expr, []).join(' ')})`));
      } else {
        parts.push('func', ...elem.elements.map(String));
      }
      this.output.push(`${parts.join(' ')})`);
    });
  }

  generateDataCountSection() {
    // Kept intentionally empty to avoid emitting non-standard/comment metadata.
  }

  generateCodeSection() {
    if (this.codeSection.length === 0) return;

    this.output.push('');
    const importedFuncCount = this.getImportedFunctionCount();

    this.codeSection.forEach((body, i) => {
      const funcIndex = importedFuncCount + i;
      const typeIdx = this.functionSection[i];
      const typeInfo = this.typeSection[typeIdx] || { kind: 'func', params: [], results: [] };

      const parts = ['  (func'];
      if (typeof typeIdx === 'number') {
        parts.push(`(type ${typeIdx})`);
      }
      if (typeInfo.kind === 'func' && typeInfo.params.length > 0) {
        parts.push(`(param ${typeInfo.params.join(' ')})`);
      }
      if (typeInfo.kind === 'func' && typeInfo.results.length > 0) {
        parts.push(`(result ${typeInfo.results.join(' ')})`);
      }

      this.output.push(parts.join(' '));

      body.locals.forEach(local => {
        const localType = this.typeToString(local.valType);
        const localTypes = [];
        for (let n = 0; n < local.count; n++) {
          localTypes.push(localType);
        }
        this.output.push(`    (local ${localTypes.join(' ')})`);
      });

      const instructions = body.instructions.slice(0, -1).map(instructionToWat);
      instructions.forEach(instr => {
        this.output.push(`    ${instr}`);
      });

      this.output.push('  )');
    });
  }

  generateDataSection() {
    if (this.dataSection.length === 0) return;

    this.output.push('');
    this.dataSection.forEach(data => {
      const escaped = quoteWatBytes(data.bytes);
      if (data.mode === 'passive') {
        this.output.push(`  (data ${escaped})`);
      } else {
        const instructions = data.offsetExpr ? this.decodeExpressionInstructions(data.offsetExpr, []) : ['i32.const 0'];
        const offset = instructions.join(' ');
        const expression = instructions.length === 1 ? `(${offset})` : offset;
        if (data.memoryIndex === 0) {
          this.output.push(`  (data ${instructions.length === 1 ? expression : `(offset ${offset})`} ${escaped})`);
        } else {
          this.output.push(`  (data (memory ${data.memoryIndex}) (offset ${expression}) ${escaped})`);
        }
      }
    });
  }

  generateTagSection() {
    if (this.tagSection.length === 0) return;

    this.output.push('');
    this.tagSection.forEach(tag => {
      this.output.push(`  (tag (type ${tag.typeIdx}))`);
    });
  }

  decodeInstructions(code, localTypes) {
    return decodeInstructionRecords(code).map(instructionToWat);
  }

}

// ============================================================================
// MAIN DISASSEMBLER
// ============================================================================

function disassembleWASM(buffer) {
  const disassembler = new WasmDisassembler(buffer);
  return disassembler.disassemble();
}

module.exports = { WasmDisassembler, disassembleWASM };
module.exports.__test = {
  decodeULEB128,
  decodeSLEB128,
  decodeUTF8,
  decodeF32,
  decodeF64,
};

if (require.main === module) {
  // Simple test if run directly
  const fs = require('fs');
  const path = require('path');
  
  const wasmFile = process.argv[2];
  if (wasmFile) {
    const buffer = fs.readFileSync(wasmFile);
    try {
      const wat = disassembleWASM(buffer);
      console.log(wat);
    } catch (e) {
      console.error(`Disassembly failed: ${e.message}`);
    }
  } else {
    console.log('Usage: node wasm-disassembler.js <file.wasm>');
  }
}
