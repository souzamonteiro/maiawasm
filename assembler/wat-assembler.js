#!/usr/bin/env node

/**
 * WebAssembly Text Format (WAT) Assembler
 * 
 * Converts WebAssembly text format (.wat) to binary WebAssembly (.wasm)
 * using a generated parser and tree-based code generation.
 * 
 * Follows the sample-calculator.js pattern:
 * - Use ParseTreeCollector to build parse tree
 * - Traverse tree with recursive visitor functions
 * - Emit bytecode during traversal
 * 
 * Usage:
 *   wat-assembler.js input.wat [output.wasm]
 *   wat-assembler.js input.wat --json        (output parse tree as JSON)
 *   wat-assembler.js input.wat --xml         (output parse tree as XML)
 */

const fs = require('fs');
const path = require('path');

const Parser = require('./wat-parser');
const { ParseTreeCollector } = require('./parse-tree-collector');

// ============================================================================
// UTILITY FUNCTIONS - TREE NAVIGATION
// ============================================================================

function assertNonterminal(node, name) {
  if (!node || node.kind !== 'nonterminal' || node.name !== name) {
    throw new Error(
      `Expected nonterminal '${name}', ` +
      `got '${node ? node.name || node.kind : 'null'}'`
    );
  }
}

function assertTerminal(node) {
  if (!node || node.kind !== 'terminal') {
    throw new Error(`Expected terminal node, got ${node ? node.kind : 'null'}`);
  }
}

/**
 * Get first child nonterminal matching name
 */
function getChildByName(parent, name, index = 0) {
  const children = parent.children || [];
  let count = 0;
  for (const child of children) {
    if (child.kind === 'nonterminal' && child.name === name) {
      if (count === index) return child;
      count++;
    }
  }
  return null;
}

/**
 * Get first child terminal matching token type
 */
function getChildByToken(parent, tokenType, index = 0) {
  const children = parent.children || [];
  let count = 0;
  for (const child of children) {
    if (child.kind === 'terminal' && child.token === tokenType) {
      if (count === index) return child;
      count++;
    }
  }
  return null;
}

/**
 * Get terminal value (must be a terminal)
 */
function getTerminalValue(node) {
  assertTerminal(node);
  return node.value;
}

/**
 * Get all children matching name
 */
function getChildValues(parent, nodeName) {
  const result = [];
  const children = parent.children || [];
  for (const child of children) {
    if (child.kind === 'nonterminal' && child.name === nodeName) {
      result.push(child);
    }
  }
  return result;
}

// ============================================================================
// ENCODING FUNCTIONS
// ============================================================================

/**
 * Encode an unsigned LEB128 integer
 */
