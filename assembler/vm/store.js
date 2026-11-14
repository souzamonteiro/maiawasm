'use strict';

const { decodeModule } = require('../wasm-module.js');
const {
  ValidationError,
  LinkError,
  Trap,
  ResourceLimitError,
  wrapDecodeError
} = require('./errors.js');
const {
  normalizeValType,
  formatValType,
  defaultValueForType,
  TypeEnvironment
} = require('./types.js');
const { WasmMemory } = require('./memory.js');
const { matchesRefType } = require('./gc.js');
const { DEFAULT_LIMITS, validateModule } = require('./validate.js');
const {
  coerceJSValueToWasm,
  exportWasmValueToJS,
  evaluateConstantExpression,
  executeFunction
} = require('./interpreter.js');

const EXPORT_KIND_NAME = {
  0x00: 'function',
  0x01: 'table',
  0x02: 'memory',
  0x03: 'global',
  0x04: 'tag'
};

const MAX_TABLE_LEN = 10000000;

class WasmTable {
  constructor(descriptor = {}, initialValue = undefined, limits = {}) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmTable descriptor must be an object');
    }
    const elemRaw = descriptor.element !== undefined ? descriptor.element : descriptor.elemType;
    const elemType = normalizeValType(elemRaw || 'funcref');
    if (elemType.kind !== 'ref') {
      throw new TypeError(`WasmTable element type must be a reference type, got ${formatValType(elemType)}`);
    }
    const minRaw = descriptor.initial !== undefined
      ? descriptor.initial
      : (descriptor.minimum !== undefined ? descriptor.minimum : descriptor.limits?.min);
    if (!Number.isInteger(minRaw) || minRaw < 0) {
      throw new RangeError(`Invalid WasmTable initial size: ${minRaw}`);
    }
    const maxRaw = descriptor.maximum !== undefined
      ? descriptor.maximum
      : (descriptor.max !== undefined ? descriptor.max : descriptor.limits?.max);
    if (maxRaw !== undefined) {
      if (!Number.isInteger(maxRaw) || maxRaw < minRaw) {
        throw new RangeError(`Invalid WasmTable maximum size: ${maxRaw}`);
      }
    }
    const maxTableLimit = limits.maxTableElements !== undefined ? limits.maxTableElements : MAX_TABLE_LEN;
    if (minRaw > maxTableLimit) {
      throw new ResourceLimitError(`Initial table size (${minRaw}) exceeds maxTableElements (${maxTableLimit})`);
    }
    this.elemType = elemType;
    this.minimum = minRaw;
    this.maximum = maxRaw;
    this.maxTableLimit = maxTableLimit;
    this.typeEnv = descriptor.typeEnv || null;

    const fillVal = initialValue !== undefined
      ? coerceJSValueToWasm(initialValue, elemType, this.typeEnv)
      : defaultValueForType(elemType);
    this._elements = new Array(minRaw).fill(fillVal);
  }

  get length() {
    return this._elements.length;
  }

  _getInternal(index) {
    const idx = index >>> 0;
    if (idx >= this._elements.length) {
      throw new Trap('out of bounds table access');
    }
    return this._elements[idx];
  }

  _setInternal(index, value) {
    const idx = index >>> 0;
    if (idx >= this._elements.length) {
      throw new Trap('out of bounds table access');
    }
    this._elements[idx] = value;
  }

  _growInternal(delta, initValue = null) {
    const d = delta >>> 0;
    const oldLen = this._elements.length;
    const newLen = oldLen + d;
    if (newLen > 0xffffffff) return -1;
    if (this.maximum !== undefined && newLen > this.maximum) return -1;
    if (this.maxTableLimit !== undefined && newLen > this.maxTableLimit) return -1;
    for (let i = 0; i < d; i++) {
      this._elements.push(initValue);
    }
    return oldLen;
  }

  _fillInternal(dst, value, length) {
    const d = BigInt(dst >>> 0);
    const n = BigInt(length >>> 0);
    if (d + n > BigInt(this._elements.length)) {
      throw new Trap('out of bounds table access');
    }
    for (let i = 0; i < Number(n); i++) {
      this._elements[Number(d) + i] = value;
    }
  }

  copyTo(dstTable, dst, src, length) {
    const d = BigInt(dst >>> 0);
    const s = BigInt(src >>> 0);
    const n = BigInt(length >>> 0);
    if (d + n > BigInt(dstTable._elements.length) || s + n > BigInt(this._elements.length)) {
      throw new Trap('out of bounds table access');
    }
    const len = Number(n);
    const dstOff = Number(d);
    const srcOff = Number(s);
    if (len === 0) return;
    if (dstTable === this && dstOff > srcOff) {
      for (let i = len - 1; i >= 0; i--) {
        dstTable._elements[dstOff + i] = this._elements[srcOff + i];
      }
    } else {
      for (let i = 0; i < len; i++) {
        dstTable._elements[dstOff + i] = this._elements[srcOff + i];
      }
    }
  }

  initFromSegment(segment, dst, src, length) {
    const d = BigInt(dst >>> 0);
    const s = BigInt(src >>> 0);
    const n = BigInt(length >>> 0);
    const segLen = segment.dropped ? 0n : BigInt(segment.elements.length);
    if (d + n > BigInt(this._elements.length) || s + n > segLen) {
      throw new Trap('out of bounds table access');
    }
    const len = Number(n);
    const dstOff = Number(d);
    const srcOff = Number(s);
    for (let i = 0; i < len; i++) {
      this._elements[dstOff + i] = segment.elements[srcOff + i];
    }
  }

  get(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._elements.length) {
      throw new RangeError(`Table index ${index} out of bounds`);
    }
    return exportWasmValueToJS(this._elements[index], this.elemType);
  }

  set(index, value = null) {
    if (!Number.isInteger(index) || index < 0 || index >= this._elements.length) {
      throw new RangeError(`Table index ${index} out of bounds`);
    }
    this._elements[index] = coerceJSValueToWasm(value, this.elemType, this.typeEnv);
  }

  grow(delta, value = null) {
    if (!Number.isInteger(delta) || delta < 0) {
      throw new RangeError(`Invalid table grow delta: ${delta}`);
    }
    const coerced = coerceJSValueToWasm(value, this.elemType, this.typeEnv);
    const res = this._growInternal(delta, coerced);
    if (res === -1) {
      throw new RangeError(`Failed to grow table by ${delta}`);
    }
    return res;
  }
}

