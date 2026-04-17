#!/usr/bin/env node
/**
 * WASM Linker (MVP)
 *
 * Uses wasm-disassembler.js to inspect symbols and build a link plan.
 * Emits an optional JavaScript loader that wires module imports/exports at runtime.
 *
 * Notes:
 * - This is a dynamic linker (runtime instantiation graph), not a static binary linker.
 * - Static linking into a single .wasm requires relocation-aware rewriting.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { WasmDisassembler } = require('./wasm-disassembler.js');
const WatAssembler = require('./wat-assembler.js');

function usage() {
  console.log(`Usage: node assembler/wasm-linker.js <module1.wasm> [module2.wasm ...] [options]

Options:
  -o, --output <file.js>      Output loader JS file (optional)
  -w, --wasm-output <file>    Output linked WASM file (static mode)
  -e, --entry <moduleId>      Entry module id (default: first module)
  --strict                    Fail on unresolved imports
  --static                    Emit a single linked WASM (partial: functions + local/imported memory/table/global + elem/data)
  --validate-roundtrip        Validate disassembler->assembler roundtrip per input module
  -h, --help                  Show this help

Examples:
  node assembler/wasm-linker.js app.wasm math.wasm --strict
  node assembler/wasm-linker.js app.wasm math.wasm -o linked-loader.js -e app
  node assembler/wasm-linker.js app.wasm math.wasm --static -w linked.wasm -e app
`);
}

function parseArgs(argv) {
  const wasmFiles = [];
  const options = {
    output: null,
    wasmOutput: null,
    entry: null,
    strict: false,
    static: false,
    validateRoundtrip: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '-o' || arg === '--output') {
      options.output = argv[++index];
      if (!options.output) throw new Error('Missing value for --output');
      continue;
    }

    if (arg === '-e' || arg === '--entry') {
      options.entry = argv[++index];
      if (!options.entry) throw new Error('Missing value for --entry');
      continue;
    }

    if (arg === '-w' || arg === '--wasm-output') {
      options.wasmOutput = argv[++index];
      if (!options.wasmOutput) throw new Error('Missing value for --wasm-output');
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '--static') {
      options.static = true;
      continue;
    }

    if (arg === '--validate-roundtrip') {
      options.validateRoundtrip = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    wasmFiles.push(arg);
  }

  return { wasmFiles, options };
}

function readFileChecked(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function normalizeModuleId(disassembler, filePath, usedIds) {
  const byNameSection = (disassembler.nameSection && disassembler.nameSection.moduleName) || '';
  const base = path.basename(filePath, path.extname(filePath));
  const preferred = sanitizeIdentifier(byNameSection || base || 'module');
  let candidate = preferred;
  let suffix = 1;

  while (usedIds.has(candidate)) {
    candidate = `${preferred}_${suffix++}`;
  }

  usedIds.add(candidate);
  return candidate;
}

function sanitizeIdentifier(value) {
  return String(value).replace(/[^a-zA-Z0-9_$]/g, '_');
}

function cloneTypeSignature(sig) {
  return {
    params: [...(sig.params || [])],
    results: [...(sig.results || [])],
  };
}

function signatureToKey(sig) {
  return `${(sig.params || []).join(',')}->${(sig.results || []).join(',')}`;
}

function getImportedFunctionCount(importSection) {
  return importSection.filter(imp => imp.kind === 0x00).length;
}

function getImportedMemoryCount(importSection) {
  return importSection.filter(imp => imp.kind === 0x02).length;
}

function getImportedTableCount(importSection) {
  return importSection.filter(imp => imp.kind === 0x01).length;
}

function getImportedGlobalCount(importSection) {
  return importSection.filter(imp => imp.kind === 0x03).length;
}

function getFunctionType(moduleInfo, funcIndex) {
  const importedFunctionCount = moduleInfo.importedFunctionCount;
  if (funcIndex < importedFunctionCount) {
    const importedFunctions = moduleInfo.imports.filter(imp => imp.kind === 0x00);
    const imp = importedFunctions[funcIndex];
    if (!imp || imp.typeIdx === undefined) return null;
    return moduleInfo.typeSection[imp.typeIdx] || null;
  }

  const localIndex = funcIndex - importedFunctionCount;
  const typeIdx = moduleInfo.functionSection[localIndex];
  if (typeIdx === undefined) return null;
  return moduleInfo.typeSection[typeIdx] || null;
}

function describeImportType(moduleInfo, imp) {
  if (imp.kind === 0x00) {
    const sig = moduleInfo.typeSection[imp.typeIdx] || { params: [], results: [] };
    return {
      kind: 'func',
      signature: cloneTypeSignature(sig),
      signatureKey: signatureToKey(sig),
    };
  }
  if (imp.kind === 0x01) {
    return { kind: 'table', type: imp.tableType || null };
  }
  if (imp.kind === 0x02) {
    return { kind: 'memory', type: imp.memoryType || null };
  }
  if (imp.kind === 0x03) {
    return { kind: 'global', type: imp.globalType || null };
  }
  return { kind: `unknown_${imp.kind}` };
}

function describeExportType(moduleInfo, exp) {
  if (exp.kind === 0x00) {
    const sig = getFunctionType(moduleInfo, exp.index) || { params: [], results: [] };
    return {
      kind: 'func',
      signature: cloneTypeSignature(sig),
      signatureKey: signatureToKey(sig),
    };
  }
  if (exp.kind === 0x01) {
    return { kind: 'table', type: moduleInfo.tableSection[exp.index] || null };
  }
  if (exp.kind === 0x02) {
    return { kind: 'memory', type: moduleInfo.memorySection[exp.index] || null };
  }
  if (exp.kind === 0x03) {
    return {
      kind: 'global',
      type: moduleInfo.globalSection[exp.index]
        ? moduleInfo.globalSection[exp.index].globalType
        : null,
    };
  }
  return { kind: `unknown_${exp.kind}` };
}

function compatibleTypes(importType, exportType) {
  if (!importType || !exportType) return false;
  if (importType.kind !== exportType.kind) return false;

  if (importType.kind === 'func') {
    return importType.signatureKey === exportType.signatureKey;
  }

  // For MVP, non-function kinds only require matching kind.
  return true;
}

function encodeULEB128(value) {
  let n = value >>> 0;
  const bytes = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    bytes.push(b);
  } while (n !== 0);
  return Buffer.from(bytes);
}

function encodeSLEB128(value) {
  let n = BigInt(value);
  const bytes = [];
  let more = true;
  while (more) {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    const signBit = (byte & 0x40) !== 0;
    if ((n === 0n && !signBit) || (n === -1n && signBit)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

function decodeULEB128(buffer, offset) {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;

  while (true) {
    if (offset + bytesRead >= buffer.length) {
      throw new Error(`Truncated ULEB128 at offset ${offset}`);
    }
    const byte = buffer[offset + bytesRead];
    result |= (byte & 0x7f) << shift;
    bytesRead += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) {
      throw new Error(`ULEB128 too large at offset ${offset}`);
    }
  }

  return { value: result >>> 0, bytesRead };
}

function decodeSLEB128(buffer, offset) {
  let result = 0n;
  let shift = 0n;
  let byte = 0;
  let bytesRead = 0;

  while (true) {
    if (offset + bytesRead >= buffer.length) {
      throw new Error(`Truncated SLEB128 at offset ${offset}`);
    }
    byte = buffer[offset + bytesRead];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    bytesRead += 1;
    if ((byte & 0x80) === 0) break;
  }

  if (byte & 0x40) {
    result |= (-1n) << shift;
  }

  return { value: result, bytesRead };
}

function encodeSection(id, payload) {
  return Buffer.concat([Buffer.from([id]), encodeULEB128(payload.length), payload]);
}

const VAL_TYPE_CODE = {
  i32: 0x7f,
  i64: 0x7e,
  f32: 0x7d,
  f64: 0x7c,
  v128: 0x7b,
  funcref: 0x70,
  externref: 0x6f,
  exnref: 0x69,
};

function encodeTypeSection(types) {
  if (types.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(types.length)];

  for (const type of types) {
    body.push(Buffer.from([0x60]));
    body.push(encodeULEB128(type.params.length));
    for (const p of type.params) {
      const code = VAL_TYPE_CODE[p];
      if (code === undefined) throw new Error(`Unsupported value type in params: ${p}`);
      body.push(Buffer.from([code]));
    }
    body.push(encodeULEB128(type.results.length));
    for (const r of type.results) {
      const code = VAL_TYPE_CODE[r];
      if (code === undefined) throw new Error(`Unsupported value type in results: ${r}`);
      body.push(Buffer.from([code]));
    }
  }

  return encodeSection(0x01, Buffer.concat(body));
}

function encodeMemoryLimits(limits) {
  if (!limits || limits.min === undefined) {
    throw new Error('Invalid memory limits for import encoding');
  }
  if (limits.max !== undefined) {
    return Buffer.concat([Buffer.from([0x01]), encodeULEB128(limits.min), encodeULEB128(limits.max)]);
  }
  return Buffer.concat([Buffer.from([0x00]), encodeULEB128(limits.min)]);
}

function encodeTableType(tableType) {
  if (!tableType || typeof tableType.elemType !== 'number' || !tableType.limits) {
    throw new Error('Invalid table type for import encoding');
  }
  return Buffer.concat([Buffer.from([tableType.elemType]), encodeMemoryLimits(tableType.limits)]);
}

function encodeGlobalType(globalType) {
  if (!globalType || typeof globalType.valType !== 'number') {
    throw new Error('Invalid global type for import encoding');
  }
  return Buffer.from([globalType.valType, globalType.mutable ? 1 : 0]);
}

function encodeImportSection(importsList) {
  if (importsList.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(importsList.length)];

  for (const imp of importsList) {
    const moduleName = Buffer.from(imp.module, 'utf8');
    const name = Buffer.from(imp.name, 'utf8');
    body.push(encodeULEB128(moduleName.length), moduleName);
    body.push(encodeULEB128(name.length), name);
    body.push(Buffer.from([imp.kind]));

    if (imp.kind === 0x00) {
      body.push(encodeULEB128(imp.typeIdx));
    } else if (imp.kind === 0x01) {
      body.push(encodeTableType(imp.tableType));
    } else if (imp.kind === 0x02) {
      body.push(encodeMemoryLimits(imp.memoryType));
    } else if (imp.kind === 0x03) {
      body.push(encodeGlobalType(imp.globalType));
    } else {
      throw new Error(`Unsupported import kind for encoding: ${imp.kind}`);
    }
  }

  return encodeSection(0x02, Buffer.concat(body));
}

function encodeFunctionSection(typeIndices) {
  if (typeIndices.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(typeIndices.length)];
  for (const typeIdx of typeIndices) {
    body.push(encodeULEB128(typeIdx));
  }
  return encodeSection(0x03, Buffer.concat(body));
}

function encodeTableSection(tableEntries) {
  if (!tableEntries || tableEntries.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(tableEntries.length)];
  for (const table of tableEntries) {
    body.push(encodeTableType(table));
  }
  return encodeSection(0x04, Buffer.concat(body));
}

function encodeMemorySection(memoryEntries) {
  if (!memoryEntries || memoryEntries.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(memoryEntries.length)];
  for (const memory of memoryEntries) {
    body.push(encodeMemoryLimits(memory));
  }
  return encodeSection(0x05, Buffer.concat(body));
}

function encodeGlobalSection(globalEntries) {
  if (!globalEntries || globalEntries.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(globalEntries.length)];
  for (const entry of globalEntries) {
    body.push(encodeGlobalType(entry.globalType));
    if (!entry.initExpr) {
      throw new Error('Global entry missing init expression');
    }
    body.push(entry.initExpr);
  }
  return encodeSection(0x06, Buffer.concat(body));
}

function encodeExportSection(exportsList) {
  if (exportsList.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(exportsList.length)];
  for (const exp of exportsList) {
    const name = Buffer.from(exp.name, 'utf8');
    body.push(encodeULEB128(name.length), name);
    body.push(Buffer.from([exp.kind]));
    body.push(encodeULEB128(exp.index));
  }
  return encodeSection(0x07, Buffer.concat(body));
}

function encodeCodeSection(functionBodies) {
  if (functionBodies.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(functionBodies.length)];

  for (const fn of functionBodies) {
    const localDecl = [encodeULEB128(fn.locals.length)];
    for (const local of fn.locals) {
      localDecl.push(encodeULEB128(local.count));
      localDecl.push(Buffer.from([local.valType]));
    }
    const localDeclBytes = Buffer.concat(localDecl);
    const fnBody = Buffer.concat([localDeclBytes, fn.code]);
    body.push(encodeULEB128(fnBody.length));
    body.push(fnBody);
  }

  return encodeSection(0x0a, Buffer.concat(body));
}

function encodeDataSection(dataEntries) {
  if (!dataEntries || dataEntries.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(dataEntries.length)];

  for (const entry of dataEntries) {
    const flags = entry.flags >>> 0;
    body.push(encodeULEB128(flags));

    if (flags === 0) {
      if (!entry.offsetExpr) {
        throw new Error('Active data segment (flags=0) missing offset expression');
      }
      body.push(entry.offsetExpr);
    } else if (flags === 2) {
      if (entry.memoryIndex === undefined) {
        throw new Error('Active data segment (flags=2) missing memory index');
      }
      if (!entry.offsetExpr) {
        throw new Error('Active data segment (flags=2) missing offset expression');
      }
      body.push(encodeULEB128(entry.memoryIndex));
      body.push(entry.offsetExpr);
    } else if (flags === 1) {
      // passive segment
    } else {
      throw new Error(`Unsupported data segment flags for encoding: ${flags}`);
    }

    const bytes = entry.bytes || Buffer.alloc(0);
    body.push(encodeULEB128(bytes.length));
    body.push(bytes);
  }

  return encodeSection(0x0b, Buffer.concat(body));
}

function encodeDataCountSection(dataCount) {
  return encodeSection(0x0c, encodeULEB128(dataCount >>> 0));
}

function encodeElementSection(elementEntries) {
  if (!elementEntries || elementEntries.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(elementEntries.length)];

  for (const entry of elementEntries) {
    const flags = entry.flags >>> 0;
    body.push(encodeULEB128(flags));

    if ((flags & 0x02) && !(flags & 0x01)) {
      body.push(encodeULEB128(entry.tableIndex || 0));
    }

    if (!(flags & 0x01) || (flags & 0x02)) {
      if (!entry.initExpr) {
        throw new Error(`Element entry missing initExpr for flags=${flags}`);
      }
      body.push(entry.initExpr);
    }

    if (flags & 0x03) {
      body.push(Buffer.from([entry.reftype || 0x70]));
    }

    const elements = entry.elements || [];
    body.push(encodeULEB128(elements.length));
    if ((flags & 0x04) !== 0) {
      for (const expr of elements) {
        body.push(expr);
      }
    } else {
      for (const funcIdx of elements) {
        body.push(encodeULEB128(funcIdx));
      }
    }
  }

  return encodeSection(0x09, Buffer.concat(body));
}

function encodeWasmModule({
  types,
  importsList,
  functionTypeIndices,
  tableEntries,
  memoryEntries,
  globalEntries,
  exportsList,
  elementEntries,
  functionBodies,
  dataEntries,
  includeDataCount,
}) {
  const magicVersion = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const sections = [
    encodeTypeSection(types),
    encodeImportSection(importsList),
    encodeFunctionSection(functionTypeIndices),
    encodeTableSection(tableEntries),
    encodeMemorySection(memoryEntries),
    encodeGlobalSection(globalEntries),
    encodeExportSection(exportsList),
    encodeElementSection(elementEntries),
    includeDataCount ? encodeDataCountSection((dataEntries || []).length) : Buffer.alloc(0),
    encodeCodeSection(functionBodies),
    encodeDataSection(dataEntries),
  ].filter(buf => buf.length > 0);
  return Buffer.concat([magicVersion, ...sections]);
}

function rewriteConstExprBytes(expr, mapFuncIndex, mapGlobalIndex, contextLabel) {
  const out = [];
  let offset = 0;

  function readULEBAt(cursor) {
    return decodeULEB128(expr, cursor);
  }
  function readSLEBAt(cursor) {
    return decodeSLEB128(expr, cursor);
  }

  while (offset < expr.length) {
    const opcode = expr[offset++];
    out.push(Buffer.from([opcode]));

    if (opcode === 0x0b) {
      break;
    }
    if (opcode === 0x41 || opcode === 0x42) {
      const imm = readSLEBAt(offset);
      out.push(encodeSLEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }
    if (opcode === 0x43) {
      out.push(expr.subarray(offset, offset + 4));
      offset += 4;
      continue;
    }
    if (opcode === 0x44) {
      out.push(expr.subarray(offset, offset + 8));
      offset += 8;
      continue;
    }
    if (opcode === 0x23) {
      const idx = readULEBAt(offset);
      out.push(encodeULEB128(mapGlobalIndex(idx.value)));
      offset += idx.bytesRead;
      continue;
    }
    if (opcode === 0xd2) {
      const idx = readULEBAt(offset);
      out.push(encodeULEB128(mapFuncIndex(idx.value)));
      offset += idx.bytesRead;
      continue;
    }
    if (opcode === 0xd0) {
      const heapType = readSLEBAt(offset);
      out.push(encodeSLEB128(heapType.value));
      offset += heapType.bytesRead;
      continue;
    }

    throw new Error(`Unsupported opcode 0x${opcode.toString(16)} in const expr (${contextLabel})`);
  }

  return Buffer.concat(out);
}

function rewriteCodeBytes(code, {
  mapFuncIndex,
  mapTypeIndex,
  mapMemoryIndex,
  mapDataIndex,
  mapTableIndex,
  mapElemIndex,
  mapGlobalIndex,
  contextLabel,
}) {
  const out = [];
  let offset = 0;
  let usesDataIndexOps = false;

  function copyBytes(start, end) {
    out.push(code.subarray(start, end));
  }

  function readULEBAt(cursor) {
    return decodeULEB128(code, cursor);
  }

  function readSLEBAt(cursor) {
    return decodeSLEB128(code, cursor);
  }

  while (offset < code.length) {
    const opcode = code[offset++];
    out.push(Buffer.from([opcode]));

    if (opcode === 0x10 || opcode === 0x12 || opcode === 0xd2) {
      const decoded = readULEBAt(offset);
      const mapped = mapFuncIndex(decoded.value);
      out.push(encodeULEB128(mapped));
      offset += decoded.bytesRead;
      continue;
    }

    if (opcode === 0x11 || opcode === 0x13 || opcode === 0x14 || opcode === 0x15) {
      const typeIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
      offset += typeIdx.bytesRead;

      if (opcode === 0x11 || opcode === 0x13) {
        const tableIdx = readULEBAt(offset);
        out.push(encodeULEB128(tableIdx.value));
        offset += tableIdx.bytesRead;
      }
      continue;
    }

    if (opcode === 0x02 || opcode === 0x03 || opcode === 0x04 || opcode === 0x06) {
      const bt = readSLEBAt(offset);
      out.push(encodeSLEB128(bt.value));
      offset += bt.bytesRead;
      continue;
    }

    if (opcode === 0x08 || opcode === 0x09 || opcode === 0x0c || opcode === 0x0d || opcode === 0xd5 || opcode === 0xd6) {
      const imm = readULEBAt(offset);
      out.push(encodeULEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }

    if (opcode === 0x0e) {
      const targetCount = readULEBAt(offset);
      out.push(encodeULEB128(targetCount.value));
      offset += targetCount.bytesRead;
      for (let i = 0; i < targetCount.value; i++) {
        const target = readULEBAt(offset);
        out.push(encodeULEB128(target.value));
        offset += target.bytesRead;
      }
      const defaultTarget = readULEBAt(offset);
      out.push(encodeULEB128(defaultTarget.value));
      offset += defaultTarget.bytesRead;
      continue;
    }

    if (opcode === 0x25 || opcode === 0x26) {
      const tableIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapTableIndex(tableIdx.value)));
      offset += tableIdx.bytesRead;
      continue;
    }

    if (opcode === 0x23 || opcode === 0x24) {
      const globalIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapGlobalIndex(globalIdx.value)));
      offset += globalIdx.bytesRead;
      continue;
    }

    if (opcode >= 0x20 && opcode <= 0x22) {
      const imm = readULEBAt(offset);
      out.push(encodeULEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }

    if (opcode >= 0x28 && opcode <= 0x3e) {
      const align = readULEBAt(offset);
      out.push(encodeULEB128(align.value));
      offset += align.bytesRead;
      const memOffset = readULEBAt(offset);
      out.push(encodeULEB128(memOffset.value));
      offset += memOffset.bytesRead;
      continue;
    }

    if (opcode === 0x3f || opcode === 0x40) {
      const memIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapMemoryIndex(memIdx.value)));
      offset += memIdx.bytesRead;
      continue;
    }

    if (opcode === 0x41 || opcode === 0x42) {
      const imm = readSLEBAt(offset);
      out.push(encodeSLEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }

    if (opcode === 0x43) {
      copyBytes(offset, offset + 4);
      offset += 4;
      continue;
    }

    if (opcode === 0x44) {
      copyBytes(offset, offset + 8);
      offset += 8;
      continue;
    }

    if (opcode === 0x1c) {
      const count = readULEBAt(offset);
      out.push(encodeULEB128(count.value));
      offset += count.bytesRead;
      copyBytes(offset, offset + count.value);
      offset += count.value;
      continue;
    }

    if (opcode === 0xd0) {
      const heapType = readSLEBAt(offset);
      out.push(encodeSLEB128(heapType.value));
      offset += heapType.bytesRead;
      continue;
    }

    if (opcode === 0xfc) {
      const sub = readULEBAt(offset);
      out.push(encodeULEB128(sub.value));
      offset += sub.bytesRead;

      if (sub.value === 8) {
        // memory.init dataidx memidx
        const dataIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapDataIndex(dataIdx.value)));
        offset += dataIdx.bytesRead;

        const memIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapMemoryIndex(memIdx.value)));
        offset += memIdx.bytesRead;
        usesDataIndexOps = true;
        continue;
      }

      if (sub.value === 9) {
        // data.drop dataidx
        const dataIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapDataIndex(dataIdx.value)));
        offset += dataIdx.bytesRead;
        usesDataIndexOps = true;
        continue;
      }

      if (sub.value === 10) {
        // memory.copy memidx memidx
        const memIdxDst = readULEBAt(offset);
        out.push(encodeULEB128(mapMemoryIndex(memIdxDst.value)));
        offset += memIdxDst.bytesRead;

        const memIdxSrc = readULEBAt(offset);
        out.push(encodeULEB128(mapMemoryIndex(memIdxSrc.value)));
        offset += memIdxSrc.bytesRead;
        continue;
      }

      if (sub.value === 12) {
        // table.init elemidx tableidx
        const elemIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapElemIndex(elemIdx.value)));
        offset += elemIdx.bytesRead;

        const tableIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTableIndex(tableIdx.value)));
        offset += tableIdx.bytesRead;
        continue;
      }

      if (sub.value === 13) {
        // elem.drop elemidx
        const elemIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapElemIndex(elemIdx.value)));
        offset += elemIdx.bytesRead;
        continue;
      }

      if (sub.value === 14) {
        // table.copy tableidx tableidx
        const dstTableIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTableIndex(dstTableIdx.value)));
        offset += dstTableIdx.bytesRead;

        const srcTableIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTableIndex(srcTableIdx.value)));
        offset += srcTableIdx.bytesRead;
        continue;
      }

      if (sub.value === 15 || sub.value === 16 || sub.value === 17) {
        // table.grow / table.size / table.fill tableidx
        const tableIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTableIndex(tableIdx.value)));
        offset += tableIdx.bytesRead;
        continue;
      }

      if (sub.value === 11) {
        // memory.fill memidx
        const memIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapMemoryIndex(memIdx.value)));
        offset += memIdx.bytesRead;
        continue;
      }

      throw new Error(`Unsupported 0xfc subopcode ${sub.value} in static mode (${contextLabel})`);
    }

    if (opcode === 0xfb || opcode === 0xfd) {
      throw new Error(`Unsupported prefixed opcode 0x${opcode.toString(16)} in static mode (${contextLabel})`);
    }
  }

  return {
    code: Buffer.concat(out),
    usesDataIndexOps,
  };
}

class WasmLinker {
  constructor(options = {}) {
    this.options = {
      strict: Boolean(options.strict),
      validateRoundtrip: Boolean(options.validateRoundtrip),
    };
    this.assembler = new WatAssembler();
  }

  analyzeModules(filePaths) {
    const usedIds = new Set();
    const modules = [];

    for (const rawPath of filePaths) {
      const absPath = path.resolve(rawPath);
      const buffer = readFileChecked(absPath);
      const dis = new WasmDisassembler(buffer);
      const wat = dis.disassemble();

      if (this.options.validateRoundtrip) {
        try {
          this.assembler.assemble(wat);
        } catch (err) {
          throw new Error(`Roundtrip validation failed for ${absPath}: ${err.message}`);
        }
      }

      const id = normalizeModuleId(dis, absPath, usedIds);
      const imports = dis.importSection.map((imp, index) => ({
        index,
        module: imp.module,
        name: imp.name,
        kind: imp.kind,
        typeIdx: imp.typeIdx,
        tableType: imp.tableType,
        memoryType: imp.memoryType,
        globalType: imp.globalType,
      }));
      const exports = dis.exportSection.map((exp, index) => ({
        index,
        name: exp.name,
        kind: exp.kind,
        wasmIndex: exp.index,
      }));

      modules.push({
        id,
        path: absPath,
        wat,
        typeSection: dis.typeSection,
        importSection: dis.importSection,
        functionSection: dis.functionSection,
        tableSection: dis.tableSection,
        memorySection: dis.memorySection,
        globalSection: dis.globalSection,
        elementSection: dis.elementSection,
        dataSection: dis.dataSection,
        tagSection: dis.tagSection,
        startSection: dis.startSection,
        codeSection: dis.codeSection,
        imports,
        exports,
        importedFunctionCount: getImportedFunctionCount(dis.importSection),
        importedMemoryCount: getImportedMemoryCount(dis.importSection),
        importedTableCount: getImportedTableCount(dis.importSection),
        importedGlobalCount: getImportedGlobalCount(dis.importSection),
      });
    }

    return modules;
  }

  resolve(modules) {
    const exportIndex = new Map();

    for (const mod of modules) {
      for (const exp of mod.exports) {
        const exportType = describeExportType(mod, exp);
        const key = `${exp.name}::${exportType.kind}`;

        if (!exportIndex.has(key)) {
          exportIndex.set(key, []);
        }

        exportIndex.get(key).push({
          moduleId: mod.id,
          modulePath: mod.path,
          exportName: exp.name,
          wasmIndex: exp.wasmIndex,
          exportType,
        });
      }
    }

    const resolutions = [];
    const unresolved = [];
    const ambiguous = [];

    for (const consumer of modules) {
      for (const imp of consumer.imports) {
        const importType = describeImportType(consumer, imp);
        const key = `${imp.name}::${importType.kind}`;
        const candidates = (exportIndex.get(key) || [])
          .filter(c => c.moduleId !== consumer.id)
          .filter(c => compatibleTypes(importType, c.exportType));

        if (candidates.length === 1) {
          const winner = candidates[0];
          resolutions.push({
            consumerModuleId: consumer.id,
            consumerPath: consumer.path,
            importIndex: imp.index,
            importModule: imp.module,
            importName: imp.name,
            importType,
            providerModuleId: winner.moduleId,
            providerPath: winner.modulePath,
            providerExportName: winner.exportName,
            providerExportIndex: winner.wasmIndex,
          });
        } else if (candidates.length === 0) {
          unresolved.push({
            consumerModuleId: consumer.id,
            consumerPath: consumer.path,
            importIndex: imp.index,
            importModule: imp.module,
            importName: imp.name,
            importType,
          });
        } else {
          ambiguous.push({
            consumerModuleId: consumer.id,
            consumerPath: consumer.path,
            importIndex: imp.index,
            importModule: imp.module,
            importName: imp.name,
            importType,
            candidates,
          });
        }
      }
    }

    return { resolutions, unresolved, ambiguous };
  }

  computeLoadOrder(modules, resolutions) {
    const moduleIds = modules.map(m => m.id);
    const deps = new Map(moduleIds.map(id => [id, new Set()]));

    for (const r of resolutions) {
      deps.get(r.consumerModuleId).add(r.providerModuleId);
    }

    const indegree = new Map(moduleIds.map(id => [id, 0]));
    for (const [consumer, providers] of deps.entries()) {
      for (const provider of providers) {
        if (provider !== consumer) {
          indegree.set(consumer, indegree.get(consumer) + 1);
        }
      }
    }

    const ready = moduleIds.filter(id => indegree.get(id) === 0);
    const order = [];

    while (ready.length > 0) {
      const current = ready.shift();
      order.push(current);

      for (const [consumer, providers] of deps.entries()) {
        if (providers.has(current)) {
          const next = indegree.get(consumer) - 1;
          indegree.set(consumer, next);
          if (next === 0) {
            ready.push(consumer);
          }
        }
      }
    }

    if (order.length !== moduleIds.length) {
      throw new Error('Dependency cycle detected between modules (cannot compute load order)');
    }

    return order;
  }

  link(filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error('No input modules provided');
    }

    const modules = this.analyzeModules(filePaths);
    const { resolutions, unresolved, ambiguous } = this.resolve(modules);

    if (ambiguous.length > 0) {
      const details = ambiguous
        .map(item => {
          const cands = item.candidates.map(c => `${c.moduleId}.${c.exportName}`).join(', ');
          return `- ${item.consumerModuleId}: ${item.importModule}.${item.importName} -> [${cands}]`;
        })
        .join('\n');
      throw new Error(`Ambiguous symbol resolution:\n${details}`);
    }

    if (this.options.strict && unresolved.length > 0) {
      const details = unresolved
        .map(item => `- ${item.consumerModuleId}: ${item.importModule}.${item.importName}`)
        .join('\n');
      throw new Error(`Unresolved imports in strict mode:\n${details}`);
    }

    const loadOrder = this.computeLoadOrder(modules, resolutions);

    return {
      modules,
      resolutions,
      unresolved,
      loadOrder,
    };
  }

  linkStatic(filePaths, options = {}) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error('No input modules provided');
    }

    const modules = this.analyzeModules(filePaths);
    const { resolutions, unresolved, ambiguous } = this.resolve(modules);

    if (ambiguous.length > 0) {
      const details = ambiguous
        .map(item => {
          const cands = item.candidates.map(c => `${c.moduleId}.${c.exportName}`).join(', ');
          return `- ${item.consumerModuleId}: ${item.importModule}.${item.importName} -> [${cands}]`;
        })
        .join('\n');
      throw new Error(`Ambiguous symbol resolution:\n${details}`);
    }

    if (this.options.strict && unresolved.length > 0) {
      const details = unresolved
        .map(item => `- ${item.consumerModuleId}: ${item.importModule}.${item.importName}`)
        .join('\n');
      throw new Error(`Unresolved imports in strict mode:\n${details}`);
    }

    const linkResult = {
      modules,
      resolutions,
      unresolved,
      loadOrder: [],
    };
    const entryModuleId = options.entry || linkResult.modules[0].id;
    const entryModule = linkResult.modules.find(m => m.id === entryModuleId);

    if (!entryModule) {
      throw new Error(`Entry module not found: ${entryModuleId}`);
    }

    for (const mod of linkResult.modules) {
      if ((mod.tagSection || []).length > 0 || mod.startSection !== null) {
        throw new Error(`Static mode currently supports functions + local/imported table/memory/global + data/elem segments: ${mod.id} has unsupported sections`);
      }
      const nonSupportedImport = mod.imports.find(imp => imp.kind !== 0x00 && imp.kind !== 0x01 && imp.kind !== 0x02 && imp.kind !== 0x03);
      if (nonSupportedImport) {
        throw new Error(`Static mode supports only function/table/memory/global imports: ${mod.id} imports unsupported kind=${nonSupportedImport.kind} ${nonSupportedImport.module}.${nonSupportedImport.name}`);
      }
      if (mod.importedMemoryCount > 1) {
        throw new Error(`Static mode supports up to one imported memory per module: ${mod.id}`);
      }
      if (mod.importedTableCount > 1) {
        throw new Error(`Static mode supports up to one imported table per module: ${mod.id}`);
      }
      if (mod.importedGlobalCount > 1) {
        throw new Error(`Static mode supports up to one imported global per module: ${mod.id}`);
      }
      const nonFuncExport = mod.exports.find(exp => exp.kind !== 0x00 && exp.kind !== 0x01 && exp.kind !== 0x02 && exp.kind !== 0x03);
      if (nonFuncExport) {
        throw new Error(`Static mode supports only function/table/memory/global exports: ${mod.id} exports unsupported ${nonFuncExport.name}`);
      }
      if (mod.codeSection.length !== mod.functionSection.length) {
        throw new Error(`Invalid module shape in ${mod.id}: code/function section count mismatch`);
      }

      for (const dataEntry of mod.dataSection || []) {
        if (dataEntry.flags !== 0 && dataEntry.flags !== 1 && dataEntry.flags !== 2) {
          throw new Error(`Static mode supports data segment flags 0/1/2 only: ${mod.id} has flags=${dataEntry.flags}`);
        }
      }
    }

    const moduleById = new Map(linkResult.modules.map(m => [m.id, m]));
    const resolutionByConsumerImport = new Map();
    for (const r of linkResult.resolutions) {
      resolutionByConsumerImport.set(`${r.consumerModuleId}:${r.importIndex}`, r);
    }

    const typePool = [];
    const typeMap = new Map();
    const moduleTypeRemap = new Map();

    function internType(sig) {
      const key = signatureToKey(sig);
      if (!typeMap.has(key)) {
        typeMap.set(key, typePool.length);
        typePool.push(cloneTypeSignature(sig));
      }
      return typeMap.get(key);
    }

    for (const mod of linkResult.modules) {
      const remap = new Map();
      mod.typeSection.forEach((typeSig, oldIdx) => {
        remap.set(oldIdx, internType(typeSig));
      });
      moduleTypeRemap.set(mod.id, remap);
    }

    const localFunctionMap = new Map();
    const localFunctionBodies = [];
    const outputFunctionTypeIndices = [];
    const pendingImportMap = new Map();
    const moduleMemoryImports = new Map();
    const moduleTableImports = new Map();
    const moduleGlobalImports = new Map();

    let localCounter = 0;
    for (const mod of linkResult.modules) {
      const remapType = moduleTypeRemap.get(mod.id);
      const memoryImports = mod.imports.filter(imp => imp.kind === 0x02);
      const tableImports = mod.imports.filter(imp => imp.kind === 0x01);
      const globalImports = mod.imports.filter(imp => imp.kind === 0x03);
      const functionImports = mod.imports.filter(imp => imp.kind === 0x00);
      moduleMemoryImports.set(mod.id, memoryImports);
      moduleTableImports.set(mod.id, tableImports);
      moduleGlobalImports.set(mod.id, globalImports);
      for (let i = 0; i < mod.functionSection.length; i++) {
        const oldFuncIdx = mod.importedFunctionCount + i;
        const outputFuncIdx = localCounter;
        localCounter += 1;
        localFunctionMap.set(`${mod.id}:${oldFuncIdx}`, outputFuncIdx);
        outputFunctionTypeIndices.push(remapType.get(mod.functionSection[i]));
        localFunctionBodies.push({
          moduleId: mod.id,
          oldFuncIdx,
          locals: mod.codeSection[i].locals,
          code: mod.codeSection[i].code,
        });
      }

      for (let functionImportIdx = 0; functionImportIdx < functionImports.length; functionImportIdx++) {
        const imp = functionImports[functionImportIdx];
        if (!imp) continue;
        const resolved = resolutionByConsumerImport.get(`${mod.id}:${imp.index}`);
        if (!resolved) {
          const typeIdx = moduleTypeRemap.get(mod.id).get(imp.typeIdx);
          const key = `${imp.module}:${imp.name}:${typeIdx}`;
          if (!pendingImportMap.has(key)) {
            pendingImportMap.set(key, {
              module: imp.module,
              name: imp.name,
              typeIdx,
              key,
            });
          }
        }
      }
    }

    const outputFunctionImports = Array.from(pendingImportMap.values());
    const importIndexMap = new Map();
    outputFunctionImports.forEach((imp, index) => {
      importIndexMap.set(imp.key, index);
    });

    const localIndexToWasmIndex = idx => outputFunctionImports.length + idx;

    const localMemoryMap = new Map();
    const outputMemoryEntries = [];
    for (const mod of linkResult.modules) {
      for (let i = 0; i < (mod.memorySection || []).length; i++) {
        const oldIdx = mod.importedMemoryCount + i;
        localMemoryMap.set(`${mod.id}:${oldIdx}`, outputMemoryEntries.length);
        outputMemoryEntries.push(mod.memorySection[i]);
      }
    }

    const localTableMap = new Map();
    const outputTableEntries = [];
    for (const mod of linkResult.modules) {
      for (let i = 0; i < (mod.tableSection || []).length; i++) {
        const oldIdx = mod.importedTableCount + i;
        localTableMap.set(`${mod.id}:${oldIdx}`, outputTableEntries.length);
        outputTableEntries.push(mod.tableSection[i]);
      }
    }

    const memoryResolveMemo = new Map();
    const memoryResolveStack = new Set();

    const resolveMemoryDescriptor = (moduleId, oldMemoryIdx) => {
      const cacheKey = `${moduleId}:${oldMemoryIdx}`;
      if (memoryResolveMemo.has(cacheKey)) return memoryResolveMemo.get(cacheKey);

      const mod = moduleById.get(moduleId);
      if (!mod) {
        throw new Error(`Unknown module id while resolving memory index: ${moduleId}`);
      }

      if (oldMemoryIdx < mod.importedMemoryCount) {
        const memoryImports = moduleMemoryImports.get(moduleId) || [];
        const imp = memoryImports[oldMemoryIdx];
        if (!imp) {
          throw new Error(`Missing memory import for ${moduleId}:${oldMemoryIdx}`);
        }

        if (memoryResolveStack.has(cacheKey)) {
          return {
            kind: 'external',
            module: imp.module,
            name: imp.name,
            memoryType: imp.memoryType,
          };
        }

        memoryResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveMemoryDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : {
            kind: 'external',
            module: imp.module,
            name: imp.name,
            memoryType: imp.memoryType,
          };
        memoryResolveStack.delete(cacheKey);
        memoryResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldMemoryIdx}`;
      if (!localMemoryMap.has(key)) {
        throw new Error(`Missing local memory mapping for ${key}`);
      }
      const result = { kind: 'local', key };
      memoryResolveMemo.set(cacheKey, result);
      return result;
    };

    let outputMemoryImport = null;
    for (const mod of linkResult.modules) {
      const memoryImports = moduleMemoryImports.get(mod.id) || [];
      for (let memoryIdx = 0; memoryIdx < memoryImports.length; memoryIdx++) {
        const root = resolveMemoryDescriptor(mod.id, memoryIdx);
        if (root.kind === 'local') {
          continue;
        }
        if (!outputMemoryImport) {
          outputMemoryImport = {
            kind: 0x02,
            module: root.module,
            name: root.name,
            memoryType: root.memoryType,
          };
        } else {
          const sameModule = outputMemoryImport.module === root.module;
          const sameName = outputMemoryImport.name === root.name;
          const a = outputMemoryImport.memoryType || {};
          const b = root.memoryType || {};
          const sameMin = a.min === b.min;
          const sameMax = a.max === b.max;
          if (!sameModule || !sameName || !sameMin || !sameMax) {
            throw new Error('Static mode currently supports a single external imported memory signature across all modules');
          }
        }
      }
    }

    const mapMemoryIndexForModule = (moduleId, oldMemoryIdx) => {
      const resolved = resolveMemoryDescriptor(moduleId, oldMemoryIdx);
      if (resolved.kind === 'external') {
        if (!outputMemoryImport) {
          throw new Error(`No output memory import available for ${moduleId}:${oldMemoryIdx}`);
        }
        return 0;
      }
      const localIdx = localMemoryMap.get(resolved.key);
      return (outputMemoryImport ? 1 : 0) + localIdx;
    };

    const tableResolveMemo = new Map();
    const tableResolveStack = new Set();

    const resolveTableDescriptor = (moduleId, oldTableIdx) => {
      const cacheKey = `${moduleId}:${oldTableIdx}`;
      if (tableResolveMemo.has(cacheKey)) return tableResolveMemo.get(cacheKey);

      const mod = moduleById.get(moduleId);
      if (!mod) {
        throw new Error(`Unknown module id while resolving table index: ${moduleId}`);
      }

      if (oldTableIdx < mod.importedTableCount) {
        const tableImports = moduleTableImports.get(moduleId) || [];
        const imp = tableImports[oldTableIdx];
        if (!imp) {
          throw new Error(`Missing table import for ${moduleId}:${oldTableIdx}`);
        }

        if (tableResolveStack.has(cacheKey)) {
          return {
            kind: 'external',
            module: imp.module,
            name: imp.name,
            tableType: imp.tableType,
          };
        }

        tableResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveTableDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : {
            kind: 'external',
            module: imp.module,
            name: imp.name,
            tableType: imp.tableType,
          };
        tableResolveStack.delete(cacheKey);
        tableResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldTableIdx}`;
      if (!localTableMap.has(key)) {
        throw new Error(`Missing local table mapping for ${key}`);
      }
      const result = { kind: 'local', key };
      tableResolveMemo.set(cacheKey, result);
      return result;
    };

    let outputTableImport = null;
    for (const mod of linkResult.modules) {
      const tableImports = moduleTableImports.get(mod.id) || [];
      for (let tableIdx = 0; tableIdx < tableImports.length; tableIdx++) {
        const root = resolveTableDescriptor(mod.id, tableIdx);
        if (root.kind === 'local') {
          continue;
        }
        if (!outputTableImport) {
          outputTableImport = {
            kind: 0x01,
            module: root.module,
            name: root.name,
            tableType: root.tableType,
          };
        } else {
          const sameModule = outputTableImport.module === root.module;
          const sameName = outputTableImport.name === root.name;
          const a = outputTableImport.tableType || {};
          const b = root.tableType || {};
          const sameElem = a.elemType === b.elemType;
          const al = a.limits || {};
          const bl = b.limits || {};
          const sameMin = al.min === bl.min;
          const sameMax = al.max === bl.max;
          if (!sameModule || !sameName || !sameElem || !sameMin || !sameMax) {
            throw new Error('Static mode currently supports a single external imported table signature across all modules');
          }
        }
      }
    }

    const mapTableIndexForModule = (moduleId, oldTableIdx) => {
      const resolved = resolveTableDescriptor(moduleId, oldTableIdx);
      if (resolved.kind === 'external') {
        if (!outputTableImport) {
          throw new Error(`No output table import available for ${moduleId}:${oldTableIdx}`);
        }
        return 0;
      }
      const localIdx = localTableMap.get(resolved.key);
      return (outputTableImport ? 1 : 0) + localIdx;
    };

    const globalResolveMemo = new Map();
    const globalResolveStack = new Set();

    const resolveGlobalDescriptor = (moduleId, oldGlobalIdx) => {
      const cacheKey = `${moduleId}:${oldGlobalIdx}`;
      if (globalResolveMemo.has(cacheKey)) return globalResolveMemo.get(cacheKey);

      const mod = moduleById.get(moduleId);
      if (!mod) {
        throw new Error(`Unknown module id while resolving global index: ${moduleId}`);
      }

      if (oldGlobalIdx < mod.importedGlobalCount) {
        const globalImports = moduleGlobalImports.get(moduleId) || [];
        const imp = globalImports[oldGlobalIdx];
        if (!imp) {
          throw new Error(`Missing global import for ${moduleId}:${oldGlobalIdx}`);
        }

        if (globalResolveStack.has(cacheKey)) {
          return {
            kind: 'external',
            module: imp.module,
            name: imp.name,
            globalType: imp.globalType,
          };
        }

        globalResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveGlobalDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : {
            kind: 'external',
            module: imp.module,
            name: imp.name,
            globalType: imp.globalType,
          };
        globalResolveStack.delete(cacheKey);
        globalResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldGlobalIdx}`;
      if (!localGlobalMap.has(key)) {
        throw new Error(`Missing local global mapping for ${key}`);
      }
      const result = { kind: 'local', key };
      globalResolveMemo.set(cacheKey, result);
      return result;
    };

    let outputGlobalImport = null;
    for (const mod of linkResult.modules) {
      const globalImports = moduleGlobalImports.get(mod.id) || [];
      for (let globalIdx = 0; globalIdx < globalImports.length; globalIdx++) {
        const root = resolveGlobalDescriptor(mod.id, globalIdx);
        if (root.kind === 'local') {
          continue;
        }
        if (!outputGlobalImport) {
          outputGlobalImport = {
            kind: 0x03,
            module: root.module,
            name: root.name,
            globalType: root.globalType,
          };
        } else {
          const sameModule = outputGlobalImport.module === root.module;
          const sameName = outputGlobalImport.name === root.name;
          const a = outputGlobalImport.globalType || {};
          const b = root.globalType || {};
          const sameValType = a.valType === b.valType;
          const sameMut = Boolean(a.mutable) === Boolean(b.mutable);
          if (!sameModule || !sameName || !sameValType || !sameMut) {
            throw new Error('Static mode currently supports a single external imported global signature across all modules');
          }
        }
      }
    }

    const localGlobalMap = new Map();
    let localGlobalCounter = 0;
    for (const mod of linkResult.modules) {
      const importedGlobalCount = mod.importedGlobalCount;
      for (let i = 0; i < (mod.globalSection || []).length; i++) {
        const oldGlobalIdx = importedGlobalCount + i;
        localGlobalMap.set(`${mod.id}:${oldGlobalIdx}`, localGlobalCounter++);
      }
    }

    const mapGlobalIndexForModule = (moduleId, oldGlobalIdx) => {
      const resolved = resolveGlobalDescriptor(moduleId, oldGlobalIdx);
      if (resolved.kind === 'external') {
        if (!outputGlobalImport) {
          throw new Error(`No output global import available for ${moduleId}:${oldGlobalIdx}`);
        }
        return 0;
      }
      const localIdx = localGlobalMap.get(resolved.key);
      return (outputGlobalImport ? 1 : 0) + localIdx;
    };

    const moduleDataIndexRemap = new Map();
    let globalDataIndex = 0;
    for (const mod of linkResult.modules) {
      const remap = new Map();
      for (let oldDataIdx = 0; oldDataIdx < (mod.dataSection || []).length; oldDataIdx++) {
        remap.set(oldDataIdx, globalDataIndex++);
      }
      moduleDataIndexRemap.set(mod.id, remap);
    }

    const moduleElemIndexRemap = new Map();
    let globalElemIndex = 0;
    for (const mod of linkResult.modules) {
      const remap = new Map();
      for (let oldElemIdx = 0; oldElemIdx < (mod.elementSection || []).length; oldElemIdx++) {
        remap.set(oldElemIdx, globalElemIndex++);
      }
      moduleElemIndexRemap.set(mod.id, remap);
    }

    const mapDataIndexForModule = (moduleId, oldDataIdx) => {
      const remap = moduleDataIndexRemap.get(moduleId);
      if (!remap || !remap.has(oldDataIdx)) {
        throw new Error(`Missing data index remap for ${moduleId}:${oldDataIdx}`);
      }
      return remap.get(oldDataIdx);
    };

    const mapElemIndexForModule = (moduleId, oldElemIdx) => {
      const remap = moduleElemIndexRemap.get(moduleId);
      if (!remap || !remap.has(oldElemIdx)) {
        throw new Error(`Missing elem index remap for ${moduleId}:${oldElemIdx}`);
      }
      return remap.get(oldElemIdx);
    };

    const outputDataEntries = [];
    for (const mod of linkResult.modules) {
      for (const dataEntry of mod.dataSection || []) {
        if (!outputMemoryImport) {
          throw new Error(`Data segments require an imported memory in static mode: ${mod.id}`);
        }
        if (dataEntry.flags === 0) {
          outputDataEntries.push({
            flags: 0,
            memoryIndex: 0,
            offsetExpr: dataEntry.offsetExpr,
            bytes: dataEntry.bytes,
          });
        } else if (dataEntry.flags === 1) {
          outputDataEntries.push({
            flags: 1,
            bytes: dataEntry.bytes,
          });
        } else if (dataEntry.flags === 2) {
          outputDataEntries.push({
            flags: 2,
            memoryIndex: mapMemoryIndexForModule(mod.id, dataEntry.memoryIndex || 0),
            offsetExpr: dataEntry.offsetExpr,
            bytes: dataEntry.bytes,
          });
        }
      }
    }

    let outputElementEntries = [];

    const resolvingMemo = new Map();
    const resolvingStack = new Set();

    const resolveFuncIndex = (moduleId, oldFuncIdx) => {
      const cacheKey = `${moduleId}:${oldFuncIdx}`;
      if (resolvingMemo.has(cacheKey)) return resolvingMemo.get(cacheKey);
      if (resolvingStack.has(cacheKey)) {
        throw new Error(`Function index resolution cycle detected at ${cacheKey}`);
      }

      resolvingStack.add(cacheKey);

      const mod = moduleById.get(moduleId);
      if (!mod) {
        throw new Error(`Unknown module id while resolving function index: ${moduleId}`);
      }

      let result;
      if (oldFuncIdx >= mod.importedFunctionCount) {
        const localIdx = localFunctionMap.get(cacheKey);
        if (localIdx === undefined) {
          throw new Error(`Missing local function mapping for ${cacheKey}`);
        }
        result = localIndexToWasmIndex(localIdx);
      } else {
        const functionImports = mod.imports.filter(x => x.kind === 0x00);
        const imp = functionImports[oldFuncIdx];
        if (!imp) {
          throw new Error(`Missing import entry for ${cacheKey}`);
        }
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        if (resolved) {
          result = resolveFuncIndex(resolved.providerModuleId, resolved.providerExportIndex);
        } else {
          const typeIdx = moduleTypeRemap.get(moduleId).get(imp.typeIdx);
          const key = `${imp.module}:${imp.name}:${typeIdx}`;
          const importIdx = importIndexMap.get(key);
          if (importIdx === undefined) {
            throw new Error(`Missing output import mapping for ${key}`);
          }
          result = importIdx;
        }
      }

      resolvingStack.delete(cacheKey);
      resolvingMemo.set(cacheKey, result);
      return result;
    };

    const outputGlobalEntries = [];
    for (const mod of linkResult.modules) {
      for (let i = 0; i < (mod.globalSection || []).length; i++) {
        const globalEntry = mod.globalSection[i];
        const rewrittenInitExpr = rewriteConstExprBytes(
          globalEntry.initExpr,
          oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
          oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
          `${mod.id}:global-init:${i}`
        );
        outputGlobalEntries.push({
          globalType: globalEntry.globalType,
          initExpr: rewrittenInitExpr,
        });
      }
    }

    outputElementEntries = [];
    for (const mod of linkResult.modules) {
      for (const elemEntry of mod.elementSection || []) {
        const mappedEntry = {
          flags: elemEntry.flags,
          tableIndex: elemEntry.tableIndex,
          reftype: elemEntry.reftype,
          initExpr: elemEntry.initExpr,
          elements: [],
        };

        if ((mappedEntry.flags & 0x02) && !(mappedEntry.flags & 0x01)) {
          mappedEntry.tableIndex = mapTableIndexForModule(mod.id, mappedEntry.tableIndex || 0);
        }

        if (mappedEntry.initExpr) {
          mappedEntry.initExpr = rewriteConstExprBytes(
            mappedEntry.initExpr,
            oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
            oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
            `${mod.id}:elem-init`
          );
        }

        if ((mappedEntry.flags & 0x04) !== 0) {
          mappedEntry.elements = (elemEntry.elements || []).map((expr, index) => {
            return rewriteConstExprBytes(
              expr,
              oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
              oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
              `${mod.id}:elem-expr:${index}`
            );
          });
        } else {
          mappedEntry.elements = (elemEntry.elements || []).map(oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx));
        }

        outputElementEntries.push(mappedEntry);
      }
    }

    let usesDataIndexOps = false;
    const rewrittenBodies = localFunctionBodies.map(fn => {
      const remapType = moduleTypeRemap.get(fn.moduleId);
      const rewritten = rewriteCodeBytes(fn.code, {
        mapFuncIndex: oldIdx => resolveFuncIndex(fn.moduleId, oldIdx),
        mapTypeIndex: oldTypeIdx => {
          const mapped = remapType.get(oldTypeIdx);
          if (mapped === undefined) {
            throw new Error(`Missing type remap for ${fn.moduleId}:${oldTypeIdx}`);
          }
          return mapped;
        },
        mapDataIndex: oldDataIdx => mapDataIndexForModule(fn.moduleId, oldDataIdx),
        mapMemoryIndex: oldMemoryIdx => mapMemoryIndexForModule(fn.moduleId, oldMemoryIdx),
        mapTableIndex: oldTableIdx => mapTableIndexForModule(fn.moduleId, oldTableIdx),
        mapElemIndex: oldElemIdx => mapElemIndexForModule(fn.moduleId, oldElemIdx),
        mapGlobalIndex: oldGlobalIdx => mapGlobalIndexForModule(fn.moduleId, oldGlobalIdx),
        contextLabel: `${fn.moduleId}:${fn.oldFuncIdx}`,
      });
      if (rewritten.usesDataIndexOps) {
        usesDataIndexOps = true;
      }
      return {
        locals: fn.locals,
        code: rewritten.code,
      };
    });

    const exportsList = [];
    for (const exp of entryModule.exports) {
      if (exp.kind === 0x00) {
        const mapped = resolveFuncIndex(entryModule.id, exp.wasmIndex);
        exportsList.push({ name: exp.name, kind: 0x00, index: mapped });
      } else if (exp.kind === 0x01) {
        const mapped = mapTableIndexForModule(entryModule.id, exp.wasmIndex);
        exportsList.push({ name: exp.name, kind: 0x01, index: mapped });
      } else if (exp.kind === 0x02) {
        const mapped = mapMemoryIndexForModule(entryModule.id, exp.wasmIndex);
        exportsList.push({ name: exp.name, kind: 0x02, index: mapped });
      } else if (exp.kind === 0x03) {
        const mapped = mapGlobalIndexForModule(entryModule.id, exp.wasmIndex);
        exportsList.push({ name: exp.name, kind: 0x03, index: mapped });
      }
    }

    const importsList = [...outputFunctionImports.map(imp => ({ ...imp, kind: 0x00 }))];
    if (outputTableImport) {
      importsList.push(outputTableImport);
    }
    if (outputMemoryImport) {
      importsList.push(outputMemoryImport);
    }
    if (outputGlobalImport) {
      importsList.push(outputGlobalImport);
    }

    const wasm = encodeWasmModule({
      types: typePool,
      importsList,
      functionTypeIndices: outputFunctionTypeIndices,
      tableEntries: outputTableEntries,
      memoryEntries: outputMemoryEntries,
      globalEntries: outputGlobalEntries,
      exportsList,
      elementEntries: outputElementEntries,
      functionBodies: rewrittenBodies,
      dataEntries: outputDataEntries,
      includeDataCount: usesDataIndexOps,
    });

    return {
      wasm,
      entryModuleId,
      linkedImports: outputFunctionImports.length,
      linkedTableImports: outputTableImport ? 1 : 0,
      linkedMemoryImports: outputMemoryImport ? 1 : 0,
      linkedGlobalImports: outputGlobalImport ? 1 : 0,
      linkedFunctions: rewrittenBodies.length,
      linkedLocalTables: outputTableEntries.length,
      linkedLocalMemories: outputMemoryEntries.length,
      linkedLocalGlobals: outputGlobalEntries.length,
      linkedElementSegments: outputElementEntries.length,
      linkedDataSegments: outputDataEntries.length,
      linkedExports: exportsList.length,
      moduleCount: linkResult.modules.length,
    };
  }
}

function buildLoaderSource(linkResult, entryModuleId) {
  const moduleById = new Map(linkResult.modules.map(m => [m.id, m]));
  if (!moduleById.has(entryModuleId)) {
    throw new Error(`Entry module not found: ${entryModuleId}`);
  }

  const resolutionByConsumerImport = new Map();
  for (const r of linkResult.resolutions) {
    resolutionByConsumerImport.set(`${r.consumerModuleId}:${r.importIndex}`, r);
  }

  const modulesLiteral = linkResult.modules
    .map(m => `  ${JSON.stringify(m.id)}: ${JSON.stringify(m.path)}`)
    .join(',\n');

  const orderLiteral = linkResult.loadOrder.map(id => JSON.stringify(id)).join(', ');

  const unresolvedByModule = new Map();
  for (const u of linkResult.unresolved) {
    if (!unresolvedByModule.has(u.consumerModuleId)) {
      unresolvedByModule.set(u.consumerModuleId, []);
    }
    unresolvedByModule.get(u.consumerModuleId).push(u);
  }

  const unresolvedCheckLines = [];
  for (const [moduleId, unresolved] of unresolvedByModule.entries()) {
    for (const imp of unresolved) {
      unresolvedCheckLines.push(
        `      if (!importsByModule[${JSON.stringify(moduleId)}] || !importsByModule[${JSON.stringify(moduleId)}][${JSON.stringify(imp.importModule)}] || !(Object.prototype.hasOwnProperty.call(importsByModule[${JSON.stringify(moduleId)}][${JSON.stringify(imp.importModule)}], ${JSON.stringify(imp.importName)}))) {`,
        `        throw new Error('Missing external import for ${moduleId}: ${imp.importModule}.${imp.importName}');`,
        '      }'
      );
    }
  }

  const perModuleImportWiring = [];
  for (const mod of linkResult.modules) {
    perModuleImportWiring.push(`    // Imports for ${mod.id}`);
    perModuleImportWiring.push('    const moduleImports = {};');

    for (const imp of mod.imports) {
      const resolution = resolutionByConsumerImport.get(`${mod.id}:${imp.index}`);
      if (resolution) {
        perModuleImportWiring.push(
          `    moduleImports[${JSON.stringify(imp.importModule)}] = moduleImports[${JSON.stringify(imp.importModule)}] || {};`,
          `    moduleImports[${JSON.stringify(imp.importModule)}][${JSON.stringify(imp.importName)}] = instances[${JSON.stringify(resolution.providerModuleId)}].exports[${JSON.stringify(resolution.providerExportName)}];`
        );
      } else {
        perModuleImportWiring.push(
          `    moduleImports[${JSON.stringify(imp.importModule)}] = moduleImports[${JSON.stringify(imp.importModule)}] || {};`,
          `    moduleImports[${JSON.stringify(imp.importModule)}][${JSON.stringify(imp.importName)}] = importsByModule[${JSON.stringify(mod.id)}]?.[${JSON.stringify(imp.importModule)}]?.[${JSON.stringify(imp.importName)}];`
        );
      }
    }

    perModuleImportWiring.push(
      `    const bytes = fs.readFileSync(modules[${JSON.stringify(mod.id)}]);`,
      '    const instantiated = await WebAssembly.instantiate(bytes, moduleImports);',
      `    instances[${JSON.stringify(mod.id)}] = instantiated.instance || instantiated;`,
      ''
    );
  }

  return `'use strict';

const fs = require('fs');

async function loadLinkedModules(importsByModule = {}) {
  const modules = {
${modulesLiteral}
  };

  const loadOrder = [${orderLiteral}];
  const instances = {};

${unresolvedCheckLines.join('\n')}

  for (const moduleId of loadOrder) {
${perModuleImportWiring.join('\n')}
  }

  return {
    entry: ${JSON.stringify(entryModuleId)},
    instance: instances[${JSON.stringify(entryModuleId)}],
    instances,
  };
}

module.exports = { loadLinkedModules };

if (require.main === module) {
  loadLinkedModules()
    .then(result => {
      const exportsList = Object.keys(result.instance.exports || {});
      console.log('Linked modules loaded.');
      console.log('Entry module:', result.entry);
      console.log('Entry exports:', exportsList.join(', ') || '(none)');
    })
    .catch(err => {
      console.error('Failed to load linked modules:', err.message);
      process.exit(1);
    });
}
`;
}

function printReport(linkResult) {
  console.log('=== WASM LINK REPORT (MVP dynamic linker) ===');
  console.log(`Modules: ${linkResult.modules.length}`);
  for (const mod of linkResult.modules) {
    console.log(`  - ${mod.id}: ${mod.path}`);
  }

  console.log(`Resolved imports: ${linkResult.resolutions.length}`);
  for (const r of linkResult.resolutions) {
    console.log(
      `  - ${r.consumerModuleId}:${r.importModule}.${r.importName} -> ${r.providerModuleId}.${r.providerExportName}`
    );
  }

  console.log(`Unresolved imports: ${linkResult.unresolved.length}`);
  for (const u of linkResult.unresolved) {
    console.log(`  - ${u.consumerModuleId}: ${u.importModule}.${u.importName}`);
  }

  console.log(`Load order: ${linkResult.loadOrder.join(' -> ')}`);
}

function main() {
  try {
    const { wasmFiles, options } = parseArgs(process.argv.slice(2));

    if (options.help || wasmFiles.length === 0) {
      usage();
      process.exit(options.help ? 0 : 1);
    }

    const linker = new WasmLinker(options);
    if (options.static) {
      const staticResult = linker.linkStatic(wasmFiles, { entry: options.entry });
      const wasmOutputPath = path.resolve(options.wasmOutput || 'linked.wasm');
      fs.mkdirSync(path.dirname(wasmOutputPath), { recursive: true });
      fs.writeFileSync(wasmOutputPath, staticResult.wasm);
      console.log('=== WASM STATIC LINK REPORT (partial) ===');
      console.log(`Entry module: ${staticResult.entryModuleId}`);
      console.log(`Modules linked: ${staticResult.moduleCount}`);
      console.log(`Function imports kept: ${staticResult.linkedImports}`);
      console.log(`Table imports kept: ${staticResult.linkedTableImports}`);
      console.log(`Memory imports kept: ${staticResult.linkedMemoryImports}`);
      console.log(`Global imports kept: ${staticResult.linkedGlobalImports}`);
      console.log(`Functions linked: ${staticResult.linkedFunctions}`);
      console.log(`Local tables linked: ${staticResult.linkedLocalTables}`);
      console.log(`Local memories linked: ${staticResult.linkedLocalMemories}`);
      console.log(`Local globals linked: ${staticResult.linkedLocalGlobals}`);
      console.log(`Element segments linked: ${staticResult.linkedElementSegments}`);
      console.log(`Data segments linked: ${staticResult.linkedDataSegments}`);
      console.log(`Exports emitted: ${staticResult.linkedExports}`);
      console.log(`Linked WASM written to: ${wasmOutputPath}`);
    } else {
      const linkResult = linker.link(wasmFiles);
      printReport(linkResult);

      const entryModuleId = options.entry || linkResult.modules[0].id;

      if (options.output) {
        const loaderSource = buildLoaderSource(linkResult, entryModuleId);
        const outputPath = path.resolve(options.output);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, loaderSource, 'utf8');
        console.log(`Loader written to: ${outputPath}`);
      }
    }
  } catch (err) {
    console.error(`wasm-linker failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { WasmLinker, buildLoaderSource };
