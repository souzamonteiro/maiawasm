'use strict';

const { BinaryReader } = require('./wasm-reader.js');
const {
  OPCODE_NAME, OPCODE_FC_NAME, OPCODE_FB_NAME, OPCODE_FD_NAME,
  HeapTypeName, ValTypeName, heapTypeToString
} = require('./wasm-binary.js');
const { naturalAlignment } = require('./wasm-memory.js');
const { ControlAnalyzer } = require('./wasm-control.js');

const indexed = new Map([
  ['br', 'labelIndex'], ['br_if', 'labelIndex'], ['br_on_null', 'labelIndex'],
  ['br_on_non_null', 'labelIndex'], ['rethrow', 'labelIndex'],
  ['call', 'functionIndex'], ['return_call', 'functionIndex'], ['ref.func', 'functionIndex'],
  ['call_ref', 'typeIndex'], ['return_call_ref', 'typeIndex'],
  ['throw', 'tagIndex'], ['catch', 'tagIndex'],
  ['local.get', 'localIndex'], ['local.set', 'localIndex'], ['local.tee', 'localIndex'],
  ['global.get', 'globalIndex'], ['global.set', 'globalIndex'],
  ['table.get', 'tableIndex'], ['table.set', 'tableIndex'],
  ['memory.size', 'memoryIndex'], ['memory.grow', 'memoryIndex']
]);
const blockNames = new Set(['block', 'loop', 'if', 'try', 'try_table']);

function readHeapType(reader) {
  const value = reader.readSLEB('heap type', 33);
  heapTypeToString(value);
  return value;
}

function readBlockType(reader) {
  reader.ensure(1, 'blocktype');
  const code = reader.bytes[reader.offset];
  if (code === 0x40) {
    reader.offset++;
    return { kind: 'empty' };
  }
  if (ValTypeName[code] || HeapTypeName[code] || code === 0x63 || code === 0x64) {
    return { kind: 'value', valueType: reader.readValueType('blocktype') };
  }
  const typeIndex = reader.readSLEB('block type index', 33);
  if (typeIndex < 0) throw new Error(`Invalid block type index ${typeIndex}`);
  return { kind: 'type', typeIndex };
}

function readMemarg(reader, name) {
  const flags = reader.readULEB(`${name} flags`);
  if (flags >= 0x80) throw new Error(`Invalid memarg flags ${flags}`);
  const alignment = flags & 0x3f;
  if (alignment > naturalAlignment(name)) throw new Error(`Invalid ${name} alignment exponent ${alignment}`);
  const explicitMemory = (flags & 0x40) !== 0;
  const memoryIndex = explicitMemory ? reader.readULEB(`${name} memory index`) : 0;
  const offset = reader.readULEB(`${name} offset`, 64, { asBigInt: true });
  if (offset > 0xffffffffn) throw new Error('Unsupported memory offset: memory32 requires a u32 offset');
  return { alignment, memoryIndex, offset, explicitMemory };
}

function readVector(reader, context, minimumBytes, readEntry) {
  const count = reader.readULEB(`${context} count`);
  reader.ensure(count * minimumBytes, context);
  const entries = [];
  for (let i = 0; i < count; i++) entries.push(readEntry());
  return entries;
}

