'use strict';

const { Trap, ResourceLimitError } = require('./errors.js');
const { defaultValueForType, normalizeHeapType } = require('./types.js');
const { f32FromBits, f64FromBits } = require('./numeric.js');

class WasmI31 {
  constructor(value) {
    this.value = value & 0x7fffffff;
  }
  getSigned() {
    return (this.value << 1) >> 1;
  }
  getUnsigned() {
    return this.value;
  }
}

class WasmStruct {
  constructor(typeDef, fields) {
    this.typeDef = typeDef;
    this.fields = fields;
  }
}

class WasmArray {
  constructor(typeDef, elements) {
    this.typeDef = typeDef;
    this.elements = elements;
  }
}

class WasmHostAny {
  constructor(value) {
    this.value = value;
  }
}

function packStorageValue(storage, value) {
  if (storage.kind === 'packed') {
    if (storage.name === 'i8') return value & 0xff;
    if (storage.name === 'i16') return value & 0xffff;
  }
  if (storage.kind === 'num') {
    if (storage.name === 'i32') return value | 0;
    if (storage.name === 'i64') return BigInt.asIntN(64, value);
  }
  if (storage.kind === 'vec') {
    return Uint8Array.from(value);
  }
  return value;
}

function unpackStorageValue(storage, raw, mode = 'normal') {
  if (storage.kind === 'packed') {
    if (storage.name === 'i8') {
      return mode === 's' ? ((raw << 24) >> 24) : (raw & 0xff);
    }
    if (storage.name === 'i16') {
      return mode === 's' ? ((raw << 16) >> 16) : (raw & 0xffff);
    }
  }
  if (storage.kind === 'vec') {
    return Uint8Array.from(raw);
  }
  return raw;
}

function storageByteSize(storage) {
  if (storage.kind === 'packed') {
    return storage.name === 'i8' ? 1 : 2;
  }
  if (storage.kind === 'num') {
    return (storage.name === 'i64' || storage.name === 'f64') ? 8 : 4;
  }
  if (storage.kind === 'vec') {
    return 16;
  }
  throw new Trap(`Storage type ${storage.name || storage.kind} cannot be initialized from data bytes`);
}

function readStorageFromBytes(storage, view, byteOffset) {
  if (storage.kind === 'packed') {
    return storage.name === 'i8' ? view.getUint8(byteOffset) : view.getUint16(byteOffset, true);
  }
  if (storage.kind === 'num') {
    switch (storage.name) {
      case 'i32': return view.getInt32(byteOffset, true);
      case 'i64': return view.getBigInt64(byteOffset, true);
      case 'f32': return f32FromBits(view.getUint32(byteOffset, true));
      case 'f64': return f64FromBits(view.getBigUint64(byteOffset, true));
    }
  }
  if (storage.kind === 'vec') {
    return new Uint8Array(view.buffer, view.byteOffset + byteOffset, 16).slice();
  }
  throw new Trap(`Unsupported data storage type ${storage.kind}`);
}

function matchesRefType(val, targetType, typeEnv) {
  if (val === null) {
    return Boolean(targetType.nullable);
  }
  const ht = typeof targetType.heapType === 'object' && targetType.heapType !== null
    ? targetType.heapType
    : normalizeHeapType(targetType.heapType);
  const targetDef = typeof ht === 'number' ? typeEnv.get(ht) : (typeof ht === 'object' ? ht : null);

  if (ht === 'none' || ht === 'nofunc' || ht === 'noextern' || ht === 'noexn') {
    return false;
  }

  if (val instanceof WasmI31) {
    return ht === 'i31' || ht === 'eq' || ht === 'any';
  }
  if (val instanceof WasmStruct) {
    if (ht === 'struct' || ht === 'eq' || ht === 'any') return true;
    if (targetDef && targetDef.kind === 'struct') {
      return typeEnv.isHeapSubtype(val.typeDef, targetDef);
    }
    return false;
  }
  if (val instanceof WasmArray) {
    if (ht === 'array' || ht === 'eq' || ht === 'any') return true;
    if (targetDef && targetDef.kind === 'array') {
      return typeEnv.isHeapSubtype(val.typeDef, targetDef);
    }
    return false;
  }
  if (val instanceof WasmHostAny) {
    return ht === 'any';
  }
  if (val && typeof val === 'object' && val.__wasmKind === 'func') {
    if (ht === 'func') return true;
    if (targetDef && targetDef.kind === 'func') {
      return typeEnv.isHeapSubtype(val.typeDef, targetDef);
    }
    return false;
  }
  if (val && typeof val === 'object' && val.__wasmKind === 'exn') {
    return ht === 'exn';
  }
  // External JS values
  if (ht === 'extern') return true;
  return false;
}

