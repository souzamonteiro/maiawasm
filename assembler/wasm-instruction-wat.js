'use strict';

const { ValTypeName, HeapTypeName, heapTypeToString } = require('./wasm-binary.js');
const { quoteWatFloat } = require('./wasm-floats.js');

function valueTypeToWat(type) {
  if (type && type.kind === 'ref') return `(ref ${type.nullable ? 'null ' : ''}${heapTypeToString(type.heapType)})`;
  if (ValTypeName[type]) return ValTypeName[type];
  if (HeapTypeName[type]) return `(ref null ${HeapTypeName[type]})`;
  throw new Error(`Invalid instruction value type ${type}`);
}

function blockTypeToWat(type) {
  if (type.kind === 'empty') return '';
  if (type.kind === 'value') return ` (result ${valueTypeToWat(type.valueType)})`;
  if (type.kind === 'type') return ` (type ${type.typeIndex})`;
  throw new Error(`Invalid instruction block type ${type.kind}`);
}

function instructionToWat({ name, immediates: im }) {
  if (im.blockType) {
    let text = name + blockTypeToWat(im.blockType);
    if (im.catches) {
      for (const entry of im.catches) {
        const catchName = ['catch', 'catch_ref', 'catch_all', 'catch_all_ref'][entry.kind];
        text += ` (${catchName} ${entry.tagIndex === undefined ? '' : `${entry.tagIndex} `}${entry.labelIndex})`;
      }
    }
    return text;
  }
  if (im.memarg) {
    const mem = im.memarg;
    return `${name}${mem.memoryIndex ? ` ${mem.memoryIndex}` : ''} offset=${mem.offset} align=${2 ** mem.alignment}${im.lane === undefined ? '' : ` ${im.lane}`}`;
  }
  if (name === 'f32.const' || name === 'f64.const') {
    const width = name === 'f32.const' ? 32 : 64;
    const bytes = new Uint8Array(width / 8);
    const view = new DataView(bytes.buffer);
    if (width === 32) view.setUint32(0, im.bits, true);
    else view.setBigUint64(0, im.bits, true);
    return `${name} ${quoteWatFloat(bytes, 0, width)}`;
  }
  if (name === 'v128.const') return `${name} i8x16 ${Array.from(im.bytes).join(' ')}`;
  if (name === 'i8x16.shuffle') return `${name} ${im.lanes.join(' ')}`;
  if (name === 'select_t') return im.types.length ? `select (result ${im.types.map(valueTypeToWat).join(' ')})` : name;
  if (name === 'ref.null') return `${name} ${heapTypeToString(im.heapType)}`;
  if (['ref.test', 'ref.test_null', 'ref.cast', 'ref.cast_null'].includes(name)) {
    return `${name.replace(/_null$/, '')} ${valueTypeToWat({ kind: 'ref', nullable: im.nullable, heapType: im.heapType })}`;
  }
  if (name === 'br_on_cast' || name === 'br_on_cast_fail') {
    return `${name} ${im.labelIndex} ${valueTypeToWat(im.sourceType)} ${valueTypeToWat(im.targetType)}`;
  }
  if (name === 'call_indirect' || name === 'return_call_indirect') {
    return `${name}${im.tableIndex ? ` ${im.tableIndex}` : ''} (type ${im.typeIndex})`;
  }
  if (name === 'memory.init') return `${name}${im.memoryIndex ? ` ${im.memoryIndex}` : ''} ${im.dataIndex}`;
  if (name === 'table.init') return `${name} ${im.tableIndex} ${im.elementIndex}`;
  if (name === 'memory.copy') return `${name}${im.destinationMemory || im.sourceMemory ? ` ${im.destinationMemory} ${im.sourceMemory}` : ''}`;
  if (['memory.fill', 'memory.size', 'memory.grow'].includes(name)) return `${name}${im.memoryIndex ? ` ${im.memoryIndex}` : ''}`;
  if (name === 'br_table') return `${name} ${[...im.targets, im.defaultTarget].join(' ')}`;
  if (im.lane !== undefined) return `${name} ${im.lane}`;
  if (im.value !== undefined) return `${name} ${im.value}`;
  if (im.typeIndex !== undefined) {
    const second = im.fieldIndex ?? im.length ?? im.dataIndex ?? im.elementIndex;
    return `${name} ${im.typeIndex}${second === undefined ? '' : ` ${second}`}`;
  }
  if (name === 'array.copy') return `${name} ${im.destinationType} ${im.sourceType}`;
  if (name === 'table.copy') return `${name} ${im.destinationTable} ${im.sourceTable}`;
  for (const key of ['labelIndex', 'functionIndex', 'tagIndex', 'localIndex',
    'globalIndex', 'tableIndex', 'dataIndex', 'elementIndex']) {
    if (im[key] !== undefined) return `${name} ${im[key]}`;
  }
  if (Object.keys(im).length) throw new Error(`Unrecognized WAT immediates for ${name}`);
  return name;
}

module.exports = { instructionToWat, valueTypeToWat };
