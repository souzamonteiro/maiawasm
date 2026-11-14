'use strict';

class WasmError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = this.constructor.name;
    this.code = details.code || 'WASM_ERROR';
    if (details.offset !== undefined) this.offset = details.offset;
    if (details.section !== undefined) this.section = details.section;
    if (details.functionIndex !== undefined) this.functionIndex = details.functionIndex;
    if (details.instruction !== undefined) this.instruction = details.instruction;
    if (details.opcode !== undefined) this.opcode = details.opcode;
    if (details.stackTrace !== undefined) this.stackTrace = details.stackTrace;
  }
}

class DecodeError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'DECODE_ERROR', ...details });
  }
}

class UnsupportedFeatureError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'UNSUPPORTED_FEATURE', ...details });
  }
}

class ValidationError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'VALIDATION_ERROR', ...details });
  }
}

class LinkError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'LINK_ERROR', ...details });
  }
}

class Trap extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'TRAP', ...details });
  }
}

class GuestException extends WasmError {
  constructor(tag, values = [], details = {}) {
    super(details.message || 'Uncaught WebAssembly exception', { code: 'GUEST_EXCEPTION', ...details });
    this.tag = tag;
    this.values = Array.isArray(values) ? values : [values];
  }
}

class ResourceLimitError extends WasmError {
  constructor(message, details = {}) {
    super(message, { code: 'RESOURCE_LIMIT_ERROR', ...details });
  }
}

class HostError extends WasmError {
  constructor(cause, details = {}) {
    const msg = cause && cause.message ? cause.message : String(cause);
    super(msg, { code: 'HOST_ERROR', cause, ...details });
    this.originalError = cause;
  }
}

function wrapDecodeError(error) {
  if (error instanceof WasmError) return error;
  const message = error && error.message ? error.message : String(error);
  const offsetMatch = /offset\s+(\d+)/i.exec(message);
  const offset = offsetMatch ? Number(offsetMatch[1]) : undefined;
  if (/^Unsupported\b/i.test(message)) {
    return new UnsupportedFeatureError(message, { offset, cause: error });
  }
  return new DecodeError(message, { offset, cause: error });
}

module.exports = {
  WasmError,
  DecodeError,
  UnsupportedFeatureError,
  ValidationError,
  LinkError,
  Trap,
  GuestException,
  ResourceLimitError,
  HostError,
  wrapDecodeError
};