class WasmGlobal {
  constructor(descriptor = {}, initialValue = undefined) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmGlobal descriptor must be an object');
    }
    const rawType = descriptor.value !== undefined ? descriptor.value : descriptor.valType;
    this.valType = normalizeValType(rawType);
    this.mutable = Boolean(descriptor.mutable);
    this.typeEnv = descriptor.typeEnv || null;
    if (initialValue === undefined && descriptor._internalInit !== undefined) {
      this._value = descriptor._internalInit;
    } else if (initialValue !== undefined) {
      this._value = coerceJSValueToWasm(initialValue, this.valType, this.typeEnv);
    } else {
      this._value = defaultValueForType(this.valType);
    }
  }

  _getInternal() {
    return this._value;
  }

  _setInternal(val) {
    if (!this.mutable) {
      throw new TypeError('Cannot set immutable global');
    }
    this._value = val;
  }

  get value() {
    return exportWasmValueToJS(this._value, this.valType);
  }

  set value(val) {
    if (!this.mutable) {
      throw new TypeError('Cannot mutate an immutable WasmGlobal');
    }
    this._value = coerceJSValueToWasm(val, this.valType, this.typeEnv);
  }

  valueOf() {
    return this.value;
  }
}

class WasmTag {
  constructor(descriptor = {}) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new TypeError('WasmTag descriptor must be an object');
    }
    if (descriptor._funcType) {
      this.funcType = descriptor._funcType;
      this.parameters = this.funcType.params;
    } else {
      const params = Array.isArray(descriptor.parameters)
        ? descriptor.parameters.map(normalizeValType)
        : [];
      const env = new TypeEnvironment([{ kind: 'func', params, results: [], subtype: { explicit: false, isFinal: true, supertypes: [] } }]);
      this.funcType = env.get(0);
      this.parameters = this.funcType.params;
    }
  }
}