function encodeULEB128(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

/**
 * Encode a signed LEB128 integer
 */
function encodeSLEB128(value) {
  const bytes = [];
  let more = true;
  while (more) {
    let byte = value & 0x7f;
    value >>= 7;
    more = !((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0));
    if (more) byte |= 0x80;
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

/**
 * Encode an IEEE 754 32-bit float (little-endian)
 */
function encodeF32(value) {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(parseFloat(value), 0);
  return buf;
}

/**
 * Encode an IEEE 754 64-bit double (little-endian)
 */
function encodeF64(value) {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(parseFloat(value), 0);
  return buf;
}

// ============================================================================
// ASSEMBLER CONTEXT
// ============================================================================

class WatContext {
  constructor() {
    // Module structure
    this.functions = [];       // Function definitions
    this.types = [];           // Type definitions
    this.imports = [];         // Import entries
    this.exports = [];         // Export entries
    this.globals = [];         // Global variables
    this.memories = [];        // Memory instances
    this.tables = [];          // Table instances
    this.datas = [];           // Data segments
    this.elements = [];        // Element segments
    this.start = null;         // Start function index
    this.tags = [];            // Exception tag definitions
    
    // Code generation state
    this.typeMap = new Map();  // Signature -> type index
    this.functionIndices = new Map(); // Function name -> index
    this.codeBuffers = [];     // Per-function bytecode
    this.localNameMap = null;  // Current function's locals (name -> index)
    this.labelStack = [];      // Stack of label contexts (for br/br_if)
  }

  addType(type) {
    this.types.push(type);
    return this.types.length - 1;
  }

  addFunction(func) {
    const idx = this.functions.length;
    this.functions.push(func);
    return idx;
  }

  addExport(name, kind, index) {
    this.exports.push({ name, kind, index });
  }

  pushLabel(labelId) {
    this.labelStack.push(labelId);
  }

  popLabel() {
    return this.labelStack.pop();
  }

  currentLabel() {
    return this.labelStack.length > 0 ? this.labelStack[this.labelStack.length - 1] : null;
  }
}

// ============================================================================
// TREE VISITORS - MODULE PROCESSING
// ============================================================================

function processWat(watNode, context) {
  assertNonterminal(watNode, 'wat');
  const watBody = getChildByName(watNode, 'watBody');
  assertNonterminal(watBody, 'watBody');
  
  const moduleNode = getChildByName(watBody, 'module');
  if (moduleNode) {
    processModule(moduleNode, context);
  }
}

function processModule(moduleNode, context) {
  assertNonterminal(moduleNode, 'module');
  const children = moduleNode.children || [];

  // Iterate through all module fields
  for (const child of children) {
    if (child.kind !== 'nonterminal') continue;
    if (child.name === 'moduleField') {
      processModuleField(child, context);
    }
  }
}

function processModuleField(fieldNode, context) {
  const children = fieldNode.children || [];
  const firstChild = children.find(c => c.kind === 'nonterminal');
  
  if (!firstChild) return;

  switch (firstChild.name) {
    case 'typeDef':
      processTypeDef(firstChild, context);
      break;
    case 'importDef':
      processImportDef(firstChild, context);
      break;
    case 'funcDef':
      processFuncDef(firstChild, context);
      break;
    case 'globalDef':
      processGlobalDef(firstChild, context);
      break;
    case 'memDef':
      processMemDef(firstChild, context);
      break;
    case 'tableDef':
      processTableDef(firstChild, context);
      break;
    case 'exportDef':
      processExportDef(firstChild, context);
      break;
    case 'startDef':
      processStartDef(firstChild, context);
      break;
    case 'dataDef':
      processDataDef(firstChild, context);
      break;
    case 'elemDef':
      processElemDef(firstChild, context);
      break;
    case 'tagDef':
      processTagDef(firstChild, context);
      break;
  }
}

// ============================================================================
// FIELD PROCESSORS (STUBS FOR IMPLEMENTATION)
// ============================================================================

function processTypeDef(node, context) {
  // TODO: Extract type definition and add to context.types
  // Rule: typeDef ::= '(' 'type' id? rectype ')'
}

function processImportDef(node, context) {
  // TODO: Process import statements
  // Validates that imported items match declarations
}

function processFuncDef(node, context) {
  // TODO: Parse function definition including:
  // - Parameters (paramDecl)
  // - Result types (resultDecl)
  // - Local variables (localDecl)
  // - Function body (expr / instr)
}

function processGlobalDef(node, context) {
  // TODO: Parse global variable definitions
  // globalDef ::= '(' 'global' id? globalType expr ')'
}

function processMemDef(node, context) {
  // TODO: Parse memory definitions
  // memDef ::= '(' 'memory' id? limits ')'
}

function processTableDef(node, context) {
  // TODO: Parse table definitions
  // tableDef ::= '(' 'table' id? limits reftype ... ')'
}

function processExportDef(node, context) {
  // TODO: Process export statements
  // exportDef ::= '(' 'export' string exportDesc ')'
}

function processStartDef(node, context) {
  // TODO: Set start function
  // startDef ::= '(' 'start' index ')'
}

function processDataDef(node, context) {
  // TODO: Store data segment
  // dataDef ::= '(' 'data' id? ... datastring ')'
}

function processElemDef(node, context) {
  // TODO: Store element segment
  // elemDef ::= '(' 'elem' id? ... elemList ')'
}

function processTagDef(node, context) {
  // TODO: Define exception tag
  // tagDef ::= '(' 'tag' id? tagType ')'
}

// ============================================================================
// INSTRUCTION PROCESSING (STUBS FOR IMPLEMENTATION)
// ============================================================================

function processInstr(instrNode, context) {
  // TODO: Process instruction and emit bytecode
  // Dispatch on foldedInstr vs seqInstr
  // Return bytecode buffer
}

function processExpr(exprNode, context) {
  // TODO: Process expression (sequence of instructions)
  // expr ::= instr*
}

// ============================================================================
// BINARY OUTPUT
// ============================================================================

/**
 * Emit section with ID and contents
 */
function emitSection(sectionId, contents) {
  const size = encodeULEB128(contents.length);
  return Buffer.concat([Buffer.from([sectionId]), size, contents]);
}

/**
 * Build final WASM module
 */
function emitModule(context) {
  const parts = [];

  // File signature and version
  parts.push(Buffer.from([0x00, 0x61, 0x73, 0x6d])); // Magic: \0asm
  parts.push(Buffer.from([0x01, 0x00, 0x00, 0x00])); // Version: 1

  // TODO: Emit type section (id=1)
  // TODO: Emit import section (id=2)
  // TODO: Emit function section (id=3)
  // TODO: Emit table section (id=4)
  // TODO: Emit memory section (id=5)
  // TODO: Emit global section (id=6)
  // TODO: Emit export section (id=7)
  // TODO: Emit start section (id=8)
  // TODO: Emit element section (id=9)
  // TODO: Emit code section (id=10)
  // TODO: Emit data section (id=11)
  // TODO: Emit data count section (id=12)
  // Custom sections for names, producers, etc.

  return Buffer.concat(parts);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: wat-assembler.js input.wat [output.wasm]');
    console.error('       wat-assembler.js input.wat --json   (show parse tree)');
    console.error('       wat-assembler.js input.wat --xml    (show parse tree)');
    process.exit(1);
  }

  const inputFile = args[0];
  let outputFile = args[1] || null;
  let outputFormat = 'wasm'; // 'wasm', 'json', or 'xml'

  if (outputFile === '--json') {
    outputFormat = 'json';
    outputFile = null;
  } else if (outputFile === '--xml') {
    outputFormat = 'xml';
    outputFile = null;
  }

  // Read input
  let inputContent;
  try {
    inputContent = fs.readFileSync(inputFile, 'utf8');
  } catch (err) {
    console.error(`❌ Error reading input: ${err.message}`);
    process.exit(1);
  }

  // Parse to tree
  let collector;
  try {
    collector = new ParseTreeCollector();
    const parser = new Parser(inputContent, collector);
    parser.parse();
  } catch (err) {
    console.error(`❌ Parse error: ${err.message}`);
    process.exit(1);
  }

  // Output tree if requested
  if (outputFormat === 'json') {
    console.log(collector.toJSON());
    return;
  }

  if (outputFormat === 'xml') {
    console.log(collector.toXml());
    return;
  }

  // Assemble to WASM
  let wasmBuffer;
  try {
    const context = new WatContext();
    processWat(collector.root, context);
    wasmBuffer = emitModule(context);
  } catch (err) {
    console.error(`❌ Assembly error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }

  // Write output
  if (!outputFile) {
    const base = path.basename(inputFile, path.extname(inputFile));
    outputFile = path.join(path.dirname(inputFile), `${base}.wasm`);
  }

  try {
    fs.writeFileSync(outputFile, wasmBuffer);
    console.log(`✅ Generated: ${outputFile} (${wasmBuffer.length} bytes)`);
  } catch (err) {
    console.error(`❌ Error writing output: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  WatContext,
  processWat,
  processModule,
  encodeULEB128,
  encodeSLEB128,
  encodeF32,
  encodeF64,
};
