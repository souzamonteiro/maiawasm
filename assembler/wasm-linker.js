#!/usr/bin/env node
/**
 * MaiaWASM Static & Dynamic Linker
 *
 * Supports:
 * - Dynamic linking (dependency analysis, symbol resolution, topological load order, JS loader generation, and in-memory instantiation via WasmVM/WebAssembly).
 * - Full static binary linking (--static / linkStatic) into a single valid .wasm module across all 483 opcodes:
 *   - MVP, multi-value, sign-extension, saturating float-to-int (0xFC 0..7)
 *   - Bulk memory & multi-memory (0xFC 8..11, memarg bit 0x40)
 *   - Reference types, typed function references & multi-table ops (0xFC 12..17, call_ref, return_call*)
 *   - Fixed-width 128-bit SIMD (all 236 0xFD opcodes, including multi-memory lane loads/stores)
 *   - Wasm GC & recursive/subtyped type graphs (all 31 0xFB opcodes, rec groups, sub/sub final, struct, array, i31, packed i8/i16)
 *   - Modern (try_table/throw/throw_ref) & legacy (try/catch/catch_all/rethrow) exception handling + Tag section (0x0D)
 *   - Start section (0x08), including automatic start trampoline synthesis when multiple modules define start functions
 *   - Multiple external imports of functions, tables, memories, globals, and tags
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { WasmDisassembler } = require('./wasm-disassembler.js');
const { decodeModule } = require('./wasm-module.js');
const {
  decodeULEB128: decodeULEB128Checked,
  decodeSLEB128: decodeSLEB128Checked,
  decodeValueType,
  ValTypeName,
  HeapTypeName,
  PackedTypeName,
} = require('./wasm-binary.js');
const { TypeEnvironment } = require('./vm/types.js');
const WatAssembler = require('./wat-assembler.js');

function usage() {
  console.log(`Usage: node assembler/wasm-linker.js <module1.wasm> [module2.wasm ...] [options]

Options:
  -o, --output <file.js>      Output loader JS file (optional)
  -w, --wasm-output <file>    Output linked WASM file (static mode)
  -e, --entry <moduleId>      Entry module id (default: first module)
  --export-all                Export non-colliding symbols from all modules in static mode
  --strict                    Fail on unresolved imports
  --static                    Emit a single linked WASM module
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
    exportAll: false,
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

    if (arg === '--export-all') {
      options.exportAll = true;
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

function sanitizeIdentifier(value) {
  return String(value).replace(/[^a-zA-Z0-9_$]/g, '_');
}

function normalizeModuleId(nameSection, filePathOrHint, usedIds) {
  const byNameSection = (nameSection && nameSection.moduleName) || '';
  const base = filePathOrHint ? path.basename(String(filePathOrHint), path.extname(String(filePathOrHint))) : '';
  const preferred = sanitizeIdentifier(byNameSection || base || 'module');
  let candidate = preferred;
  let suffix = 1;

  while (usedIds.has(candidate)) {
    candidate = `${preferred}_${suffix++}`;
  }

  usedIds.add(candidate);
  return candidate;
}

const VAL_TYPE_CODE = {
  i32: 0x7f,
  i64: 0x7e,
  f32: 0x7d,
  f64: 0x7c,
  v128: 0x7b,
  i8: 0x78,
  i16: 0x77,
  nullfuncref: 0x73,
  nullexternref: 0x72,
  nullref: 0x71,
  nullexnref: 0x74,
  funcref: 0x70,
  externref: 0x6f,
  anyref: 0x6e,
  eqref: 0x6d,
  i31ref: 0x6c,
  structref: 0x6b,
  arrayref: 0x6a,
  exnref: 0x69,
};

function encodeULEB128(value) {
  let n = BigInt(value);
  if (n < 0n) throw new Error(`Negative ULEB128 value: ${value}`);
  const bytes = [];
  do {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n !== 0n) b |= 0x80;
    bytes.push(b);
  } while (n !== 0n);
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
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;

  while (true) {
    if (offset + bytesRead >= buffer.length) {
      throw new Error(`Truncated ULEB128 at offset ${offset}`);
    }
    const byte = buffer[offset + bytesRead];
    result |= BigInt(byte & 0x7f) << shift;
    bytesRead += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 70n) {
      throw new Error(`ULEB128 too large at offset ${offset}`);
    }
  }

  return { value: Number(result), bigint: result, bytesRead };
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

function remapHeapType(value, mapTypeIndex, contextLabel) {
  const big = BigInt(value);
  if (big < 0n) return big;
  const mapped = mapTypeIndex(Number(big));
  if (mapped === undefined) {
    throw new Error(`Missing heap type remap for ${value} (${contextLabel})`);
  }
  return BigInt(mapped);
}

function remapValueType(vt, mapTypeIndex, contextLabel = 'valtype') {
  if (vt && typeof vt === 'object' && vt.kind === 'ref') {
    return {
      kind: 'ref',
      nullable: Boolean(vt.nullable),
      heapType: remapHeapType(vt.heapType, mapTypeIndex, contextLabel),
    };
  }
  return vt;
}

function encodeValueType(vt, mapTypeIndex = null, contextLabel = 'valtype') {
  if (typeof vt === 'number') {
    return Buffer.from([vt]);
  }
  if (typeof vt === 'string') {
    const code = VAL_TYPE_CODE[vt];
    if (code !== undefined) return Buffer.from([code]);
    throw new Error(`Unsupported string value type: ${vt} (${contextLabel})`);
  }
  if (vt && typeof vt === 'object' && vt.kind === 'ref') {
    const prefix = vt.nullable ? 0x63 : 0x64;
    const ht = mapTypeIndex ? remapHeapType(vt.heapType, mapTypeIndex, contextLabel) : BigInt(vt.heapType);
    return Buffer.concat([Buffer.from([prefix]), encodeSLEB128(ht)]);
  }
  throw new Error(`Unsupported value type representation: ${JSON.stringify(vt)} (${contextLabel})`);
}

function encodeFieldType(field, mapTypeIndex = null, contextLabel = 'field') {
  return Buffer.concat([
    encodeValueType(field.storage, mapTypeIndex, contextLabel),
    Buffer.from([field.mutable ? 1 : 0]),
  ]);
}

function encodeSubtype(type, mapTypeIndex = null) {
  const parts = [];
  const st = type.subtype || { explicit: false, isFinal: true, supertypes: [] };
  if (st.explicit) {
    parts.push(Buffer.from([st.isFinal ? 0x4f : 0x50]));
    parts.push(encodeULEB128(st.supertypes.length));
    for (const sup of st.supertypes) {
      const mappedSup = mapTypeIndex ? mapTypeIndex(sup) : sup;
      parts.push(encodeULEB128(mappedSup));
    }
  }
  if (type.kind === 'func') {
    parts.push(Buffer.from([0x60]));
    parts.push(encodeULEB128(type.params.length));
    for (const p of type.params) {
      parts.push(encodeValueType(p, mapTypeIndex, 'func param'));
    }
    parts.push(encodeULEB128(type.results.length));
    for (const r of type.results) {
      parts.push(encodeValueType(r, mapTypeIndex, 'func result'));
    }
  } else if (type.kind === 'struct') {
    parts.push(Buffer.from([0x5f]));
    parts.push(encodeULEB128(type.fields.length));
    for (const f of type.fields) {
      parts.push(encodeFieldType(f, mapTypeIndex, 'struct field'));
    }
  } else if (type.kind === 'array') {
    parts.push(Buffer.from([0x5e]));
    parts.push(encodeFieldType(type.field, mapTypeIndex, 'array field'));
  } else {
    throw new Error(`Unsupported composite type kind: ${type.kind}`);
  }
  return Buffer.concat(parts);
}

function encodeTypeSection(types, typeGroups = null) {
  const groups =
    typeGroups && typeGroups.length > 0
      ? typeGroups
      : types.map((_, i) => ({ recursive: false, startIndex: i, size: 1 }));
  if (groups.length === 0) return Buffer.alloc(0);

  const body = [encodeULEB128(groups.length)];
  for (const group of groups) {
    if (group.recursive) {
      body.push(Buffer.from([0x4e]));
      body.push(encodeULEB128(group.size));
    }
    for (let i = 0; i < group.size; i++) {
      const type = types[group.startIndex + i];
      body.push(encodeSubtype(type));
    }
  }

  return encodeSection(0x01, Buffer.concat(body));
}

function encodeMemoryLimits(limits) {
  if (!limits || limits.min === undefined) {
    throw new Error('Invalid memory limits for encoding');
  }
  if (limits.max !== undefined) {
    return Buffer.concat([Buffer.from([0x01]), encodeULEB128(limits.min), encodeULEB128(limits.max)]);
  }
  return Buffer.concat([Buffer.from([0x00]), encodeULEB128(limits.min)]);
}

function encodeTableType(tableType) {
  if (!tableType || tableType.elemType === undefined || !tableType.limits) {
    throw new Error('Invalid table type for encoding');
  }
  return Buffer.concat([
    encodeValueType(tableType.elemType, null, 'table elemType'),
    encodeMemoryLimits(tableType.limits),
  ]);
}

function encodeGlobalType(globalType) {
  if (!globalType || globalType.valType === undefined) {
    throw new Error('Invalid global type for encoding');
  }
  return Buffer.concat([
    encodeValueType(globalType.valType, null, 'global valType'),
    Buffer.from([globalType.mutable ? 1 : 0]),
  ]);
}

function encodeTagType(tagEntry) {
  return Buffer.concat([Buffer.from([tagEntry.attribute || 0x00]), encodeULEB128(tagEntry.typeIdx)]);
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
    } else if (imp.kind === 0x04) {
      body.push(encodeTagType({ attribute: imp.attribute || 0, typeIdx: imp.typeIdx }));
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

function encodeTagSection(tagEntries) {
  if (!tagEntries || tagEntries.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(tagEntries.length)];
  for (const tag of tagEntries) {
    body.push(encodeTagType(tag));
  }
  return encodeSection(0x0d, Buffer.concat(body));
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

function encodeStartSection(startFuncIndex) {
  if (startFuncIndex === null || startFuncIndex === undefined) return Buffer.alloc(0);
  return encodeSection(0x08, encodeULEB128(startFuncIndex));
}

function encodeCodeSection(functionBodies) {
  if (functionBodies.length === 0) return Buffer.alloc(0);
  const body = [encodeULEB128(functionBodies.length)];

  for (const fn of functionBodies) {
    const localDecl = [encodeULEB128(fn.locals.length)];
    for (const local of fn.locals) {
      localDecl.push(encodeULEB128(local.count));
      localDecl.push(encodeValueType(local.valType, null, 'local valType'));
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

    if (!(flags & 0x01)) {
      if (!entry.initExpr) {
        throw new Error(`Element entry missing initExpr for flags=${flags}`);
      }
      body.push(entry.initExpr);
    }

    if (flags >= 5) {
      body.push(entry.reftypeBytes || encodeValueType(entry.reftype, null, 'elem reftype'));
    } else if (flags === 1 || flags === 2 || flags === 3) {
      body.push(Buffer.from([0x00]));
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
  typeGroups,
  importsList,
  functionTypeIndices,
  tableEntries,
  memoryEntries,
  tagEntries,
  globalEntries,
  exportsList,
  startFuncIndex,
  elementEntries,
  functionBodies,
  dataEntries,
  includeDataCount,
}) {
  const magicVersion = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  // Note: Tag section (0x0D) must precede Global section (0x06), and DataCount (0x0C) must precede Code (0x0A).
  const sections = [
    encodeTypeSection(types, typeGroups),
    encodeImportSection(importsList),
    encodeFunctionSection(functionTypeIndices),
    encodeTableSection(tableEntries),
    encodeMemorySection(memoryEntries),
    encodeTagSection(tagEntries),
    encodeGlobalSection(globalEntries),
    encodeExportSection(exportsList),
    encodeStartSection(startFuncIndex),
    encodeElementSection(elementEntries),
    includeDataCount ? encodeDataCountSection((dataEntries || []).length) : Buffer.alloc(0),
    encodeCodeSection(functionBodies),
    encodeDataSection(dataEntries),
  ].filter(buf => buf.length > 0);
  return Buffer.concat([magicVersion, ...sections]);
}

function rewriteBlockType(code, offset, out, mapTypeIndex, contextLabel) {
  if (offset >= code.length) {
    throw new Error(`Truncated block type (${contextLabel})`);
  }
  const firstByte = code[offset];
  if (firstByte === 0x40) {
    out.push(Buffer.from([0x40]));
    return offset + 1;
  }
  if (firstByte === 0x63 || firstByte === 0x64) {
    out.push(Buffer.from([firstByte]));
    const ht = decodeSLEB128(code, offset + 1);
    out.push(encodeSLEB128(remapHeapType(ht.value, mapTypeIndex, contextLabel)));
    return offset + 1 + ht.bytesRead;
  }
  if (ValTypeName[firstByte] || HeapTypeName[firstByte]) {
    out.push(Buffer.from([firstByte]));
    return offset + 1;
  }
  const bt = decodeSLEB128(code, offset);
  if (bt.value < 0n) {
    out.push(encodeSLEB128(bt.value));
  } else {
    const mapped = mapTypeIndex(Number(bt.value));
    if (mapped === undefined) {
      throw new Error(`Missing block type index remap for ${bt.value} (${contextLabel})`);
    }
    out.push(encodeSLEB128(BigInt(mapped)));
  }
  return offset + bt.bytesRead;
}

function rewriteMemarg(code, offset, out, mapMemoryIndex, contextLabel) {
  const align = decodeULEB128(code, offset);
  offset += align.bytesRead;
  let memoryIndex = 0;
  if (align.value & 0x40) {
    const index = decodeULEB128(code, offset);
    memoryIndex = index.value;
    offset += index.bytesRead;
  }
  const mapped = mapMemoryIndex ? mapMemoryIndex(memoryIndex) : memoryIndex;
  out.push(encodeULEB128((align.value & 0x3f) | (mapped ? 0x40 : 0)));
  if (mapped) out.push(encodeULEB128(mapped));

  // Preserve legal padded u64 offset bytes
  const offsetStart = offset;
  while (offset < code.length && (code[offset++] & 0x80)) {}
  if (offset === offsetStart || (code[offset - 1] & 0x80)) {
    throw new Error(`Truncated memory offset (${contextLabel})`);
  }
  out.push(code.subarray(offsetStart, offset));
  return offset;
}

function rewriteConstExprBytes(expr, mapFuncIndex, mapGlobalIndex, contextLabel, mapTypeIndex, mapDataIndex, mapElemIndex) {
  const res = rewriteCodeBytes(expr, {
    mapFuncIndex,
    mapTypeIndex: mapTypeIndex || (idx => idx),
    mapMemoryIndex: idx => idx,
    mapDataIndex: mapDataIndex || (idx => idx),
    mapTableIndex: idx => idx,
    mapElemIndex: mapElemIndex || (idx => idx),
    mapGlobalIndex,
    mapTagIndex: idx => idx,
    contextLabel,
  });
  return res.code;
}

function rewriteCodeBytes(code, {
  mapFuncIndex,
  mapTypeIndex,
  mapMemoryIndex,
  mapDataIndex,
  mapTableIndex,
  mapElemIndex,
  mapGlobalIndex,
  mapTagIndex,
  contextLabel,
}) {
  const out = [];
  let offset = 0;
  let usesDataIndexOps = false;

  function copyBytes(start, end) {
    if (end > code.length) {
      throw new Error(`Truncated instruction immediate (${contextLabel})`);
    }
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

    // call (0x10), return_call (0x12), ref.func (0xd2)
    if (opcode === 0x10 || opcode === 0x12 || opcode === 0xd2) {
      const decoded = readULEBAt(offset);
      const mapped = mapFuncIndex(decoded.value);
      out.push(encodeULEB128(mapped));
      offset += decoded.bytesRead;
      continue;
    }

    // call_indirect (0x11), return_call_indirect (0x13), call_ref (0x14), return_call_ref (0x15)
    if (opcode === 0x11 || opcode === 0x13 || opcode === 0x14 || opcode === 0x15) {
      const typeIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
      offset += typeIdx.bytesRead;

      if (opcode === 0x11 || opcode === 0x13) {
        const tableIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTableIndex ? mapTableIndex(tableIdx.value) : tableIdx.value));
        offset += tableIdx.bytesRead;
      }
      continue;
    }

    // block (0x02), loop (0x03), if (0x04), legacy try (0x06)
    if (opcode === 0x02 || opcode === 0x03 || opcode === 0x04 || opcode === 0x06) {
      offset = rewriteBlockType(code, offset, out, mapTypeIndex, contextLabel);
      continue;
    }

    // try_table (0x1f)
    if (opcode === 0x1f) {
      offset = rewriteBlockType(code, offset, out, mapTypeIndex, contextLabel);
      const catchCount = readULEBAt(offset);
      out.push(encodeULEB128(catchCount.value));
      offset += catchCount.bytesRead;
      for (let i = 0; i < catchCount.value; i++) {
        if (offset >= code.length) throw new Error(`Truncated try_table catch (${contextLabel})`);
        const kindByte = code[offset++];
        out.push(Buffer.from([kindByte]));
        if (kindByte === 0x00 || kindByte === 0x01) {
          const tagIdx = readULEBAt(offset);
          out.push(encodeULEB128(mapTagIndex ? mapTagIndex(tagIdx.value) : tagIdx.value));
          offset += tagIdx.bytesRead;
        }
        const labelIdx = readULEBAt(offset);
        out.push(encodeULEB128(labelIdx.value));
        offset += labelIdx.bytesRead;
      }
      continue;
    }

    // legacy catch (0x07), throw (0x08) -> tagidx
    if (opcode === 0x07 || opcode === 0x08) {
      const tagIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapTagIndex ? mapTagIndex(tagIdx.value) : tagIdx.value));
      offset += tagIdx.bytesRead;
      continue;
    }

    // rethrow (0x09), br (0x0c), br_if (0x0d), br_on_null (0xd5), br_on_non_null (0xd6) -> labelidx
    if (opcode === 0x09 || opcode === 0x0c || opcode === 0x0d || opcode === 0xd5 || opcode === 0xd6) {
      const imm = readULEBAt(offset);
      out.push(encodeULEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }

    // br_table (0x0e)
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

    // table.get (0x25), table.set (0x26)
    if (opcode === 0x25 || opcode === 0x26) {
      const tableIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapTableIndex(tableIdx.value)));
      offset += tableIdx.bytesRead;
      continue;
    }

    // global.get (0x23), global.set (0x24)
    if (opcode === 0x23 || opcode === 0x24) {
      const globalIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapGlobalIndex(globalIdx.value)));
      offset += globalIdx.bytesRead;
      continue;
    }

    // local.get (0x20), local.set (0x21), local.tee (0x22)
    if (opcode >= 0x20 && opcode <= 0x22) {
      const imm = readULEBAt(offset);
      out.push(encodeULEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }

    // Scalar memory loads/stores (0x28..0x3e)
    if (opcode >= 0x28 && opcode <= 0x3e) {
      offset = rewriteMemarg(code, offset, out, mapMemoryIndex, contextLabel);
      continue;
    }

    // memory.size (0x3f), memory.grow (0x40)
    if (opcode === 0x3f || opcode === 0x40) {
      const memIdx = readULEBAt(offset);
      out.push(encodeULEB128(mapMemoryIndex(memIdx.value)));
      offset += memIdx.bytesRead;
      continue;
    }

    // i32.const (0x41), i64.const (0x42)
    if (opcode === 0x41 || opcode === 0x42) {
      const imm = readSLEBAt(offset);
      out.push(encodeSLEB128(imm.value));
      offset += imm.bytesRead;
      continue;
    }

    // f32.const (0x43)
    if (opcode === 0x43) {
      copyBytes(offset, offset + 4);
      offset += 4;
      continue;
    }

    // f64.const (0x44)
    if (opcode === 0x44) {
      copyBytes(offset, offset + 8);
      offset += 8;
      continue;
    }

    // select_t (0x1c)
    if (opcode === 0x1c) {
      const count = readULEBAt(offset);
      out.push(encodeULEB128(count.value));
      offset += count.bytesRead;
      for (let i = 0; i < count.value; i++) {
        const vt = decodeValueType(code, offset, false, true);
        out.push(encodeValueType(vt.value, mapTypeIndex, `${contextLabel}:select_t`));
        offset += vt.bytesRead;
      }
      continue;
    }

    // ref.null (0xd0)
    if (opcode === 0xd0) {
      const heapType = readSLEBAt(offset);
      out.push(encodeSLEB128(remapHeapType(heapType.value, mapTypeIndex, contextLabel)));
      offset += heapType.bytesRead;
      continue;
    }

    // 0xFC prefix (saturating truncations 0..7, bulk memory 8..11, table ops 12..17)
    if (opcode === 0xfc) {
      const sub = readULEBAt(offset);
      out.push(encodeULEB128(sub.value));
      offset += sub.bytesRead;

      if (sub.value >= 0 && sub.value <= 7) {
        // i32/i64.trunc_sat_f32/f64_s/u: no immediates
        continue;
      }

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

      if (sub.value === 11) {
        // memory.fill memidx
        const memIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapMemoryIndex(memIdx.value)));
        offset += memIdx.bytesRead;
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

      throw new Error(`Unsupported 0xfc subopcode ${sub.value} in static mode (${contextLabel})`);
    }

    // 0xFB prefix (Wasm GC)
    if (opcode === 0xfb) {
      const sub = readULEBAt(offset);
      out.push(encodeULEB128(sub.value));
      offset += sub.bytesRead;
      const s = sub.value;

      if (
        s === 0 ||
        s === 1 ||
        s === 6 ||
        s === 7 ||
        s === 11 ||
        s === 12 ||
        s === 13 ||
        s === 14 ||
        s === 16
      ) {
        // struct.new, struct.new_default, array.new, array.new_default, array.get*, array.set, array.fill
        const typeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
        offset += typeIdx.bytesRead;
        continue;
      }

      if (s >= 2 && s <= 5) {
        // struct.get, struct.get_s, struct.get_u, struct.set -> typeidx, fieldidx
        const typeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
        offset += typeIdx.bytesRead;
        const fieldIdx = readULEBAt(offset);
        out.push(encodeULEB128(fieldIdx.value));
        offset += fieldIdx.bytesRead;
        continue;
      }

      if (s === 8) {
        // array.new_fixed -> typeidx, length
        const typeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
        offset += typeIdx.bytesRead;
        const len = readULEBAt(offset);
        out.push(encodeULEB128(len.value));
        offset += len.bytesRead;
        continue;
      }

      if (s === 9 || s === 18) {
        // array.new_data, array.init_data -> typeidx, dataidx
        const typeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
        offset += typeIdx.bytesRead;
        const dataIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapDataIndex(dataIdx.value)));
        offset += dataIdx.bytesRead;
        usesDataIndexOps = true;
        continue;
      }

      if (s === 10 || s === 19) {
        // array.new_elem, array.init_elem -> typeidx, elemidx
        const typeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(typeIdx.value)));
        offset += typeIdx.bytesRead;
        const elemIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapElemIndex(elemIdx.value)));
        offset += elemIdx.bytesRead;
        continue;
      }

      if (s === 17) {
        // array.copy -> dstTypeIdx, srcTypeIdx
        const dstTypeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(dstTypeIdx.value)));
        offset += dstTypeIdx.bytesRead;
        const srcTypeIdx = readULEBAt(offset);
        out.push(encodeULEB128(mapTypeIndex(srcTypeIdx.value)));
        offset += srcTypeIdx.bytesRead;
        continue;
      }

      if (s >= 20 && s <= 23) {
        // ref.test, ref.test_null, ref.cast, ref.cast_null -> s33 heaptype
        const ht = readSLEBAt(offset);
        out.push(encodeSLEB128(remapHeapType(ht.value, mapTypeIndex, contextLabel)));
        offset += ht.bytesRead;
        continue;
      }

      if (s === 24 || s === 25) {
        // br_on_cast, br_on_cast_fail -> flags (1B), labelidx, s33 ht1, s33 ht2
        if (offset >= code.length) throw new Error(`Truncated br_on_cast flags (${contextLabel})`);
        const flags = code[offset++];
        out.push(Buffer.from([flags]));
        const labelIdx = readULEBAt(offset);
        out.push(encodeULEB128(labelIdx.value));
        offset += labelIdx.bytesRead;
        const ht1 = readSLEBAt(offset);
        out.push(encodeSLEB128(remapHeapType(ht1.value, mapTypeIndex, contextLabel)));
        offset += ht1.bytesRead;
        const ht2 = readSLEBAt(offset);
        out.push(encodeSLEB128(remapHeapType(ht2.value, mapTypeIndex, contextLabel)));
        offset += ht2.bytesRead;
        continue;
      }

      if (s === 15 || (s >= 26 && s <= 30)) {
        // array.len, any.convert_extern, extern.convert_any, ref.i31, i31.get_s, i31.get_u
        continue;
      }

      throw new Error(`Unsupported 0xfb subopcode ${s} in static mode (${contextLabel})`);
    }

    // 0xFD prefix (128-bit SIMD)
    if (opcode === 0xfd) {
      const sub = readULEBAt(offset);
      out.push(encodeULEB128(sub.value));
      offset += sub.bytesRead;
      const s = sub.value;

      if ((s >= 0 && s <= 11) || s === 92 || s === 93) {
        // v128.load*, v128.store -> memarg
        offset = rewriteMemarg(code, offset, out, mapMemoryIndex, contextLabel);
        continue;
      }

      if (s >= 84 && s <= 91) {
        // v128.load*_lane, v128.store*_lane -> memarg + 1 lane byte
        offset = rewriteMemarg(code, offset, out, mapMemoryIndex, contextLabel);
        copyBytes(offset, offset + 1);
        offset += 1;
        continue;
      }

      if (s === 12 || s === 13) {
        // v128.const (16B) or i8x16.shuffle (16B)
        copyBytes(offset, offset + 16);
        offset += 16;
        continue;
      }

      if (s >= 21 && s <= 34) {
        // extract_lane / replace_lane -> 1 lane byte
        copyBytes(offset, offset + 1);
        offset += 1;
        continue;
      }

      // All other SIMD instructions have 0 immediates
      continue;
    }
  }

  return {
    code: Buffer.concat(out),
    usesDataIndexOps,
  };
}

function getImportedCountByKind(importSection, kind) {
  return importSection.filter(imp => imp.kind === kind).length;
}

function canonicalValueTypeKey(moduleInfo, vt) {
  if (typeof vt === 'number') {
    return `num:${vt}`;
  }
  if (typeof vt === 'string') {
    const code = VAL_TYPE_CODE[vt];
    return code !== undefined ? `num:${code}` : `str:${vt}`;
  }
  if (vt && typeof vt === 'object' && vt.kind === 'ref') {
    const ht = BigInt(vt.heapType);
    const htKey =
      ht < 0n
        ? `abs:${ht.toString()}`
        : `type:${moduleInfo.typeEnv.get(Number(ht)).canonicalId}`;
    return `ref:${vt.nullable ? 'null:' : ''}${htKey}`;
  }
  return JSON.stringify(vt);
}

function getFunctionDescriptor(moduleInfo, funcIndex) {
  const importedFunctionCount = moduleInfo.importedFunctionCount;
  if (funcIndex < importedFunctionCount) {
    const importedFunctions = moduleInfo.imports.filter(imp => imp.kind === 0x00);
    const imp = importedFunctions[funcIndex];
    if (!imp || imp.typeIdx === undefined) return null;
    return {
      typeIdx: imp.typeIdx,
      sig: moduleInfo.typeSection[imp.typeIdx] || null,
      canonicalId: moduleInfo.typeEnv.get(imp.typeIdx).canonicalId,
    };
  }

  const localIndex = funcIndex - importedFunctionCount;
  const typeIdx = moduleInfo.functionSection[localIndex];
  if (typeIdx === undefined) return null;
  return {
    typeIdx,
    sig: moduleInfo.typeSection[typeIdx] || null,
    canonicalId: moduleInfo.typeEnv.get(typeIdx).canonicalId,
  };
}

function getTableDescriptor(moduleInfo, tableIndex) {
  if (tableIndex < moduleInfo.importedTableCount) {
    const imported = moduleInfo.imports.filter(imp => imp.kind === 0x01);
    return imported[tableIndex]?.tableType || null;
  }
  return moduleInfo.rawTableSection[tableIndex - moduleInfo.importedTableCount] || null;
}

function getMemoryDescriptor(moduleInfo, memoryIndex) {
  if (memoryIndex < moduleInfo.importedMemoryCount) {
    const imported = moduleInfo.imports.filter(imp => imp.kind === 0x02);
    return imported[memoryIndex]?.memoryType || null;
  }
  return moduleInfo.memorySection[memoryIndex - moduleInfo.importedMemoryCount] || null;
}

function getGlobalDescriptor(moduleInfo, globalIndex) {
  if (globalIndex < moduleInfo.importedGlobalCount) {
    const imported = moduleInfo.imports.filter(imp => imp.kind === 0x03);
    return imported[globalIndex]?.rawGlobalType || imported[globalIndex]?.globalType || null;
  }
  const entry = moduleInfo.rawGlobalSection[globalIndex - moduleInfo.importedGlobalCount];
  return entry ? entry.globalType : null;
}

function getTagDescriptor(moduleInfo, tagIndex) {
  if (tagIndex < moduleInfo.importedTagCount) {
    const imported = moduleInfo.imports.filter(imp => imp.kind === 0x04);
    const imp = imported[tagIndex];
    if (!imp) return null;
    return {
      typeIdx: imp.typeIdx,
      canonicalId: moduleInfo.typeEnv.get(imp.typeIdx).canonicalId,
    };
  }
  const entry = moduleInfo.tagSection[tagIndex - moduleInfo.importedTagCount];
  if (!entry) return null;
  return {
    typeIdx: entry.typeIdx,
    canonicalId: moduleInfo.typeEnv.get(entry.typeIdx).canonicalId,
  };
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

function describeImportType(moduleInfo, imp) {
  if (imp.kind === 0x00) {
    const sig = moduleInfo.typeSection[imp.typeIdx] || { params: [], results: [] };
    const canonicalId = moduleInfo.typeEnv.get(imp.typeIdx).canonicalId;
    return {
      kind: 'func',
      signature: cloneTypeSignature(sig),
      signatureKey: canonicalId || signatureToKey(sig),
    };
  }
  if (imp.kind === 0x01) {
    const rawTable = imp.rawTableType || imp.tableType;
    return {
      kind: 'table',
      type: imp.tableType || null,
      elemKey: rawTable ? canonicalValueTypeKey(moduleInfo, rawTable.elemType) : null,
    };
  }
  if (imp.kind === 0x02) {
    return { kind: 'memory', type: imp.memoryType || null };
  }
  if (imp.kind === 0x03) {
    const rawGlobal = imp.rawGlobalType || imp.globalType;
    return {
      kind: 'global',
      type: imp.globalType || null,
      valKey: rawGlobal ? canonicalValueTypeKey(moduleInfo, rawGlobal.valType) : null,
      mutable: rawGlobal ? Boolean(rawGlobal.mutable) : false,
    };
  }
  if (imp.kind === 0x04) {
    const sig = moduleInfo.typeSection[imp.typeIdx] || { params: [], results: [] };
    const canonicalId = moduleInfo.typeEnv.get(imp.typeIdx).canonicalId;
    return {
      kind: 'tag',
      signature: cloneTypeSignature(sig),
      signatureKey: canonicalId || signatureToKey(sig),
    };
  }
  return { kind: `unknown_${imp.kind}` };
}

function describeExportType(moduleInfo, exp) {
  if (exp.kind === 0x00) {
    const desc = getFunctionDescriptor(moduleInfo, exp.wasmIndex);
    const sig = desc?.sig || { params: [], results: [] };
    return {
      kind: 'func',
      signature: cloneTypeSignature(sig),
      signatureKey: desc?.canonicalId || signatureToKey(sig),
    };
  }
  if (exp.kind === 0x01) {
    const tableType = getTableDescriptor(moduleInfo, exp.wasmIndex);
    return {
      kind: 'table',
      type: tableType,
      elemKey: tableType ? canonicalValueTypeKey(moduleInfo, tableType.elemType) : null,
    };
  }
  if (exp.kind === 0x02) {
    return {
      kind: 'memory',
      type: getMemoryDescriptor(moduleInfo, exp.wasmIndex),
    };
  }
  if (exp.kind === 0x03) {
    const globalType = getGlobalDescriptor(moduleInfo, exp.wasmIndex);
    return {
      kind: 'global',
      type: globalType,
      valKey: globalType ? canonicalValueTypeKey(moduleInfo, globalType.valType) : null,
      mutable: globalType ? Boolean(globalType.mutable) : false,
    };
  }
  if (exp.kind === 0x04) {
    const desc = getTagDescriptor(moduleInfo, exp.wasmIndex);
    const sig = desc ? moduleInfo.typeSection[desc.typeIdx] || { params: [], results: [] } : { params: [], results: [] };
    return {
      kind: 'tag',
      signature: cloneTypeSignature(sig),
      signatureKey: desc?.canonicalId || signatureToKey(sig),
    };
  }
  return { kind: `unknown_${exp.kind}` };
}

function compatibleLimits(importLimits, exportLimits) {
  if (!importLimits || !exportLimits) return true;
  if (exportLimits.min < importLimits.min) return false;
  if (importLimits.max !== undefined) {
    if (exportLimits.max === undefined || exportLimits.max > importLimits.max) {
      return false;
    }
  }
  return true;
}

function compatibleTypes(importType, exportType) {
  if (!importType || !exportType) return false;
  if (importType.kind !== exportType.kind) return false;

  if (importType.kind === 'func' || importType.kind === 'tag') {
    return importType.signatureKey === exportType.signatureKey;
  }
  if (importType.kind === 'global') {
    if (importType.valKey && exportType.valKey && importType.valKey !== exportType.valKey) {
      return false;
    }
    return Boolean(importType.mutable) === Boolean(exportType.mutable);
  }
  if (importType.kind === 'table') {
    if (importType.elemKey && exportType.elemKey && importType.elemKey !== exportType.elemKey) {
      return false;
    }
    return compatibleLimits(importType.type?.limits, exportType.type?.limits);
  }
  if (importType.kind === 'memory') {
    return compatibleLimits(importType.type, exportType.type);
  }
  return true;
}

class WasmLinker {
  constructor(options = {}) {
    this.options = {
      strict: Boolean(options.strict),
      validateRoundtrip: Boolean(options.validateRoundtrip),
      exportAll: Boolean(options.exportAll),
    };
    this.assembler = new WatAssembler();
  }

  analyzeModules(inputs) {
    const usedIds = new Set();
    const modules = [];

    for (let i = 0; i < inputs.length; i++) {
      const item = inputs[i];
      let absPath = null;
      let buffer;
      let idHint = null;

      if (typeof item === 'string') {
        absPath = path.resolve(item);
        buffer = readFileChecked(absPath);
        idHint = absPath;
      } else if (item instanceof Uint8Array) {
        buffer = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
        idHint = `module_${i}`;
      } else if (item && typeof item === 'object' && item.bytes instanceof Uint8Array) {
        buffer = Buffer.from(item.bytes.buffer, item.bytes.byteOffset, item.bytes.byteLength);
        absPath = item.path ? path.resolve(item.path) : null;
        idHint = item.id || item.name || absPath || `module_${i}`;
      } else {
        throw new Error(`Invalid module input at index ${i}`);
      }

      const raw = decodeModule(buffer, { copyInput: false });
      const dis = new WasmDisassembler(buffer);
      const wat = dis.disassemble();

      if (this.options.validateRoundtrip) {
        try {
          this.assembler.assemble(wat);
        } catch (err) {
          throw new Error(`Roundtrip validation failed for ${absPath || idHint}: ${err.message}`);
        }
      }

      const id =
        item && typeof item === 'object' && item.id && !usedIds.has( sanitizeIdentifier(item.id) )
          ? (usedIds.add(sanitizeIdentifier(item.id)), sanitizeIdentifier(item.id))
          : normalizeModuleId(dis.nameSection, idHint, usedIds);

      const typeEnv = new TypeEnvironment(raw.typeSection, raw.typeGroups);

      const imports = dis.importSection.map((imp, index) => ({
        index,
        module: imp.module,
        name: imp.name,
        kind: imp.kind,
        typeIdx: imp.typeIdx,
        attribute: imp.attribute,
        tableType: imp.tableType,
        rawTableType: raw.importSection[index].tableType,
        memoryType: imp.memoryType,
        globalType: imp.globalType,
        rawGlobalType: raw.importSection[index].globalType,
      }));
      const exports = dis.exportSection.map((exp, index) => ({
        index,
        name: exp.name,
        kind: exp.kind,
        wasmIndex: exp.index,
      }));

      modules.push({
        id,
        path: absPath || `<memory:${id}>`,
        bytes: buffer,
        wat,
        typeEnv,
        typeSection: dis.typeSection,
        rawTypeSection: raw.typeSection,
        typeGroups: raw.typeGroups,
        importSection: dis.importSection,
        rawImportSection: raw.importSection,
        functionSection: dis.functionSection,
        tableSection: dis.tableSection,
        rawTableSection: raw.tableSection,
        memorySection: dis.memorySection,
        globalSection: dis.globalSection,
        rawGlobalSection: raw.globalSection,
        elementSection: dis.elementSection,
        rawElementSection: raw.elementSection,
        dataSection: dis.dataSection,
        tagSection: dis.tagSection,
        startSection: dis.startSection,
        codeSection: dis.codeSection,
        rawCodeSection: raw.codeSection,
        imports,
        exports,
        importedFunctionCount: getImportedCountByKind(dis.importSection, 0x00),
        importedTableCount: getImportedCountByKind(dis.importSection, 0x01),
        importedMemoryCount: getImportedCountByKind(dis.importSection, 0x02),
        importedGlobalCount: getImportedCountByKind(dis.importSection, 0x03),
        importedTagCount: getImportedCountByKind(dis.importSection, 0x04),
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
        let candidates = (exportIndex.get(key) || [])
          .filter(c => c.moduleId !== consumer.id)
          .filter(c => compatibleTypes(importType, c.exportType));

        // Resolve MaiaJS cross-module host imports shaped like __<moduleId>__<symbol>
        if (candidates.length === 0) {
          const modPrefixMatch = imp.name.match(/^__([A-Za-z0-9_]+)__(.+)$/);
          if (modPrefixMatch) {
            const [, targetMod, targetSym] = modPrefixMatch;
            const targetKey = `${targetSym}::${importType.kind}`;
            const allTargetCandidates = (exportIndex.get(targetKey) || [])
              .filter(c => c.moduleId !== consumer.id)
              .filter(c => compatibleTypes(importType, c.exportType));
            const modMatched = allTargetCandidates.filter(
              c => c.moduleId === targetMod || sanitizeIdentifier(c.moduleId) === targetMod
            );
            candidates = modMatched.length > 0 ? modMatched : allTargetCandidates;
          }
        }

        // Disambiguate by matching import module name when multiple modules export the same symbol
        if (candidates.length > 1) {
          const sanitizedImportMod = sanitizeIdentifier(imp.module);
          const exact = candidates.filter(
            c => c.moduleId === imp.module || c.moduleId === sanitizedImportMod
          );
          if (exact.length === 1) {
            candidates = exact;
          }
        }

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

  computeLoadOrder(modules, resolutions, { allowCycles = false } = {}) {
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
      if (!allowCycles) {
        throw new Error('Dependency cycle detected between modules (cannot compute load order)');
      }
      for (const id of moduleIds) {
        if (!order.includes(id)) order.push(id);
      }
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

    // 1. Intern & remap Type Groups (supporting func, struct, array, sub, sub final, rec groups, and ref types)
    const typePool = [];
    const typeGroupsPool = [];
    const typeGroupMap = new Map();
    const moduleTypeRemap = new Map();

    function remapCompositeType(rawType, mapIdx) {
      const st = rawType.subtype || { explicit: false, isFinal: true, supertypes: [] };
      const subtype = {
        explicit: Boolean(st.explicit),
        isFinal: Boolean(st.isFinal),
        supertypes: (st.supertypes || []).map(sup => mapIdx(sup)),
      };
      if (rawType.kind === 'func') {
        return {
          kind: 'func',
          params: rawType.params.map(p => remapValueType(p, mapIdx, 'type func param')),
          results: rawType.results.map(r => remapValueType(r, mapIdx, 'type func result')),
          subtype,
        };
      }
      if (rawType.kind === 'struct') {
        return {
          kind: 'struct',
          fields: rawType.fields.map(f => ({
            storage: remapValueType(f.storage, mapIdx, 'type struct field'),
            mutable: Boolean(f.mutable),
          })),
          subtype,
        };
      }
      if (rawType.kind === 'array') {
        return {
          kind: 'array',
          field: {
            storage: remapValueType(rawType.field.storage, mapIdx, 'type array field'),
            mutable: Boolean(rawType.field.mutable),
          },
          subtype,
        };
      }
      throw new Error(`Unsupported composite type kind: ${rawType.kind}`);
    }

    function internSingleFuncType(params, results) {
      const tempEnv = new TypeEnvironment(
        [{ kind: 'func', params, results, subtype: { explicit: false, isFinal: true, supertypes: [] } }],
        [{ recursive: false, startIndex: 0, size: 1 }]
      );
      const key = `${tempEnv.get(0).groupCanonicalId}|rec:0|exp:I`;
      if (typeGroupMap.has(key)) {
        return typeGroupMap.get(key);
      }
      const newStart = typePool.length;
      typeGroupMap.set(key, newStart);
      typePool.push({
        kind: 'func',
        params,
        results,
        subtype: { explicit: false, isFinal: true, supertypes: [] },
      });
      typeGroupsPool.push({ recursive: false, startIndex: newStart, size: 1 });
      return newStart;
    }

    for (const mod of linkResult.modules) {
      const remap = new Map();
      const rawGroups =
        mod.typeGroups && mod.typeGroups.length > 0
          ? mod.typeGroups
          : mod.rawTypeSection.map((_, idx) => ({ recursive: false, startIndex: idx, size: 1 }));

      for (let gIdx = 0; gIdx < rawGroups.length; gIdx++) {
        const group = rawGroups[gIdx];
        const groupTypes = mod.rawTypeSection.slice(group.startIndex, group.startIndex + group.size);
        const explicitFlags = groupTypes
          .map(t => (t.subtype?.explicit ? (t.subtype.isFinal ? 'F' : 'S') : 'I'))
          .join(',');
        const canonicalGroupId =
          group.size > 0 ? mod.typeEnv.get(group.startIndex).groupCanonicalId : `empty_${gIdx}`;
        const key = `${canonicalGroupId}|rec:${group.recursive ? 1 : 0}|exp:${explicitFlags}`;

        if (group.size > 0 && typeGroupMap.has(key)) {
          const existingStart = typeGroupMap.get(key);
          for (let k = 0; k < group.size; k++) {
            remap.set(group.startIndex + k, existingStart + k);
          }
          continue;
        }

        const newStart = typePool.length;
        if (group.size > 0) {
          typeGroupMap.set(key, newStart);
        }
        for (let k = 0; k < group.size; k++) {
          remap.set(group.startIndex + k, newStart + k);
        }
        const mapIdx = oldIdx => {
          const mapped = remap.get(oldIdx);
          if (mapped === undefined) {
            throw new Error(`Missing type index remap for ${mod.id}:${oldIdx}`);
          }
          return mapped;
        };
        for (let k = 0; k < group.size; k++) {
          typePool.push(remapCompositeType(groupTypes[k], mapIdx));
        }
        typeGroupsPool.push({
          recursive: Boolean(group.recursive),
          startIndex: newStart,
          size: group.size,
        });
      }

      moduleTypeRemap.set(mod.id, remap);
    }

    // 2. Collect per-module imports by kind & local functions
    const localFunctionMap = new Map();
    const localFunctionBodies = [];
    const outputFunctionTypeIndices = [];
    const pendingFuncImportMap = new Map();
    const moduleMemoryImports = new Map();
    const moduleTableImports = new Map();
    const moduleGlobalImports = new Map();
    const moduleTagImports = new Map();

    let localFuncCounter = 0;
    for (const mod of linkResult.modules) {
      const remapType = moduleTypeRemap.get(mod.id);
      const functionImports = mod.imports.filter(imp => imp.kind === 0x00);
      const tableImports = mod.imports.filter(imp => imp.kind === 0x01);
      const memoryImports = mod.imports.filter(imp => imp.kind === 0x02);
      const globalImports = mod.imports.filter(imp => imp.kind === 0x03);
      const tagImports = mod.imports.filter(imp => imp.kind === 0x04);

      moduleTableImports.set(mod.id, tableImports);
      moduleMemoryImports.set(mod.id, memoryImports);
      moduleGlobalImports.set(mod.id, globalImports);
      moduleTagImports.set(mod.id, tagImports);

      for (let i = 0; i < mod.functionSection.length; i++) {
        const oldFuncIdx = mod.importedFunctionCount + i;
        const outputFuncIdx = localFuncCounter++;
        localFunctionMap.set(`${mod.id}:${oldFuncIdx}`, outputFuncIdx);
        outputFunctionTypeIndices.push(remapType.get(mod.functionSection[i]));
        const rawBody = mod.rawCodeSection[i];
        localFunctionBodies.push({
          moduleId: mod.id,
          oldFuncIdx,
          locals: rawBody.locals.map(local => ({
            count: local.count,
            valType: remapValueType(local.valType, oldIdx => remapType.get(oldIdx), `${mod.id}:local`),
          })),
          code: rawBody.code,
        });
      }

      for (const imp of functionImports) {
        const resolved = resolutionByConsumerImport.get(`${mod.id}:${imp.index}`);
        if (!resolved) {
          const typeIdx = remapType.get(imp.typeIdx);
          const key = `${imp.module}:${imp.name}:${typeIdx}`;
          if (!pendingFuncImportMap.has(key)) {
            pendingFuncImportMap.set(key, {
              kind: 0x00,
              module: imp.module,
              name: imp.name,
              typeIdx,
              key,
            });
          }
        }
      }
    }

    const outputFunctionImports = Array.from(pendingFuncImportMap.values());
    const funcImportIndexMap = new Map();
    outputFunctionImports.forEach((imp, index) => {
      funcImportIndexMap.set(imp.key, index);
    });
    const localFuncToWasmIndex = idx => outputFunctionImports.length + idx;

    // 3. Memories (local + multiple external imports)
    const localMemoryMap = new Map();
    const outputMemoryEntries = [];
    for (const mod of linkResult.modules) {
      for (let i = 0; i < (mod.memorySection || []).length; i++) {
        const oldIdx = mod.importedMemoryCount + i;
        localMemoryMap.set(`${mod.id}:${oldIdx}`, outputMemoryEntries.length);
        outputMemoryEntries.push(mod.memorySection[i]);
      }
    }

    const memoryResolveMemo = new Map();
    const memoryResolveStack = new Set();
    const resolveMemoryDescriptor = (moduleId, oldMemoryIdx) => {
      const cacheKey = `${moduleId}:${oldMemoryIdx}`;
      if (memoryResolveMemo.has(cacheKey)) return memoryResolveMemo.get(cacheKey);
      const mod = moduleById.get(moduleId);
      if (!mod) throw new Error(`Unknown module id while resolving memory index: ${moduleId}`);

      if (oldMemoryIdx < mod.importedMemoryCount) {
        const memoryImports = moduleMemoryImports.get(moduleId) || [];
        const imp = memoryImports[oldMemoryIdx];
        if (!imp) throw new Error(`Missing memory import for ${moduleId}:${oldMemoryIdx}`);
        if (memoryResolveStack.has(cacheKey)) {
          return { kind: 'external', module: imp.module, name: imp.name, memoryType: imp.memoryType };
        }
        memoryResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveMemoryDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : { kind: 'external', module: imp.module, name: imp.name, memoryType: imp.memoryType };
        memoryResolveStack.delete(cacheKey);
        memoryResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldMemoryIdx}`;
      if (!localMemoryMap.has(key)) throw new Error(`Missing local memory mapping for ${key}`);
      const result = { kind: 'local', key };
      memoryResolveMemo.set(cacheKey, result);
      return result;
    };

    const pendingMemoryImportMap = new Map();
    for (const mod of linkResult.modules) {
      const memoryImports = moduleMemoryImports.get(mod.id) || [];
      for (let memoryIdx = 0; memoryIdx < memoryImports.length; memoryIdx++) {
        const root = resolveMemoryDescriptor(mod.id, memoryIdx);
        if (root.kind === 'local') continue;
        const key = `${root.module}:${root.name}`;
        if (!pendingMemoryImportMap.has(key)) {
          pendingMemoryImportMap.set(key, {
            kind: 0x02,
            module: root.module,
            name: root.name,
            memoryType: root.memoryType,
            key,
          });
        } else {
          const existing = pendingMemoryImportMap.get(key);
          const a = existing.memoryType || {};
          const b = root.memoryType || {};
          existing.memoryType = {
            min: Math.max(a.min || 0, b.min || 0),
            ...(a.max !== undefined || b.max !== undefined
              ? { max: Math.min(a.max ?? Infinity, b.max ?? Infinity) }
              : {}),
          };
        }
      }
    }
    const outputMemoryImports = Array.from(pendingMemoryImportMap.values());
    const memoryImportIndexMap = new Map();
    outputMemoryImports.forEach((imp, idx) => memoryImportIndexMap.set(imp.key, idx));

    const mapMemoryIndexForModule = (moduleId, oldMemoryIdx) => {
      const resolved = resolveMemoryDescriptor(moduleId, oldMemoryIdx);
      if (resolved.kind === 'external') {
        const key = `${resolved.module}:${resolved.name}`;
        const importIdx = memoryImportIndexMap.get(key);
        if (importIdx === undefined) {
          throw new Error(`No output memory import available for ${moduleId}:${oldMemoryIdx}`);
        }
        return importIdx;
      }
      const localIdx = localMemoryMap.get(resolved.key);
      return outputMemoryImports.length + localIdx;
    };

    // 4. Tables (local + multiple external imports)
    const localTableMap = new Map();
    const outputTableEntries = [];
    for (const mod of linkResult.modules) {
      const remapType = moduleTypeRemap.get(mod.id);
      for (let i = 0; i < (mod.rawTableSection || []).length; i++) {
        const oldIdx = mod.importedTableCount + i;
        localTableMap.set(`${mod.id}:${oldIdx}`, outputTableEntries.length);
        const rawTable = mod.rawTableSection[i];
        outputTableEntries.push({
          elemType: remapValueType(rawTable.elemType, oldTypeIdx => remapType.get(oldTypeIdx), `${mod.id}:table`),
          limits: rawTable.limits,
        });
      }
    }

    const tableResolveMemo = new Map();
    const tableResolveStack = new Set();
    const resolveTableDescriptor = (moduleId, oldTableIdx) => {
      const cacheKey = `${moduleId}:${oldTableIdx}`;
      if (tableResolveMemo.has(cacheKey)) return tableResolveMemo.get(cacheKey);
      const mod = moduleById.get(moduleId);
      if (!mod) throw new Error(`Unknown module id while resolving table index: ${moduleId}`);

      if (oldTableIdx < mod.importedTableCount) {
        const tableImports = moduleTableImports.get(moduleId) || [];
        const imp = tableImports[oldTableIdx];
        if (!imp) throw new Error(`Missing table import for ${moduleId}:${oldTableIdx}`);
        const remapType = moduleTypeRemap.get(moduleId);
        const rawTable = imp.rawTableType || imp.tableType;
        const remappedTableType = {
          elemType: remapValueType(rawTable.elemType, oldTypeIdx => remapType.get(oldTypeIdx), `${moduleId}:table-imp`),
          limits: rawTable.limits,
        };
        if (tableResolveStack.has(cacheKey)) {
          return { kind: 'external', module: imp.module, name: imp.name, tableType: remappedTableType };
        }
        tableResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveTableDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : { kind: 'external', module: imp.module, name: imp.name, tableType: remappedTableType };
        tableResolveStack.delete(cacheKey);
        tableResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldTableIdx}`;
      if (!localTableMap.has(key)) throw new Error(`Missing local table mapping for ${key}`);
      const result = { kind: 'local', key };
      tableResolveMemo.set(cacheKey, result);
      return result;
    };

    const pendingTableImportMap = new Map();
    for (const mod of linkResult.modules) {
      const tableImports = moduleTableImports.get(mod.id) || [];
      for (let tableIdx = 0; tableIdx < tableImports.length; tableIdx++) {
        const root = resolveTableDescriptor(mod.id, tableIdx);
        if (root.kind === 'local') continue;
        const key = `${root.module}:${root.name}`;
        if (!pendingTableImportMap.has(key)) {
          pendingTableImportMap.set(key, {
            kind: 0x01,
            module: root.module,
            name: root.name,
            tableType: root.tableType,
            key,
          });
        }
      }
    }
    const outputTableImports = Array.from(pendingTableImportMap.values());
    const tableImportIndexMap = new Map();
    outputTableImports.forEach((imp, idx) => tableImportIndexMap.set(imp.key, idx));

    const mapTableIndexForModule = (moduleId, oldTableIdx) => {
      const resolved = resolveTableDescriptor(moduleId, oldTableIdx);
      if (resolved.kind === 'external') {
        const key = `${resolved.module}:${resolved.name}`;
        const importIdx = tableImportIndexMap.get(key);
        if (importIdx === undefined) {
          throw new Error(`No output table import available for ${moduleId}:${oldTableIdx}`);
        }
        return importIdx;
      }
      const localIdx = localTableMap.get(resolved.key);
      return outputTableImports.length + localIdx;
    };

    // 5. Globals (ordered by global dependency order so cross-module global.get in constant exprs is valid)
    const globalOrderIds = this.computeLoadOrder(linkResult.modules, linkResult.resolutions, { allowCycles: true });
    const orderedModulesForGlobals = globalOrderIds.map(id => moduleById.get(id));

    const localGlobalMap = new Map();
    let localGlobalCounter = 0;
    for (const mod of orderedModulesForGlobals) {
      const importedGlobalCount = mod.importedGlobalCount;
      for (let i = 0; i < (mod.rawGlobalSection || []).length; i++) {
        const oldGlobalIdx = importedGlobalCount + i;
        localGlobalMap.set(`${mod.id}:${oldGlobalIdx}`, localGlobalCounter++);
      }
    }

    const globalResolveMemo = new Map();
    const globalResolveStack = new Set();
    const resolveGlobalDescriptor = (moduleId, oldGlobalIdx) => {
      const cacheKey = `${moduleId}:${oldGlobalIdx}`;
      if (globalResolveMemo.has(cacheKey)) return globalResolveMemo.get(cacheKey);
      const mod = moduleById.get(moduleId);
      if (!mod) throw new Error(`Unknown module id while resolving global index: ${moduleId}`);

      if (oldGlobalIdx < mod.importedGlobalCount) {
        const globalImports = moduleGlobalImports.get(moduleId) || [];
        const imp = globalImports[oldGlobalIdx];
        if (!imp) throw new Error(`Missing global import for ${moduleId}:${oldGlobalIdx}`);
        const remapType = moduleTypeRemap.get(moduleId);
        const rawG = imp.rawGlobalType || imp.globalType;
        const remappedGlobalType = {
          valType: remapValueType(rawG.valType, oldTypeIdx => remapType.get(oldTypeIdx), `${moduleId}:global-imp`),
          mutable: Boolean(rawG.mutable),
        };
        if (globalResolveStack.has(cacheKey)) {
          return { kind: 'external', module: imp.module, name: imp.name, globalType: remappedGlobalType };
        }
        globalResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveGlobalDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : { kind: 'external', module: imp.module, name: imp.name, globalType: remappedGlobalType };
        globalResolveStack.delete(cacheKey);
        globalResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldGlobalIdx}`;
      if (!localGlobalMap.has(key)) throw new Error(`Missing local global mapping for ${key}`);
      const result = { kind: 'local', key };
      globalResolveMemo.set(cacheKey, result);
      return result;
    };

    const pendingGlobalImportMap = new Map();
    for (const mod of linkResult.modules) {
      const globalImports = moduleGlobalImports.get(mod.id) || [];
      for (let globalIdx = 0; globalIdx < globalImports.length; globalIdx++) {
        const root = resolveGlobalDescriptor(mod.id, globalIdx);
        if (root.kind === 'local') continue;
        const key = `${root.module}:${root.name}`;
        if (!pendingGlobalImportMap.has(key)) {
          pendingGlobalImportMap.set(key, {
            kind: 0x03,
            module: root.module,
            name: root.name,
            globalType: root.globalType,
            key,
          });
        }
      }
    }
    const outputGlobalImports = Array.from(pendingGlobalImportMap.values());
    const globalImportIndexMap = new Map();
    outputGlobalImports.forEach((imp, idx) => globalImportIndexMap.set(imp.key, idx));

    const mapGlobalIndexForModule = (moduleId, oldGlobalIdx) => {
      const resolved = resolveGlobalDescriptor(moduleId, oldGlobalIdx);
      if (resolved.kind === 'external') {
        const key = `${resolved.module}:${resolved.name}`;
        const importIdx = globalImportIndexMap.get(key);
        if (importIdx === undefined) {
          throw new Error(`No output global import available for ${moduleId}:${oldGlobalIdx}`);
        }
        return importIdx;
      }
      const localIdx = localGlobalMap.get(resolved.key);
      return outputGlobalImports.length + localIdx;
    };

    // 6. Tags (local + multiple external imports)
    const localTagMap = new Map();
    const outputTagEntries = [];
    for (const mod of linkResult.modules) {
      const remapType = moduleTypeRemap.get(mod.id);
      for (let i = 0; i < (mod.tagSection || []).length; i++) {
        const oldTagIdx = mod.importedTagCount + i;
        localTagMap.set(`${mod.id}:${oldTagIdx}`, outputTagEntries.length);
        const tag = mod.tagSection[i];
        outputTagEntries.push({
          attribute: tag.attribute || 0,
          typeIdx: remapType.get(tag.typeIdx),
        });
      }
    }

    const tagResolveMemo = new Map();
    const tagResolveStack = new Set();
    const resolveTagDescriptor = (moduleId, oldTagIdx) => {
      const cacheKey = `${moduleId}:${oldTagIdx}`;
      if (tagResolveMemo.has(cacheKey)) return tagResolveMemo.get(cacheKey);
      const mod = moduleById.get(moduleId);
      if (!mod) throw new Error(`Unknown module id while resolving tag index: ${moduleId}`);

      if (oldTagIdx < mod.importedTagCount) {
        const tagImports = moduleTagImports.get(moduleId) || [];
        const imp = tagImports[oldTagIdx];
        if (!imp) throw new Error(`Missing tag import for ${moduleId}:${oldTagIdx}`);
        const remapType = moduleTypeRemap.get(moduleId);
        const remappedTypeIdx = remapType.get(imp.typeIdx);
        if (tagResolveStack.has(cacheKey)) {
          return { kind: 'external', module: imp.module, name: imp.name, attribute: imp.attribute || 0, typeIdx: remappedTypeIdx };
        }
        tagResolveStack.add(cacheKey);
        const resolved = resolutionByConsumerImport.get(`${moduleId}:${imp.index}`);
        const result = resolved
          ? resolveTagDescriptor(resolved.providerModuleId, resolved.providerExportIndex)
          : { kind: 'external', module: imp.module, name: imp.name, attribute: imp.attribute || 0, typeIdx: remappedTypeIdx };
        tagResolveStack.delete(cacheKey);
        tagResolveMemo.set(cacheKey, result);
        return result;
      }

      const key = `${moduleId}:${oldTagIdx}`;
      if (!localTagMap.has(key)) throw new Error(`Missing local tag mapping for ${key}`);
      const result = { kind: 'local', key };
      tagResolveMemo.set(cacheKey, result);
      return result;
    };

    const pendingTagImportMap = new Map();
    for (const mod of linkResult.modules) {
      const tagImports = moduleTagImports.get(mod.id) || [];
      for (let tagIdx = 0; tagIdx < tagImports.length; tagIdx++) {
        const root = resolveTagDescriptor(mod.id, tagIdx);
        if (root.kind === 'local') continue;
        const key = `${root.module}:${root.name}:${root.typeIdx}`;
        if (!pendingTagImportMap.has(key)) {
          pendingTagImportMap.set(key, {
            kind: 0x04,
            module: root.module,
            name: root.name,
            attribute: root.attribute || 0,
            typeIdx: root.typeIdx,
            key,
          });
        }
      }
    }
    const outputTagImports = Array.from(pendingTagImportMap.values());
    const tagImportIndexMap = new Map();
    outputTagImports.forEach((imp, idx) => tagImportIndexMap.set(imp.key, idx));

    const mapTagIndexForModule = (moduleId, oldTagIdx) => {
      const resolved = resolveTagDescriptor(moduleId, oldTagIdx);
      if (resolved.kind === 'external') {
        const key = `${resolved.module}:${resolved.name}:${resolved.typeIdx}`;
        const importIdx = tagImportIndexMap.get(key);
        if (importIdx === undefined) {
          throw new Error(`No output tag import available for ${moduleId}:${oldTagIdx}`);
        }
        return importIdx;
      }
      const localIdx = localTagMap.get(resolved.key);
      return outputTagImports.length + localIdx;
    };

    // 7. Data & Element Segment Index Remaps
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

    // 8. Function Index Resolution
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
        result = localFuncToWasmIndex(localIdx);
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
          const importIdx = funcImportIndexMap.get(key);
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

    // 9. Rewrite Data, Global, and Element Sections
    const outputDataEntries = [];
    for (const mod of linkResult.modules) {
      for (const dataEntry of mod.dataSection || []) {
        if (dataEntry.flags === 1) {
          outputDataEntries.push({
            flags: 1,
            bytes: dataEntry.bytes,
          });
        } else if (dataEntry.flags === 0 || dataEntry.flags === 2) {
          const memoryIndex = mapMemoryIndexForModule(mod.id, dataEntry.memoryIndex || 0);
          outputDataEntries.push({
            flags: memoryIndex === 0 && dataEntry.flags === 0 ? 0 : 2,
            memoryIndex,
            offsetExpr: rewriteConstExprBytes(
              dataEntry.offsetExpr,
              oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
              oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
              `${mod.id}:data-offset`,
              oldTypeIdx => moduleTypeRemap.get(mod.id).get(oldTypeIdx),
              oldDataIdx => mapDataIndexForModule(mod.id, oldDataIdx),
              oldElemIdx => mapElemIndexForModule(mod.id, oldElemIdx)
            ),
            bytes: dataEntry.bytes,
          });
        }
      }
    }

    const outputGlobalEntries = [];
    for (const mod of orderedModulesForGlobals) {
      const remapType = moduleTypeRemap.get(mod.id);
      for (let i = 0; i < (mod.rawGlobalSection || []).length; i++) {
        const globalEntry = mod.rawGlobalSection[i];
        const rewrittenInitExpr = rewriteConstExprBytes(
          globalEntry.initExpr,
          oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
          oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
          `${mod.id}:global-init:${i}`,
          oldTypeIdx => remapType.get(oldTypeIdx),
          oldDataIdx => mapDataIndexForModule(mod.id, oldDataIdx),
          oldElemIdx => mapElemIndexForModule(mod.id, oldElemIdx)
        );
        outputGlobalEntries.push({
          globalType: {
            valType: remapValueType(globalEntry.globalType.valType, oldTypeIdx => remapType.get(oldTypeIdx), `${mod.id}:global`),
            mutable: Boolean(globalEntry.globalType.mutable),
          },
          initExpr: rewrittenInitExpr,
        });
      }
    }

    const outputElementEntries = [];
    for (const mod of linkResult.modules) {
      const remapType = moduleTypeRemap.get(mod.id);
      for (const elemEntry of mod.rawElementSection || []) {
        const mappedEntry = {
          flags: elemEntry.flags,
          tableIndex: elemEntry.tableIndex,
          reftype: remapValueType(elemEntry.reftype, oldTypeIdx => remapType.get(oldTypeIdx), `${mod.id}:elem-type`),
          reftypeBytes: elemEntry.reftypeBytes,
          initExpr: elemEntry.initExpr,
          elements: [],
        };

        if (mappedEntry.reftypeBytes && (mappedEntry.reftypeBytes[0] === 0x63 || mappedEntry.reftypeBytes[0] === 0x64)) {
          const heapType = decodeSLEB128(mappedEntry.reftypeBytes, 1);
          const mappedType = remapHeapType(
            heapType.value,
            oldTypeIdx => remapType.get(oldTypeIdx),
            `${mod.id}:element-type`
          );
          mappedEntry.reftypeBytes = Buffer.concat([
            mappedEntry.reftypeBytes.subarray(0, 1),
            encodeSLEB128(mappedType),
          ]);
        }

        if ((mappedEntry.flags & 0x02) && !(mappedEntry.flags & 0x01)) {
          mappedEntry.tableIndex = mapTableIndexForModule(mod.id, mappedEntry.tableIndex || 0);
        }

        if (mappedEntry.initExpr) {
          mappedEntry.initExpr = rewriteConstExprBytes(
            mappedEntry.initExpr,
            oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
            oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
            `${mod.id}:elem-init`,
            oldTypeIdx => remapType.get(oldTypeIdx),
            oldDataIdx => mapDataIndexForModule(mod.id, oldDataIdx),
            oldElemIdx => mapElemIndexForModule(mod.id, oldElemIdx)
          );
        }

        if ((mappedEntry.flags & 0x04) !== 0) {
          mappedEntry.elements = (elemEntry.elements || []).map((expr, index) =>
            rewriteConstExprBytes(
              expr,
              oldFuncIdx => resolveFuncIndex(mod.id, oldFuncIdx),
              oldGlobalIdx => mapGlobalIndexForModule(mod.id, oldGlobalIdx),
              `${mod.id}:elem-expr:${index}`,
              oldTypeIdx => remapType.get(oldTypeIdx),
              oldDataIdx => mapDataIndexForModule(mod.id, oldDataIdx),
              oldElemIdx => mapElemIndexForModule(mod.id, oldElemIdx)
            )
          );
        } else {
          mappedEntry.elements = (elemEntry.elements || []).map(oldFuncIdx =>
            resolveFuncIndex(mod.id, oldFuncIdx)
          );
        }

        outputElementEntries.push(mappedEntry);
      }
    }

    // 10. Rewrite Code Bodies
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
        mapTagIndex: oldTagIdx => mapTagIndexForModule(fn.moduleId, oldTagIdx),
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

    // 11. Handle Start Section (single start or synthesized multi-module start trampoline in loadOrder)
    let outputStartFuncIndex = null;
    const startFuncIndices = [];
    for (const mod of orderedModulesForGlobals) {
      if (mod.startSection !== null && mod.startSection !== undefined) {
        startFuncIndices.push(resolveFuncIndex(mod.id, mod.startSection));
      }
    }
    if (startFuncIndices.length === 1) {
      outputStartFuncIndex = startFuncIndices[0];
    } else if (startFuncIndices.length > 1) {
      const voidTypeIdx = internSingleFuncType([], []);
      const callBytes = [];
      for (const fnIdx of startFuncIndices) {
        callBytes.push(Buffer.from([0x10]), encodeULEB128(fnIdx));
      }
      callBytes.push(Buffer.from([0x0b]));
      outputStartFuncIndex = localFuncToWasmIndex(rewrittenBodies.length);
      outputFunctionTypeIndices.push(voidTypeIdx);
      rewrittenBodies.push({
        locals: [],
        code: Buffer.concat(callBytes),
      });
    }

    // 12. Build Exports List (entryModule exports first; if exportAll, also non-colliding exports from other modules)
    const exportsList = [];
    const exportedNames = new Set();
    const exportModules =
      options.exportAll || this.options.exportAll
        ? [entryModule, ...linkResult.modules.filter(m => m.id !== entryModule.id)]
        : [entryModule];

    for (const mod of exportModules) {
      for (const exp of mod.exports) {
        if (exportedNames.has(exp.name)) continue;
        exportedNames.add(exp.name);

        if (exp.kind === 0x00) {
          exportsList.push({ name: exp.name, kind: 0x00, index: resolveFuncIndex(mod.id, exp.wasmIndex) });
        } else if (exp.kind === 0x01) {
          exportsList.push({ name: exp.name, kind: 0x01, index: mapTableIndexForModule(mod.id, exp.wasmIndex) });
        } else if (exp.kind === 0x02) {
          exportsList.push({ name: exp.name, kind: 0x02, index: mapMemoryIndexForModule(mod.id, exp.wasmIndex) });
        } else if (exp.kind === 0x03) {
          exportsList.push({ name: exp.name, kind: 0x03, index: mapGlobalIndexForModule(mod.id, exp.wasmIndex) });
        } else if (exp.kind === 0x04) {
          exportsList.push({ name: exp.name, kind: 0x04, index: mapTagIndexForModule(mod.id, exp.wasmIndex) });
        }
      }
    }

    const importsList = [
      ...outputFunctionImports,
      ...outputTableImports,
      ...outputMemoryImports,
      ...outputGlobalImports,
      ...outputTagImports,
    ];

    const wasm = encodeWasmModule({
      types: typePool,
      typeGroups: typeGroupsPool,
      importsList,
      functionTypeIndices: outputFunctionTypeIndices,
      tableEntries: outputTableEntries,
      memoryEntries: outputMemoryEntries,
      tagEntries: outputTagEntries,
      globalEntries: outputGlobalEntries,
      exportsList,
      startFuncIndex: outputStartFuncIndex,
      elementEntries: outputElementEntries,
      functionBodies: rewrittenBodies,
      dataEntries: outputDataEntries,
      includeDataCount: usesDataIndexOps,
    });

    return {
      wasm,
      entryModuleId,
      linkedImports: outputFunctionImports.length,
      linkedTableImports: outputTableImports.length,
      linkedMemoryImports: outputMemoryImports.length,
      linkedGlobalImports: outputGlobalImports.length,
      linkedTagImports: outputTagImports.length,
      linkedFunctions: rewrittenBodies.length,
      linkedLocalTables: outputTableEntries.length,
      linkedLocalMemories: outputMemoryEntries.length,
      linkedLocalGlobals: outputGlobalEntries.length,
      linkedLocalTags: outputTagEntries.length,
      linkedElementSegments: outputElementEntries.length,
      linkedDataSegments: outputDataEntries.length,
      linkedExports: exportsList.length,
      moduleCount: linkResult.modules.length,
    };
  }

  instantiateSync(inputs, externalImports = {}, options = {}) {
    const { WasmVM } = require('./wasm-vm.js');
    if (options.static !== false) {
      const staticRes = this.linkStatic(inputs, options);
      const { module, instance } = WasmVM.instantiateSync(staticRes.wasm, externalImports, options.vmOptions);
      return {
        entry: staticRes.entryModuleId,
        module,
        instance,
        wasm: staticRes.wasm,
      };
    }

    const linkResult = this.link(inputs);
    const entryModuleId = options.entry || linkResult.modules[0].id;
    const moduleById = new Map(linkResult.modules.map(m => [m.id, m]));
    const resolutionByConsumerImport = new Map();
    for (const r of linkResult.resolutions) {
      resolutionByConsumerImport.set(`${r.consumerModuleId}:${r.importIndex}`, r);
    }

    const instances = {};
    for (const moduleId of linkResult.loadOrder) {
      const mod = moduleById.get(moduleId);
      const moduleImports = {};
      for (const imp of mod.imports) {
        moduleImports[imp.module] = moduleImports[imp.module] || {};
        const resolution = resolutionByConsumerImport.get(`${mod.id}:${imp.index}`);
        if (resolution) {
          moduleImports[imp.module][imp.name] =
            instances[resolution.providerModuleId].exports[resolution.providerExportName];
        } else {
          const perMod = externalImports[mod.id]?.[imp.module]?.[imp.name];
          const shared = externalImports[imp.module]?.[imp.name];
          moduleImports[imp.module][imp.name] = perMod !== undefined ? perMod : shared;
        }
      }
      const { instance } = WasmVM.instantiateSync(mod.bytes, moduleImports, options.vmOptions);
      instances[moduleId] = instance;
    }

    return {
      entry: entryModuleId,
      instance: instances[entryModuleId],
      instances,
    };
  }

  async instantiate(inputs, externalImports = {}, options = {}) {
    return this.instantiateSync(inputs, externalImports, options);
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
        `  if (!((importsByModule[${JSON.stringify(moduleId)}] && importsByModule[${JSON.stringify(moduleId)}][${JSON.stringify(imp.importModule)}] && Object.prototype.hasOwnProperty.call(importsByModule[${JSON.stringify(moduleId)}][${JSON.stringify(imp.importModule)}], ${JSON.stringify(imp.importName)})) || (importsByModule[${JSON.stringify(imp.importModule)}] && Object.prototype.hasOwnProperty.call(importsByModule[${JSON.stringify(imp.importModule)}], ${JSON.stringify(imp.importName)})))) {`,
        `    throw new Error('Missing external import for ${moduleId}: ${imp.importModule}.${imp.importName}');`,
        '  }'
      );
    }
  }

  const perModuleImportWiring = [];
  for (const mod of linkResult.modules) {
    perModuleImportWiring.push(`    if (moduleId === ${JSON.stringify(mod.id)}) {`);
    perModuleImportWiring.push('      const moduleImports = {};');

    for (const imp of mod.imports) {
      const resolution = resolutionByConsumerImport.get(`${mod.id}:${imp.index}`);
      if (resolution) {
        perModuleImportWiring.push(
          `      moduleImports[${JSON.stringify(imp.module)}] = moduleImports[${JSON.stringify(imp.module)}] || {};`,
          `      moduleImports[${JSON.stringify(imp.module)}][${JSON.stringify(imp.name)}] = instances[${JSON.stringify(resolution.providerModuleId)}].exports[${JSON.stringify(resolution.providerExportName)}];`
        );
      } else {
        perModuleImportWiring.push(
          `      moduleImports[${JSON.stringify(imp.module)}] = moduleImports[${JSON.stringify(imp.module)}] || {};`,
          `      const extVal = importsByModule[${JSON.stringify(mod.id)}]?.[${JSON.stringify(imp.module)}]?.[${JSON.stringify(imp.name)}] ?? importsByModule[${JSON.stringify(imp.module)}]?.[${JSON.stringify(imp.name)}];`,
          `      moduleImports[${JSON.stringify(imp.module)}][${JSON.stringify(imp.name)}] = extVal;`
        );
      }
    }

    perModuleImportWiring.push(
      `      const bytes = fs.readFileSync(modules[${JSON.stringify(mod.id)}]);`,
      '      const instantiated = await engine.instantiate(bytes, moduleImports);',
      `      instances[${JSON.stringify(mod.id)}] = instantiated.instance || instantiated;`,
      '      continue;',
      '    }'
    );
  }

  return `'use strict';

const fs = require('fs');

function getWasmEngine() {
  if (typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function') {
    return WebAssembly;
  }
  if (typeof globalThis !== 'undefined' && globalThis.MaiaWasmVM && globalThis.MaiaWasmVM.WasmVM) {
    return globalThis.MaiaWasmVM.WasmVM;
  }
  const { WasmVM } = require(${JSON.stringify(path.join(__dirname, 'wasm-vm.js'))});
  return WasmVM;
}

async function loadLinkedModules(importsByModule = {}) {
  const engine = getWasmEngine();
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
      const staticResult = linker.linkStatic(wasmFiles, {
        entry: options.entry,
        exportAll: options.exportAll,
      });
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
      if (staticResult.linkedTagImports > 0) {
        console.log(`Tag imports kept: ${staticResult.linkedTagImports}`);
      }
      console.log(`Functions linked: ${staticResult.linkedFunctions}`);
      console.log(`Local tables linked: ${staticResult.linkedLocalTables}`);
      console.log(`Local memories linked: ${staticResult.linkedLocalMemories}`);
      console.log(`Local globals linked: ${staticResult.linkedLocalGlobals}`);
      if (staticResult.linkedLocalTags > 0) {
        console.log(`Local tags linked: ${staticResult.linkedLocalTags}`);
      }
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