function createExportedFunctionWrapper(funcRef) {
  if (funcRef.jsWrapper) return funcRef.jsWrapper;
  const wrapper = function (...args) {
    return executeFunction(funcRef, args);
  };
  Object.defineProperty(wrapper, 'length', {
    value: funcRef.typeDef.params.length,
    configurable: true
  });
  Object.defineProperty(wrapper, 'name', {
    value: String(funcRef.funcIndex ?? 'wasm_func'),
    configurable: true
  });
  Object.defineProperty(wrapper, '__wasmFuncRef', {
    value: funcRef,
    enumerable: false
  });
  funcRef.jsWrapper = wrapper;
  return wrapper;
}

class WasmModule {
  constructor(bytes, options = {}) {
    let u8;
    if (bytes instanceof ArrayBuffer) {
      u8 = new Uint8Array(bytes);
    } else if (ArrayBuffer.isView(bytes)) {
      u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else {
      throw new TypeError('WasmModule requires an ArrayBuffer or ArrayBufferView (Uint8Array)');
    }
    this.options = options;
    try {
      this._decoded = decodeModule(u8, { copyInput: true });
    } catch (err) {
      throw wrapDecodeError(err);
    }
    this._validated = validateModule(this._decoded, options);
  }

  static exports(moduleObject) {
    if (!(moduleObject instanceof WasmModule)) {
      throw new TypeError('WasmModule.exports requires a WasmModule');
    }
    return moduleObject._decoded.exportSection.map(exp => ({
      name: exp.name,
      kind: EXPORT_KIND_NAME[exp.kind]
    }));
  }

  static imports(moduleObject) {
    if (!(moduleObject instanceof WasmModule)) {
      throw new TypeError('WasmModule.imports requires a WasmModule');
    }
    return moduleObject._decoded.importSection.map(imp => ({
      module: imp.module,
      name: imp.name,
      kind: EXPORT_KIND_NAME[imp.kind]
    }));
  }

  static customSections(moduleObject, sectionName) {
    if (!(moduleObject instanceof WasmModule)) {
      throw new TypeError('WasmModule.customSections requires a WasmModule');
    }
    const name = String(sectionName);
    return moduleObject._decoded.customSections
      .filter(sec => sec.name === name)
      .map(sec => sec.payload.slice().buffer);
  }
}

class WasmInstance {
  constructor(moduleObject, importObject = {}, options = {}) {
    const mod = moduleObject instanceof WasmModule
      ? moduleObject
      : new WasmModule(moduleObject, options);

    this.module = mod;
    const decoded = mod._decoded;
    const validated = mod._validated;
    this.typeEnv = validated.typeEnv;
    this.limits = { ...DEFAULT_LIMITS, ...(mod.options?.limits || {}), ...(options.limits || {}) };
    this.gcCount = 0;

    this.functions = [];
    this.tables = [];
    this.memories = [];
    this.globals = [];
    this.tags = [];
    this.dataSegments = [];
    this.elementSegments = [];

    this._resolveImports(decoded, validated, importObject);
    this._allocateDefinedEntities(decoded, validated);
    this._initializeSegments(decoded, validated);
    this.exports = this._buildExports(decoded);

    if (decoded.startSection !== null) {
      const startFn = this.functions[decoded.startSection];
      executeFunction(startFn, [], { limits: this.limits, fuel: options.fuel });
    }
  }