function execGC(name, immediates, stack, instance, limits = {}) {
  const typeEnv = instance.typeEnv;
  const chargeGC = (count = 1) => {
    if (limits.maxArrayLength !== undefined && count > limits.maxArrayLength) {
      throw new ResourceLimitError(`GC array length (${count}) exceeds maxArrayLength (${limits.maxArrayLength})`);
    }
    if (instance.gcCount !== undefined && limits.maxGCObjects !== undefined) {
      if (instance.gcCount + 1 > limits.maxGCObjects) {
        throw new ResourceLimitError(`GC allocation count exceeds maxGCObjects (${limits.maxGCObjects})`);
      }
      instance.gcCount++;
    }
  };

  switch (name) {
    case 'ref.i31': {
      const v = stack.pop() | 0;
      stack.push(new WasmI31(v));
      return true;
    }
    case 'i31.get_s': {
      const ref = stack.pop();
      if (ref === null) throw new Trap('null i31 reference');
      stack.push(ref.getSigned());
      return true;
    }
    case 'i31.get_u': {
      const ref = stack.pop();
      if (ref === null) throw new Trap('null i31 reference');
      stack.push(ref.getUnsigned());
      return true;
    }
    case 'struct.new': {
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(typeDef.fields.length);
      const count = typeDef.fields.length;
      const fields = new Array(count);
      for (let i = count - 1; i >= 0; i--) {
        fields[i] = packStorageValue(typeDef.fields[i].storage, stack.pop());
      }
      stack.push(new WasmStruct(typeDef, fields));
      return true;
    }
    case 'struct.new_default': {
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(typeDef.fields.length);
      const fields = typeDef.fields.map(f => packStorageValue(f.storage, defaultValueForType(f.storage)));
      stack.push(new WasmStruct(typeDef, fields));
      return true;
    }
    case 'struct.get':
    case 'struct.get_s':
    case 'struct.get_u': {
      const ref = stack.pop();
      if (ref === null) throw new Trap('null structure reference');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const fieldDef = typeDef.fields[immediates.fieldIndex];
      const mode = name.endsWith('_s') ? 's' : name.endsWith('_u') ? 'u' : 'normal';
      stack.push(unpackStorageValue(fieldDef.storage, ref.fields[immediates.fieldIndex], mode));
      return true;
    }
    case 'struct.set': {
      const val = stack.pop();
      const ref = stack.pop();
      if (ref === null) throw new Trap('null structure reference');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const fieldDef = typeDef.fields[immediates.fieldIndex];
      ref.fields[immediates.fieldIndex] = packStorageValue(fieldDef.storage, val);
      return true;
    }
    case 'array.new': {
      const len = stack.pop() >>> 0;
      const initVal = stack.pop();
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const packed = packStorageValue(typeDef.field.storage, initVal);
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = typeDef.field.storage.kind === 'vec' ? Uint8Array.from(packed) : packed;
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_default': {
      const len = stack.pop() >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const defVal = packStorageValue(typeDef.field.storage, defaultValueForType(typeDef.field.storage));
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = typeDef.field.storage.kind === 'vec' ? Uint8Array.from(defVal) : defVal;
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_fixed': {
      const len = immediates.length >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const elements = new Array(len);
      for (let i = len - 1; i >= 0; i--) {
        elements[i] = packStorageValue(typeDef.field.storage, stack.pop());
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_data': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const seg = instance.dataSegments[immediates.dataIndex];
      const elemSize = storageByteSize(typeDef.field.storage);
      const totalBytes = BigInt(len) * BigInt(elemSize);
      const segLen = seg.dropped ? 0n : BigInt(seg.bytes.byteLength);
      if (BigInt(srcOffset) + totalBytes > segLen) {
        throw new Trap('out of bounds memory access');
      }
      const view = new DataView(seg.bytes.buffer, seg.bytes.byteOffset, seg.bytes.byteLength);
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = readStorageFromBytes(typeDef.field.storage, view, srcOffset + i * elemSize);
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.new_elem': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const typeDef = typeEnv.get(immediates.typeIndex);
      chargeGC(len);
      const seg = instance.elementSegments[immediates.elementIndex];
      const segLen = seg.dropped ? 0n : BigInt(seg.elements.length);
      if (BigInt(srcOffset) + BigInt(len) > segLen) {
        throw new Trap('out of bounds table access');
      }
      const elements = new Array(len);
      for (let i = 0; i < len; i++) {
        elements[i] = seg.elements[srcOffset + i];
      }
      stack.push(new WasmArray(typeDef, elements));
      return true;
    }
    case 'array.get':
    case 'array.get_s':
    case 'array.get_u': {
      const idx = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      if (idx >= arr.elements.length) throw new Trap('out of bounds array access');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const mode = name.endsWith('_s') ? 's' : name.endsWith('_u') ? 'u' : 'normal';
      stack.push(unpackStorageValue(typeDef.field.storage, arr.elements[idx], mode));
      return true;
    }
    case 'array.set': {
      const val = stack.pop();
      const idx = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      if (idx >= arr.elements.length) throw new Trap('out of bounds array access');
      const typeDef = typeEnv.get(immediates.typeIndex);
      arr.elements[idx] = packStorageValue(typeDef.field.storage, val);
      return true;
    }
    case 'array.len': {
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      stack.push(arr.elements.length | 0);
      return true;
    }
    case 'array.fill': {
      const len = stack.pop() >>> 0;
      const val = stack.pop();
      const offset = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      if (BigInt(offset) + BigInt(len) > BigInt(arr.elements.length)) {
        throw new Trap('out of bounds array access');
      }
      const typeDef = typeEnv.get(immediates.typeIndex);
      const packed = packStorageValue(typeDef.field.storage, val);
      for (let i = 0; i < len; i++) {
        arr.elements[offset + i] = typeDef.field.storage.kind === 'vec' ? Uint8Array.from(packed) : packed;
      }
      return true;
    }
    case 'array.copy': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const srcArr = stack.pop();
      const dstOffset = stack.pop() >>> 0;
      const dstArr = stack.pop();
      if (dstArr === null || srcArr === null) throw new Trap('null array reference');
      if (BigInt(dstOffset) + BigInt(len) > BigInt(dstArr.elements.length) ||
          BigInt(srcOffset) + BigInt(len) > BigInt(srcArr.elements.length)) {
        throw new Trap('out of bounds array access');
      }
      if (len === 0) return true;
      if (dstArr === srcArr && dstOffset > srcOffset) {
        for (let i = len - 1; i >= 0; i--) {
          dstArr.elements[dstOffset + i] = srcArr.elements[srcOffset + i];
        }
      } else {
        for (let i = 0; i < len; i++) {
          dstArr.elements[dstOffset + i] = srcArr.elements[srcOffset + i];
        }
      }
      return true;
    }
    case 'array.init_data': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const dstOffset = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      const typeDef = typeEnv.get(immediates.typeIndex);
      const seg = instance.dataSegments[immediates.dataIndex];
      const elemSize = storageByteSize(typeDef.field.storage);
      const totalBytes = BigInt(len) * BigInt(elemSize);
      const segLen = seg.dropped ? 0n : BigInt(seg.bytes.byteLength);
      if (BigInt(dstOffset) + BigInt(len) > BigInt(arr.elements.length) ||
          BigInt(srcOffset) + totalBytes > segLen) {
        throw new Trap('out of bounds array or data access');
      }
      if (len === 0) return true;
      const view = new DataView(seg.bytes.buffer, seg.bytes.byteOffset, seg.bytes.byteLength);
      for (let i = 0; i < len; i++) {
        arr.elements[dstOffset + i] = readStorageFromBytes(typeDef.field.storage, view, srcOffset + i * elemSize);
      }
      return true;
    }
    case 'array.init_elem': {
      const len = stack.pop() >>> 0;
      const srcOffset = stack.pop() >>> 0;
      const dstOffset = stack.pop() >>> 0;
      const arr = stack.pop();
      if (arr === null) throw new Trap('null array reference');
      const seg = instance.elementSegments[immediates.elementIndex];
      const segLen = seg.dropped ? 0n : BigInt(seg.elements.length);
      if (BigInt(dstOffset) + BigInt(len) > BigInt(arr.elements.length) ||
          BigInt(srcOffset) + BigInt(len) > segLen) {
        throw new Trap('out of bounds array or element access');
      }
      for (let i = 0; i < len; i++) {
        arr.elements[dstOffset + i] = seg.elements[srcOffset + i];
      }
      return true;
    }
    case 'ref.test':
    case 'ref.test_null': {
      const val = stack.pop();
      const target = { kind: 'ref', nullable: Boolean(immediates.nullable), heapType: immediates.heapType };
      stack.push(matchesRefType(val, target, typeEnv) ? 1 : 0);
      return true;
    }
    case 'ref.cast':
    case 'ref.cast_null': {
      const val = stack.pop();
      const target = { kind: 'ref', nullable: Boolean(immediates.nullable), heapType: immediates.heapType };
      if (!matchesRefType(val, target, typeEnv)) {
        throw new Trap('cast failure');
      }
      stack.push(val);
      return true;
    }
    case 'any.convert_extern': {
      const val = stack.pop();
      if (val === null) {
        stack.push(null);
      } else if (val instanceof WasmI31 || val instanceof WasmStruct || val instanceof WasmArray || val instanceof WasmHostAny) {
        stack.push(val);
      } else {
        stack.push(new WasmHostAny(val));
      }
      return true;
    }
    case 'extern.convert_any': {
      const val = stack.pop();
      if (val === null) {
        stack.push(null);
      } else if (val instanceof WasmHostAny) {
        stack.push(val.value);
      } else {
        stack.push(val);
      }
      return true;
    }
    default:
      return false;
  }
}

module.exports = {
  WasmI31,
  WasmStruct,
  WasmArray,
  WasmHostAny,
  packStorageValue,
  unpackStorageValue,
  matchesRefType,
  execGC
};
