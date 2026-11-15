'use strict';

const {
  WasmError,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  Trap,
  GuestException,
  ResourceLimitError,
  HostError
} = require('./vm/errors.js');
const { WasmMemory } = require('./vm/memory.js');
const { WasmI31, WasmStruct, WasmArray } = require('./vm/gc.js');
const { DEFAULT_LIMITS } = require('./vm/validate.js');
const {
  WasmTable,
  WasmGlobal,
  WasmTag,
  WasmModule,
  WasmInstance
} = require('./vm/store.js');

const CAPABILITIES = Object.freeze({
  mvp: true,
  multiValue: true,
  signExtension: true,
  nonTrappingFloatToInt: true,
  bulkMemory: true,
  referenceTypes: true,
  multiMemory: true,
  tailCall: true,
  fixedWidthSIMD: true,
  typedFunctionReferences: true,
  gc: true,
  exceptionHandling: true,
  legacyExceptions: true,
  extendedConstantExpressions: true,
  threadsAndAtomics: false,
  memory64: false,
  relaxedSIMD: false,
  componentModel: false
});

function isBufferSource(input) {
  return input instanceof ArrayBuffer || ArrayBuffer.isView(input);
}

function validate(bytes, options = {}) {
  if (!isBufferSource(bytes)) {
    throw new TypeError('validate requires an ArrayBuffer or ArrayBufferView');
  }
  try {
    new WasmModule(bytes, options);
    return true;
  } catch (err) {
    if (err instanceof DecodeError || err instanceof ValidationError || err instanceof UnsupportedFeatureError) {
      return false;
    }
    throw err;
  }
}

function validateDetailed(bytes, options = {}) {
  if (!isBufferSource(bytes)) {
    throw new TypeError('validateDetailed requires an ArrayBuffer or ArrayBufferView');
  }
  try {
    const module = new WasmModule(bytes, options);
    return { valid: true, module };
  } catch (error) {
    return { valid: false, error };
  }
}

function compileSync(bytes, options = {}) {
  return new WasmModule(bytes, options);
}

function compile(bytes, options = {}) {
  return Promise.resolve().then(() => compileSync(bytes, options));
}

function instantiateSync(source, importObject = {}, options = {}) {
  if (source instanceof WasmModule) {
    return new WasmInstance(source, importObject, options);
  }
  const module = new WasmModule(source, options);
  const instance = new WasmInstance(module, importObject, options);
  return { module, instance };
}

function instantiate(source, importObject = {}, options = {}) {
  return Promise.resolve().then(() => instantiateSync(source, importObject, options));
}

class WasmVM {
  constructor(options = {}) {
    this.options = {
      legacyExceptions: true,
      ...options,
      limits: { ...DEFAULT_LIMITS, ...(options.limits || {}) }
    };
  }

  capabilities() {
    return {
      ...CAPABILITIES,
      legacyExceptions: this.options.legacyExceptions !== false
    };
  }

  validate(bytes, overrides = {}) {
    return validate(bytes, { ...this.options, ...overrides });
  }

  validateDetailed(bytes, overrides = {}) {
    return validateDetailed(bytes, { ...this.options, ...overrides });
  }

  compileSync(bytes, overrides = {}) {
    return compileSync(bytes, { ...this.options, ...overrides });
  }

  compile(bytes, overrides = {}) {
    return compile(bytes, { ...this.options, ...overrides });
  }

  instantiateSync(source, importObject = {}, overrides = {}) {
    return instantiateSync(source, importObject, { ...this.options, ...overrides });
  }

  instantiate(source, importObject = {}, overrides = {}) {
    return instantiate(source, importObject, { ...this.options, ...overrides });
  }

  static capabilities() {
    return { ...CAPABILITIES };
  }

  static validate(bytes, options) {
    return validate(bytes, options);
  }

  static validateDetailed(bytes, options) {
    return validateDetailed(bytes, options);
  }

  static compileSync(bytes, options) {
    return compileSync(bytes, options);
  }

  static compile(bytes, options) {
    return compile(bytes, options);
  }

  static instantiateSync(source, importObject, options) {
    return instantiateSync(source, importObject, options);
  }

  static instantiate(source, importObject, options) {
    return instantiate(source, importObject, options);
  }

  static createWebAssemblyPolyfill(options = {}) {
    const vm = new WasmVM(options);
    return {
      Module: WasmModule,
      Instance: WasmInstance,
      Memory: WasmMemory,
      Table: WasmTable,
      Global: WasmGlobal,
      Tag: WasmTag,
      CompileError: ValidationError,
      LinkError,
      RuntimeError: Trap,
      Exception: GuestException,
      validate: bytes => vm.validate(bytes),
      compile: bytes => vm.compile(bytes),
      instantiate: (src, imports) => vm.instantiate(src, imports)
    };
  }
}

WasmVM.Module = WasmModule;
WasmVM.Instance = WasmInstance;
WasmVM.Memory = WasmMemory;
WasmVM.Table = WasmTable;
WasmVM.Global = WasmGlobal;
WasmVM.Tag = WasmTag;

const exportedApi = {
  WasmVM,
  WasmModule,
  WasmInstance,
  WasmMemory,
  WasmTable,
  WasmGlobal,
  WasmTag,
  WasmI31,
  WasmStruct,
  WasmArray,
  WasmError,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  Trap,
  GuestException,
  ResourceLimitError,
  HostError,
  CAPABILITIES,
  DEFAULT_LIMITS,
  validate,
  validateDetailed,
  compile,
  compileSync,
  instantiate,
  instantiateSync,
  // Standard WebAssembly-compatible aliases
  Module: WasmModule,
  Instance: WasmInstance,
  Memory: WasmMemory,
  Table: WasmTable,
  Global: WasmGlobal,
  Tag: WasmTag,
  CompileError: ValidationError,
  RuntimeError: Trap
};

if (typeof globalThis !== 'undefined') {
  globalThis.MaiaWasmVM = exportedApi;
}

module.exports = exportedApi;