  _resolveImports(decoded, validated, importObject) {
    if (decoded.importSection.length > 0 && (!importObject || typeof importObject !== 'object')) {
      throw new TypeError('importObject must be an object when module has imports');
    }
    for (const imp of decoded.importSection) {
      const modNamespace = importObject ? importObject[imp.module] : undefined;
      if (!modNamespace || (typeof modNamespace !== 'object' && typeof modNamespace !== 'function')) {
        throw new LinkError(`Missing import module "${imp.module}"`);
      }
      if (!(imp.name in modNamespace) || modNamespace[imp.name] === undefined) {
        throw new LinkError(`Missing import "${imp.module}.${imp.name}"`);
      }
      const extVal = modNamespace[imp.name];
      switch (imp.kind) {
        case 0x00: { // Function
          if (typeof extVal !== 'function') {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a function`);
          }
          const expectedType = this.typeEnv.get(imp.typeIdx);
          if (extVal.__wasmFuncRef) {
            const ref = extVal.__wasmFuncRef;
            if (!this.typeEnv.isHeapSubtype(ref.typeDef, expectedType)) {
              throw new LinkError(`Imported function "${imp.module}.${imp.name}" signature mismatch`);
            }
            this.functions.push(ref);
          } else {
            const funcIndex = this.functions.length;
            const funcRef = {
              __wasmKind: 'func',
              isHost: true,
              hostFn: extVal,
              instance: this,
              funcIndex,
              typeDef: expectedType,
              jsWrapper: null
            };
            createExportedFunctionWrapper(funcRef);
            this.functions.push(funcRef);
          }
          break;
        }
        case 0x01: { // Table
          if (!(extVal instanceof WasmTable)) {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a WasmTable`);
          }
          const expectedElem = normalizeValType(imp.tableType.elemType);
          // Table element types are invariant (mutable reference slots)
          if (!this.typeEnv.isValueSubtype(extVal.elemType, expectedElem) ||
              !this.typeEnv.isValueSubtype(expectedElem, extVal.elemType)) {
            throw new LinkError(`Imported table "${imp.module}.${imp.name}" element type mismatch`);
          }
          const reqMin = imp.tableType.limits.min;
          const reqMax = imp.tableType.limits.max;
          if (extVal.length < reqMin) {
            throw new LinkError(`Imported table "${imp.module}.${imp.name}" length (${extVal.length}) is smaller than minimum (${reqMin})`);
          }
          if (reqMax !== undefined && (extVal.maximum === undefined || extVal.maximum > reqMax)) {
            throw new LinkError(`Imported table "${imp.module}.${imp.name}" maximum (${extVal.maximum}) exceeds required maximum (${reqMax})`);
          }
          this.tables.push(extVal);
          break;
        }
        case 0x02: { // Memory
          if (!(extVal instanceof WasmMemory)) {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a WasmMemory`);
          }
          const reqMin = imp.memoryType.min;
          const reqMax = imp.memoryType.max;
          if (extVal.pages < reqMin) {
            throw new LinkError(`Imported memory "${imp.module}.${imp.name}" pages (${extVal.pages}) is smaller than minimum (${reqMin})`);
          }
          if (reqMax !== undefined && (extVal.maximum === undefined || extVal.maximum > reqMax)) {
            throw new LinkError(`Imported memory "${imp.module}.${imp.name}" maximum (${extVal.maximum}) exceeds required maximum (${reqMax})`);
          }
          this.memories.push(extVal);
          break;
        }
        case 0x03: { // Global
          const expectedType = normalizeValType(imp.globalType.valType);
          const expectedMut = Boolean(imp.globalType.mutable);
          if (extVal instanceof WasmGlobal) {
            if (extVal.mutable !== expectedMut) {
              throw new LinkError(`Imported global "${imp.module}.${imp.name}" mutability mismatch`);
            }
            if (expectedMut) {
              if (!this.typeEnv.isValueSubtype(extVal.valType, expectedType) ||
                  !this.typeEnv.isValueSubtype(expectedType, extVal.valType)) {
                throw new LinkError(`Imported mutable global "${imp.module}.${imp.name}" type mismatch`);
              }
            } else if (!this.typeEnv.isValueSubtype(extVal.valType, expectedType)) {
              throw new LinkError(`Imported global "${imp.module}.${imp.name}" type mismatch`);
            }
            this.globals.push(extVal);
          } else {
            if (expectedMut) {
              throw new LinkError(`Imported mutable global "${imp.module}.${imp.name}" must be a WasmGlobal instance`);
            }
            try {
              const coerced = coerceJSValueToWasm(extVal, expectedType, this.typeEnv);
              this.globals.push(new WasmGlobal({
                valType: expectedType,
                mutable: false,
                typeEnv: this.typeEnv,
                _internalInit: coerced
              }));
            } catch (err) {
              throw new LinkError(`Invalid value for imported global "${imp.module}.${imp.name}": ${err.message}`);
            }
          }
          break;
        }
        case 0x04: { // Tag
          if (!(extVal instanceof WasmTag)) {
            throw new LinkError(`Import "${imp.module}.${imp.name}" is not a WasmTag`);
          }
          const expectedType = this.typeEnv.get(imp.typeIdx);
          if (extVal.funcType.canonicalId !== expectedType.canonicalId) {
            throw new LinkError(`Imported tag "${imp.module}.${imp.name}" signature mismatch`);
          }
          this.tags.push(extVal);
          break;
        }
      }
    }
  }

  _allocateDefinedEntities(decoded, validated) {
    const importedFnCount = validated.importedCounts.functions;
    for (let i = importedFnCount; i < validated.functions.length; i++) {
      const fnMeta = validated.functions[i];
      const funcRef = {
        __wasmKind: 'func',
        isHost: false,
        instance: this,
        funcIndex: i,
        typeDef: fnMeta.funcType,
        body: fnMeta.body,
        localTypes: fnMeta.localTypes,
        jumpTable: fnMeta.jumpTable,
        jsWrapper: null
      };
      createExportedFunctionWrapper(funcRef);
      this.functions.push(funcRef);
    }

    for (const tbl of decoded.tableSection) {
      this.tables.push(new WasmTable({
        elemType: tbl.elemType,
        initial: tbl.limits.min,
        maximum: tbl.limits.max,
        typeEnv: this.typeEnv
      }, undefined, this.limits));
    }

    for (const mem of decoded.memorySection) {
      this.memories.push(new WasmMemory({
        initial: mem.min,
        maximum: mem.max
      }, this.limits));
    }

    for (const tag of decoded.tagSection) {
      this.tags.push(new WasmTag({
        _funcType: this.typeEnv.get(tag.typeIdx)
      }));
    }

    for (const g of decoded.globalSection) {
      const initVal = evaluateConstantExpression(g.initializer, this, this.limits);
      this.globals.push(new WasmGlobal({
        valType: g.globalType.valType,
        mutable: g.globalType.mutable,
        typeEnv: this.typeEnv,
        _internalInit: initVal
      }));
    }
  }

  _initializeSegments(decoded, validated) {
    // 1. Evaluate all element segments first
    for (let i = 0; i < validated.elementSegments.length; i++) {
      const seg = validated.elementSegments[i];
      const elements = seg.useExpressions
        ? seg.elementExpressions.map(expr => evaluateConstantExpression(expr, this, this.limits))
        : seg.elements.map(fnIdx => this.functions[fnIdx]);
      this.elementSegments.push({
        mode: seg.mode,
        tableIndex: seg.tableIndex,
        offsetExpression: seg.offsetExpression,
        elements,
        dropped: seg.mode === 'declarative'
      });
    }

    // 2. Prepare data segments
    for (let i = 0; i < validated.dataSegments.length; i++) {
      const seg = validated.dataSegments[i];
      this.dataSegments.push({
        mode: seg.mode,
        memoryIndex: seg.memoryIndex,
        offsetExpression: seg.offsetExpression,
        bytes: Uint8Array.from(seg.bytes),
        dropped: false
      });
    }

    // 3. Apply active element segments
    for (const seg of this.elementSegments) {
      if (seg.mode === 'active') {
        const offset = evaluateConstantExpression(seg.offsetExpression, this, this.limits) >>> 0;
        const table = this.tables[seg.tableIndex];
        table.initFromSegment(seg, offset, 0, seg.elements.length);
        seg.dropped = true;
        seg.elements = [];
      }
    }

    // 4. Apply active data segments
    for (const seg of this.dataSegments) {
      if (seg.mode === 'active') {
        const offset = evaluateConstantExpression(seg.offsetExpression, this, this.limits) >>> 0;
        const memory = this.memories[seg.memoryIndex];
        memory.initFromSegment(seg, offset, 0, seg.bytes.byteLength);
        seg.dropped = true;
        seg.bytes = new Uint8Array(0);
      }
    }
  }

  _buildExports(decoded) {
    const exportsObj = Object.create(null);
    for (const exp of decoded.exportSection) {
      switch (exp.kind) {
        case 0x00:
          exportsObj[exp.name] = createExportedFunctionWrapper(this.functions[exp.index]);
          break;
        case 0x01:
          exportsObj[exp.name] = this.tables[exp.index];
          break;
        case 0x02:
          exportsObj[exp.name] = this.memories[exp.index];
          break;
        case 0x03:
          exportsObj[exp.name] = this.globals[exp.index];
          break;
        case 0x04:
          exportsObj[exp.name] = this.tags[exp.index];
          break;
      }
    }
    return Object.freeze(exportsObj);
  }
}

module.exports = {
  WasmTable,
  WasmGlobal,
  WasmTag,
  WasmModule,
  WasmInstance,
  createExportedFunctionWrapper
};