function decodeInstruction(reader) {
  const start = reader.offset;
  const opcode = reader.readByte('instruction opcode');
  let subopcode;
  let name;
  if (opcode === 0xfc || opcode === 0xfb || opcode === 0xfd) {
    subopcode = reader.readULEB('instruction subopcode');
    const table = opcode === 0xfc ? OPCODE_FC_NAME : opcode === 0xfb ? OPCODE_FB_NAME : OPCODE_FD_NAME;
    name = table[subopcode];
  } else {
    name = OPCODE_NAME[opcode];
  }
  if (name === undefined) {
    throw new Error(`Unknown opcode 0x${opcode.toString(16)}${subopcode === undefined ? '' : ` subopcode ${subopcode}`} at code offset ${reader.baseOffset + start}`);
  }
  const immediates = {};
  const index = key => { immediates[key] = reader.readULEB(`${name} ${key}`); };
  if (opcode === 0xfc) {
    if (name === 'memory.init') { index('dataIndex'); index('memoryIndex'); }
    else if (name === 'data.drop') index('dataIndex');
    else if (name === 'elem.drop') index('elementIndex');
    else if (name === 'memory.copy') { index('destinationMemory'); index('sourceMemory'); }
    else if (name === 'memory.fill') index('memoryIndex');
    else if (name === 'table.init') { index('elementIndex'); index('tableIndex'); }
    else if (name === 'table.copy') { index('destinationTable'); index('sourceTable'); }
    else if (['table.grow', 'table.size', 'table.fill'].includes(name)) index('tableIndex');
  } else if (opcode === 0xfb) {
    if (['ref.test', 'ref.test_null', 'ref.cast', 'ref.cast_null'].includes(name)) {
      immediates.heapType = readHeapType(reader);
      immediates.nullable = name.endsWith('_null');
    } else if (name === 'br_on_cast' || name === 'br_on_cast_fail') {
      const flags = reader.readByte(`${name} flags`);
      if (flags > 3) throw new Error(`Invalid ${name} flags ${flags}`);
      index('labelIndex');
      immediates.sourceType = { kind: 'ref', nullable: (flags & 1) !== 0, heapType: readHeapType(reader) };
      immediates.targetType = { kind: 'ref', nullable: (flags & 2) !== 0, heapType: readHeapType(reader) };
    } else if (name.startsWith('struct.get') || name === 'struct.set') {
      index('typeIndex'); index('fieldIndex');
    } else if (name === 'array.copy') {
      index('destinationType'); index('sourceType');
    } else if (['array.new_data', 'array.init_data', 'array.new_elem', 'array.init_elem'].includes(name)) {
      index('typeIndex'); index(name.endsWith('data') ? 'dataIndex' : 'elementIndex');
    } else if (name === 'array.new_fixed') {
      index('typeIndex'); index('length');
    } else if (['struct.new', 'struct.new_default', 'array.new', 'array.new_default',
      'array.get', 'array.get_s', 'array.get_u', 'array.set', 'array.fill'].includes(name)) {
      index('typeIndex');
    }
  } else if (opcode === 0xfd) {
    if (name === 'v128.const') {
      immediates.bytes = Uint8Array.from(reader.readBytes(16, 'v128.const bytes'));
    } else if (name === 'i8x16.shuffle') {
      immediates.lanes = Array.from(reader.readBytes(16, 'i8x16.shuffle lanes'));
      for (const lane of immediates.lanes) {
        if (lane >= 32) throw new Error(`Invalid i8x16.shuffle lane ${lane}`);
      }
    } else {
      if (name.startsWith('v128.load') || name.startsWith('v128.store')) {
        immediates.memarg = readMemarg(reader, name);
      }
      const laneShape = /^(?:[if](8|16|32|64)x\d+\.(?:extract_lane|replace_lane)|v128\.(?:load|store)(8|16|32|64)_lane)/.exec(name);
      if (laneShape) {
        const lane = reader.readByte(`${name} lane`);
        if (lane >= 128 / Number(laneShape[1] || laneShape[2])) throw new Error(`Invalid ${name} lane ${lane}`);
        immediates.lane = lane;
      }
    }
  } else if (blockNames.has(name)) {
    immediates.blockType = readBlockType(reader);
    if (name === 'try_table') {
      immediates.catches = readVector(reader, 'try_table catches', 2, () => {
        const kind = reader.readByte('try_table catch kind');
        if (kind > 3) throw new Error(`Invalid try_table catch kind ${kind}`);
        const tagIndex = kind < 2 ? reader.readULEB('catch tag index') : undefined;
        const labelIndex = reader.readULEB('catch label index');
        return tagIndex === undefined ? { kind, labelIndex } : { kind, tagIndex, labelIndex };
      });
    }
  } else if (indexed.has(name)) {
    index(indexed.get(name));
  } else if (name === 'call_indirect' || name === 'return_call_indirect') {
    index('typeIndex'); index('tableIndex');
  } else if (name === 'select_t') {
    immediates.types = readVector(reader, 'select_t type vector immediate', 1, () => reader.readValueType('select type'));
  } else if (name === 'br_table') {
    immediates.targets = readVector(reader, 'br_table targets', 1, () => reader.readULEB('branch target'));
    index('defaultTarget');
  } else if (opcode >= 0x28 && opcode <= 0x3e) {
    immediates.memarg = readMemarg(reader, name);
  } else if (name === 'i32.const') {
    immediates.value = reader.readSLEB(name, 32);
  } else if (name === 'i64.const') {
    immediates.value = reader.readSLEB(name, 64, { asBigInt: true });
  } else if (name === 'f32.const' || name === 'f64.const') {
    immediates.bits = reader.readFloatBits(name === 'f32.const' ? 32 : 64);
  } else if (name === 'ref.null') {
    immediates.heapType = readHeapType(reader);
  }
  const record = {
    opcode, name, immediates,
    offset: reader.baseOffset + start,
    endOffset: reader.baseOffset + reader.offset
  };
  if (subopcode !== undefined) record.subopcode = subopcode;
  return record;
}

function decodeInstructions(bytes, options = {}) {
  const reader = new BinaryReader(bytes, options);
  const instructions = [];
  while (reader.offset < reader.end) instructions.push(decodeInstruction(reader));
  return instructions;
}

function decodeExpression(bytes, options = {}) {
  const reader = new BinaryReader(bytes, options);
  const start = reader.offset;
  const instructions = [];
  const control = new ControlAnalyzer({ functionBody: options.functionBody === true });
  while (reader.offset < reader.end) {
    const instruction = decodeInstruction(reader);
    instructions.push(instruction);
    if (control.accept(instruction, instructions.length - 1)) {
      return {
        instructions,
        control: control.finish(),
        offset: reader.baseOffset + start,
        endOffset: reader.baseOffset + reader.offset,
        bytesRead: reader.offset - start
      };
    }
  }
  throw new Error(`Unterminated expression at offset ${reader.baseOffset + start}`);
}

module.exports = { decodeInstruction, decodeInstructions, decodeExpression };
