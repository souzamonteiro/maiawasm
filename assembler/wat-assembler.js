/**
 * WAT to WASM Assembler
 * Converts WebAssembly Text format to WASM binary
 */
const SimpleWATParser = require('./wat-parser-adapter.js');

// ============================================================================
// ENCODING HELPERS
// ============================================================================

function encodeULEB128(value) {
  const bytes = [];
  while ((value & 0xffffff80) !== 0) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

function encodeSLEB128(value) {
  const bytes = [];
  while (true) {
    let byte = value & 0x7f;
    value >>= 7;
    if ((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0)) {
      bytes.push(byte);
      break;
    }
    bytes.push(byte | 0x80);
  }
  return Buffer.from(bytes);
}

// ============================================================================
// CODE BUFFER - Manages bytecode emission
// ============================================================================

class CodeBuffer {
  constructor() {
    this.bytes = [];
  }

  emit(byte) {
    this.bytes.push(byte & 0xFF);
  }

  emitBytes(buffer) {
    if (Buffer.isBuffer(buffer)) {
      this.bytes.push(...Array.from(buffer));
    } else if (Array.isArray(buffer)) {
      this.bytes.push(...buffer);
    }
  }

  emitULEB128(value) {
    const buf = encodeULEB128(value);
    this.emitBytes(buf);
  }

  emitSLEB128(value) {
    const buf = encodeSLEB128(value);
    this.emitBytes(buf);
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }
}

// ============================================================================
// WASM SECTION EMISSION
// ============================================================================

function emitSection(id, content) {
  const parts = [];
  parts.push(Buffer.from([id]));
  parts.push(encodeULEB128(content.length));
  if (content.length > 0) {
    parts.push(content);
  }
  return Buffer.concat(parts);
}

function emitModule(functions) {
  const parts = [];

  // Magic: \0asm
  parts.push(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  // Version: 1
  parts.push(Buffer.from([0x01, 0x00, 0x00, 0x00]));

  // Type section (id=1)
  if (functions.length > 0) {
    const typeContent = new CodeBuffer();
    typeContent.emitULEB128(functions.length); // one type per function
    for (const func of functions) {
      typeContent.emit(0x60); // function type
      typeContent.emitULEB128(func.params.length);
      for (const param of func.params) {
        typeContent.emit(getTypeCode(param));
      }
      typeContent.emitULEB128(func.results.length);
      for (const result of func.results) {
        typeContent.emit(getTypeCode(result));
      }
    }
    parts.push(emitSection(0x01, typeContent.toBuffer()));
  }

  // Function section (id=3)
  if (functions.length > 0) {
    const funcContent = new CodeBuffer();
    funcContent.emitULEB128(functions.length);
    for (let i = 0; i < functions.length; i++) {
      funcContent.emitULEB128(i); // type index
    }
    parts.push(emitSection(0x03, funcContent.toBuffer()));
  }

  // Code section (id=10)
  if (functions.length > 0) {
    const codeContent = new CodeBuffer();
    codeContent.emitULEB128(functions.length);

    for (const func of functions) {
      const body = new CodeBuffer();
      body.emitULEB128(0); // 0 local groups
      body.emitBytes(func.code);
      body.emit(0x0B); // end

      const bodyBuf = body.toBuffer();
      codeContent.emitULEB128(bodyBuf.length);
      codeContent.emitBytes(bodyBuf);
    }

    parts.push(emitSection(0x0A, codeContent.toBuffer()));
  }

  return Buffer.concat(parts);
}

// ============================================================================
// TYPE UTILITIES
// ============================================================================

function getTypeCode(type) {
  const types = {
    'i32': 0x7F,
    'i64': 0x7E,
    'f32': 0x7D,
    'f64': 0x7C,
  };
  return types[type] || 0x7F;
}

// ============================================================================
// INSTRUCTION HANDLERS
// ============================================================================

const OpcodeMap = {
  // Control flow
  'nop': 0x01,
  'return': 0x0F,

  // Numeric constants
  'i32.const': 0x41,
  'i64.const': 0x42,
  'f32.const': 0x43,
  'f64.const': 0x44,

  // Numeric binary operations
  'i32.add': 0x6A,
  'i32.sub': 0x6B,
  'i32.mul': 0x6C,
  'i32.div_s': 0x6D,
  'i32.div_u': 0x6E,
  'i32.rem_s': 0x6F,
  'i32.rem_u': 0x70,
  'i32.and': 0x71,
  'i32.or': 0x72,
  'i32.xor': 0x73,
  'i32.shl': 0x74,
  'i32.shr_s': 0x75,
  'i32.shr_u': 0x76,
  'i32.rotl': 0x77,
  'i32.rotr': 0x78,

  'i64.add': 0x7C,
  'i64.sub': 0x7D,
  'i64.mul': 0x7E,
  'i64.div_s': 0x7F,
  'i64.div_u': 0x80,

  'f32.add': 0x92,
  'f32.sub': 0x93,
  'f32.mul': 0x94,
  'f32.div': 0x95,

  'f64.add': 0xA0,
  'f64.sub': 0xA1,
  'f64.mul': 0xA2,
  'f64.div': 0xA3,
};

function emitInstructions(ast, codeBuffer) {
  if (!ast) return;

  // Handle different AST node types
  if (Array.isArray(ast)) {
    for (const node of ast) {
      emitInstructions(node, codeBuffer);
    }
    return;
  }

  if (ast.type && ast.type.startsWith('i32.') && OpcodeMap[ast.type]) {
    const opcode = OpcodeMap[ast.type];
    codeBuffer.emit(opcode);
    
    if (ast.type === 'i32.const' && ast.value !== undefined) {
      codeBuffer.emitSLEB128(ast.value);
    }
  } else if (ast.type && OpcodeMap[ast.type]) {
    const opcode = OpcodeMap[ast.type];
    codeBuffer.emit(opcode);
  }

  if (ast.children && Array.isArray(ast.children)) {
    emitInstructions(ast.children, codeBuffer);
  }
}

// ============================================================================
// MAIN ASSEMBLER CLASS
// ============================================================================

class WatAssembler {
  assemble(sourceWat) {
    const parser = new SimpleWATParser(sourceWat);
    const ast = parser.parse();

    // Extract functions from AST
    const functions = [];
    
    if (ast.type === 'module' && ast.children) {
      for (const child of ast.children) {
        if (child.type === 'func') {
          const func = {
            params: [],
            results: [],
            code: new CodeBuffer(),
          };

          // Parse parameters and result types
          if (child.params) {
            for (const param of child.params) {
              func.params.push(param.type || 'i32');
            }
          }

          if (child.results && child.results.length > 0) {
            for (const result of child.results) {
              func.results.push(result.type || 'i32');
            }
          } else {
            // Default result type
            func.results.push('i32');
          }

          // Parse function body (instructions)
          if (child.body) {
            this._emitInstructions(child.body, func.code);
          }

          functions.push(func);
        }
      }
    }

    return emitModule(functions);
  }

  _emitInstructions(instructions, codeBuffer) {
    for (const instr of instructions) {
      if (!instr.type) continue;

      const opcode = OpcodeMap[instr.type];
      if (opcode === undefined) {
        console.warn(`Unknown instruction: ${instr.type}`);
        continue;
      }

      codeBuffer.emit(opcode);

      // Handle operands
      if ((instr.type === 'i32.const' || instr.type === 'i64.const' ||
           instr.type === 'f32.const' || instr.type === 'f64.const') &&
          instr.value) {
        if (instr.value.type === 'literal') {
          codeBuffer.emitSLEB128(instr.value.value);
        } else if (instr.value.value !== undefined) {
          codeBuffer.emitSLEB128(instr.value.value);
        }
      }

      // Handle nested instructions
      if (instr.children && Array.isArray(instr.children)) {
        this._emitInstructions(instr.children, codeBuffer);
      }
    }
  }
}

if (require.main === module) {
  const code = `(module (func $add (param i32) (param i32) (result i32) local.get 0 local.get 1 i32.add))`;
  const assembler = new WatAssembler();
  const wasm = assembler.assemble(code);
  console.log('✓ WASM binary length:', wasm.length);
  console.log('✓ First 16 bytes:', wasm.slice(0, 16).toString('hex'));
}

module.exports = WatAssembler;
