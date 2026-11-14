'use strict';

const {
  Trap,
  GuestException,
  ResourceLimitError,
  HostError,
  WasmError
} = require('./errors.js');
const { defaultValueForType, normalizeValType } = require('./types.js');
const {
  f32FromBits,
  f64FromBits,
  unboxFloat,
  canonF32,
  canonF64,
  execScalarNumeric
} = require('./numeric.js');
const { execScalarMemory } = require('./memory.js');
const { execSIMD } = require('./simd.js');
const {
  WasmI31,
  WasmStruct,
  WasmArray,
  WasmHostAny,
  matchesRefType,
  execGC
} = require('./gc.js');

function coerceJSValueToWasm(val, valType, typeEnv) {
  const vt = normalizeValType(valType);
  if (vt.kind === 'num') {
    switch (vt.name) {
      case 'i32': {
        if (typeof val === 'bigint') throw new TypeError('Cannot convert BigInt to i32');
        return Number(val) | 0;
      }
      case 'i64': {
        if (typeof val === 'bigint') return BigInt.asIntN(64, val);
        if (typeof val === 'number' && Number.isInteger(val)) return BigInt.asIntN(64, BigInt(val));
        throw new TypeError(`Expected BigInt for i64, got ${typeof val}`);
      }
      case 'f32': {
        if (typeof val === 'bigint') throw new TypeError('Cannot convert BigInt to f32');
        return canonF32(Number(val));
      }
      case 'f64': {
        if (typeof val === 'bigint') throw new TypeError('Cannot convert BigInt to f64');
        return canonF64(Number(val));
      }
    }
  }
  if (vt.kind === 'vec') {
    if (val instanceof Uint8Array && val.byteLength === 16) return Uint8Array.from(val);
    throw new TypeError('Expected 16-byte Uint8Array for v128');
  }
  if (vt.kind === 'ref') {
    if (val === null) {
      if (!vt.nullable) throw new TypeError('Null reference not allowed for non-nullable reference type');
      return null;
    }
    if (typeof val === 'function' && val.__wasmFuncRef) {
      val = val.__wasmFuncRef;
    }
    if (vt.heapType === 'extern') return val;
    if (typeEnv && !matchesRefType(val, vt, typeEnv)) {
      throw new TypeError('Incompatible reference value for target reference type');
    }
    return val;
  }
  return val;
}

function exportWasmValueToJS(val, valType) {
  const vt = valType ? normalizeValType(valType) : null;
  if (vt && vt.kind === 'num') {
    if (vt.name === 'i32') return val | 0;
    if (vt.name === 'i64') return BigInt.asIntN(64, val);
    if (vt.name === 'f32' || vt.name === 'f64') return unboxFloat(val);
  }
  if (val && typeof val === 'object') {
    if (val.__wasmKind === 'func' && val.jsWrapper) return val.jsWrapper;
    if (val instanceof WasmHostAny) return val;
  }
  return unboxFloatIfBoxed(val);
}

function unboxFloatIfBoxed(val) {
  if (val && typeof val === 'object' && (val.constructor.name === 'F32Box' || val.constructor.name === 'F64Box')) {
    return NaN;
  }
  return val;
}

function isEqRefEqual(a, b) {
  if (a === null || b === null) return a === b;
  if (a instanceof WasmI31 && b instanceof WasmI31) {
    return a.value === b.value;
  }
  return a === b;
}

function createExnRef(tag, values) {
  return {
    __wasmKind: 'exn',
    tag,
    values: Array.from(values)
  };
}

function evaluateConstantExpression(expr, instance, limits = {}) {
  const stack = [];
  const instructions = expr.instructions || [];
  for (let i = 0; i < instructions.length; i++) {
    const ins = instructions[i];
    const { name, immediates } = ins;
    switch (name) {
      case 'end':
        return stack.pop();
      case 'i32.const':
        stack.push(immediates.value | 0);
        break;
      case 'i64.const':
        stack.push(BigInt.asIntN(64, immediates.value));
        break;
      case 'f32.const':
        stack.push(f32FromBits(immediates.bits));
        break;
      case 'f64.const':
        stack.push(f64FromBits(immediates.bits));
        break;
      case 'v128.const':
        stack.push(Uint8Array.from(immediates.bytes));
        break;
      case 'ref.null':
        stack.push(null);
        break;
      case 'ref.func':
        stack.push(instance.functions[immediates.functionIndex]);
        break;
      case 'global.get':
        stack.push(instance.globals[immediates.globalIndex]._getInternal());
        break;
      case 'i32.add':
      case 'i32.sub':
      case 'i32.mul':
      case 'i64.add':
      case 'i64.sub':
      case 'i64.mul':
        execScalarNumeric(name, stack);
        break;
      case 'ref.i31':
      case 'struct.new':
      case 'struct.new_default':
      case 'array.new':
      case 'array.new_default':
      case 'array.new_fixed':
      case 'any.convert_extern':
      case 'extern.convert_any':
        execGC(name, immediates, stack, instance, limits);
        break;
      default:
        throw new Trap(`Unsupported instruction ${name} in constant expression`);
    }
  }
  return stack.pop();
}

function buildWasmFrame(funcRef, args, baseStackHeight) {
  const paramCount = funcRef.typeDef.params.length;
  const localTypes = funcRef.localTypes;
  const locals = new Array(localTypes.length);
  for (let i = 0; i < paramCount; i++) {
    locals[i] = args[i];
  }
  for (let i = paramCount; i < localTypes.length; i++) {
    locals[i] = localTypes[i].kind === 'ref' ? null : defaultValueForType(localTypes[i]);
  }
  const instructions = funcRef.body.instructions;
  const endPc = instructions.length - 1;
  return {
    funcRef,
    instance: funcRef.instance,
    instructions,
    jumpTable: funcRef.jumpTable,
    locals,
    pc: 0,
    baseStackHeight,
    returnArity: funcRef.typeDef.results.length,
    ctrlFrames: [{
      kind: 'function',
      startPc: -1,
      endPc,
      stackHeight: baseStackHeight,
      paramCount: 0,
      resultCount: funcRef.typeDef.results.length,
      handlers: null,
      inCatch: false,
      caughtException: null
    }]
  };
}

function branchToDepth(frame, depth, stack) {
  const targetIdx = frame.ctrlFrames.length - 1 - depth;
  const targetCtrl = frame.ctrlFrames[targetIdx];
  const arity = targetCtrl.kind === 'loop' ? targetCtrl.paramCount : targetCtrl.resultCount;
  const values = arity > 0 ? stack.slice(stack.length - arity) : [];
  stack.length = targetCtrl.stackHeight;
  for (let i = 0; i < arity; i++) stack.push(values[i]);

  if (targetCtrl.kind === 'loop') {
    frame.ctrlFrames.length = targetIdx + 1;
    frame.pc = targetCtrl.startPc + 1;
    return false;
  }
  if (targetCtrl.kind === 'function') {
    frame.ctrlFrames.length = 0;
    return true; // function completed!
  }
  frame.ctrlFrames.length = targetIdx;
  frame.pc = targetCtrl.endPc + 1;
  return false;
}

function invokeHostFunction(funcRef, args, stack, baseStackHeight) {
  let rawResult;
  try {
    const jsArgs = args.map((v, i) => exportWasmValueToJS(v, funcRef.typeDef.params[i]));
    rawResult = funcRef.hostFn(...jsArgs);
  } catch (err) {
    if (err instanceof WasmError) throw err;
    throw new HostError(err);
  }
  stack.length = baseStackHeight;
  const results = funcRef.typeDef.results;
  if (results.length === 0) return;
  if (results.length === 1) {
    stack.push(coerceJSValueToWasm(rawResult, results[0], funcRef.instance?.typeEnv));
    return;
  }
  if (!Array.isArray(rawResult) || rawResult.length !== results.length) {
    throw new TypeError(`Host function must return an array of ${results.length} results`);
  }
  for (let i = 0; i < results.length; i++) {
    stack.push(coerceJSValueToWasm(rawResult[i], results[i], funcRef.instance?.typeEnv));
  }
}

function executeFunction(entryFuncRef, rawArgs = [], execOptions = {}) {
  const limits = {
    maxCallDepth: 1024,
    maxValueStack: 65536,
    maxFuel: Infinity,
    ...(entryFuncRef.instance?.limits || {}),
    ...(execOptions.limits || {})
  };
  let fuel = execOptions.fuel !== undefined ? execOptions.fuel : limits.maxFuel;

  const coercedArgs = entryFuncRef.typeDef.params.map((pt, idx) =>
    coerceJSValueToWasm(rawArgs[idx], pt, entryFuncRef.instance?.typeEnv)
  );

  const stack = [];
  if (entryFuncRef.isHost) {
    invokeHostFunction(entryFuncRef, coercedArgs, stack, 0);
    return formatReturnValues(stack, entryFuncRef.typeDef.results);
  }

  const callStack = [buildWasmFrame(entryFuncRef, coercedArgs, 0)];

  function chargeFuel(amount = 1, ins = null, frame = null) {
    if (fuel !== Infinity) {
      fuel -= amount;
      if (fuel < 0) {
        throw new ResourceLimitError('Execution fuel exhausted', {
          functionIndex: frame ? frame.funcRef.funcIndex : undefined,
          instruction: ins ? ins.name : undefined,
          offset: ins ? ins.offset : undefined
        });
      }
    }
  }

  function unwindException(exnRef) {
    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      while (frame.ctrlFrames.length > 0) {
        const ctrl = frame.ctrlFrames[frame.ctrlFrames.length - 1];
        if (ctrl.kind === 'try' && !ctrl.inCatch) {
          for (const h of ctrl.handlers) {
            if (h.kind === 'catch' && frame.instance.tags[h.tagIndex] === exnRef.tag) {
              ctrl.inCatch = true;
              ctrl.caughtException = exnRef;
              stack.length = ctrl.stackHeight;
              for (const v of exnRef.values) stack.push(v);
              frame.pc = h.targetPc;
              return;
            }
            if (h.kind === 'catch_all') {
              ctrl.inCatch = true;
              ctrl.caughtException = exnRef;
              stack.length = ctrl.stackHeight;
              frame.pc = h.targetPc;
              return;
            }
          }
          frame.ctrlFrames.pop();
        } else if (ctrl.kind === 'try_table') {
          frame.ctrlFrames.pop();
          for (const c of ctrl.handlers) {
            if (c.kind === 0 && frame.instance.tags[c.tagIndex] === exnRef.tag) {
              stack.length = ctrl.stackHeight;
              for (const v of exnRef.values) stack.push(v);
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
            if (c.kind === 1 && frame.instance.tags[c.tagIndex] === exnRef.tag) {
              stack.length = ctrl.stackHeight;
              for (const v of exnRef.values) stack.push(v);
              stack.push(exnRef);
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
            if (c.kind === 2) {
              stack.length = ctrl.stackHeight;
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
            if (c.kind === 3) {
              stack.length = ctrl.stackHeight;
              stack.push(exnRef);
              if (branchToDepth(frame, c.labelIndex, stack)) callStack.pop();
              return;
            }
          }
        } else {
          frame.ctrlFrames.pop();
        }
      }
      stack.length = frame.baseStackHeight;
      callStack.pop();
    }
    const jsValues = exnRef.values.map((v, i) => exportWasmValueToJS(v, exnRef.tag.funcType.params[i]));
    throw new GuestException(exnRef.tag, jsValues, { exnRef });
  }

  function performCall(calleeRef, isTailCall, currentFrame) {
    if (!calleeRef) throw new Trap('null function reference');
    const paramCount = calleeRef.typeDef.params.length;
    const args = paramCount > 0 ? stack.splice(stack.length - paramCount, paramCount) : [];

    if (isTailCall) {
      const baseHeight = currentFrame.baseStackHeight;
      stack.length = baseHeight;
      if (calleeRef.isHost) {
        callStack.pop();
        try {
          invokeHostFunction(calleeRef, args, stack, baseHeight);
        } catch (err) {
          if (err instanceof GuestException && err.exnRef) {
            unwindException(err.exnRef);
            return;
          }
          throw err;
        }
        return;
      }
      callStack[callStack.length - 1] = buildWasmFrame(calleeRef, args, baseHeight);
      return;
    }

    const baseHeight = stack.length;
    if (calleeRef.isHost) {
      try {
        invokeHostFunction(calleeRef, args, stack, baseHeight);
      } catch (err) {
        if (err instanceof GuestException) {
          const exnRef = err.exnRef || createExnRef(err.tag, err.values);
          unwindException(exnRef);
          return;
        }
        throw err;
      }
      return;
    }

    if (callStack.length + 1 > limits.maxCallDepth) {
      throw new ResourceLimitError(`Call stack depth exceeds maxCallDepth (${limits.maxCallDepth})`, {
        functionIndex: calleeRef.funcIndex
      });
    }
    callStack.push(buildWasmFrame(calleeRef, args, baseHeight));
  }

  while (callStack.length > 0) {
    const frame = callStack[callStack.length - 1];
    if (stack.length > limits.maxValueStack) {
      throw new ResourceLimitError(`Operand stack size (${stack.length}) exceeds maxValueStack (${limits.maxValueStack})`, {
        functionIndex: frame.funcRef.funcIndex
      });
    }
    const pc = frame.pc;
    const ins = frame.instructions[pc];
    const { name, opcode, immediates } = ins;
    chargeFuel(1, ins, frame);

    try {
      switch (name) {
        case 'nop':
          frame.pc = pc + 1;
          break;
        case 'unreachable':
          throw new Trap('unreachable executed');
        case 'block':
        case 'loop':
        case 'try':
        case 'try_table': {
          const meta = frame.jumpTable[pc];
          const stackHeight = stack.length - meta.paramCount;
          frame.ctrlFrames.push({
            kind: name,
            startPc: pc,
            endPc: meta.endPc,
            stackHeight,
            paramCount: meta.paramCount,
            resultCount: meta.resultCount,
            handlers: meta.handlers || meta.catches || null,
            inCatch: false,
            caughtException: null
          });
          frame.pc = pc + 1;
          break;
        }
        case 'if': {
          const meta = frame.jumpTable[pc];
          const cond = stack.pop() | 0;
          const stackHeight = stack.length - meta.paramCount;
          frame.ctrlFrames.push({
            kind: 'if',
            startPc: pc,
            endPc: meta.endPc,
            stackHeight,
            paramCount: meta.paramCount,
            resultCount: meta.resultCount,
            handlers: null,
            inCatch: false,
            caughtException: null
          });
          if (cond === 0) {
            frame.pc = meta.elsePc !== null ? meta.elsePc + 1 : meta.endPc;
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'else':
        case 'catch':
        case 'catch_all': {
          // Reached via normal fallthrough from preceding block body
          const ctrl = frame.ctrlFrames.pop();
          const arity = ctrl.resultCount;
          const values = arity > 0 ? stack.slice(stack.length - arity) : [];
          stack.length = ctrl.stackHeight;
          for (let i = 0; i < arity; i++) stack.push(values[i]);
          frame.pc = ctrl.endPc + 1;
          break;
        }
        case 'end': {
          const ctrl = frame.ctrlFrames.pop();
          const arity = ctrl.resultCount;
          const values = arity > 0 ? stack.slice(stack.length - arity) : [];
          stack.length = ctrl.stackHeight;
          for (let i = 0; i < arity; i++) stack.push(values[i]);
          if (frame.ctrlFrames.length === 0) {
            callStack.pop();
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br': {
          if (branchToDepth(frame, immediates.labelIndex, stack)) {
            callStack.pop();
          }
          break;
        }
        case 'br_if': {
          const cond = stack.pop() | 0;
          if (cond !== 0) {
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br_table': {
          const idx = stack.pop() >>> 0;
          const targets = immediates.targets;
          const depth = idx < targets.length ? targets[idx] : immediates.defaultTarget;
          if (branchToDepth(frame, depth, stack)) {
            callStack.pop();
          }
          break;
        }
        case 'br_on_null': {
          const ref = stack.pop();
          if (ref === null) {
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            stack.push(ref);
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br_on_non_null': {
          const ref = stack.pop();
          if (ref !== null) {
            stack.push(ref);
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'br_on_cast':
        case 'br_on_cast_fail': {
          const meta = frame.jumpTable[pc];
          const ref = stack[stack.length - 1];
          const matches = matchesRefType(ref, meta.targetType, frame.instance.typeEnv);
          const shouldBranch = name === 'br_on_cast' ? matches : !matches;
          if (shouldBranch) {
            if (branchToDepth(frame, immediates.labelIndex, stack)) {
              callStack.pop();
            }
          } else {
            frame.pc = pc + 1;
          }
          break;
        }
        case 'return': {
          const arity = frame.returnArity;
          const values = arity > 0 ? stack.slice(stack.length - arity) : [];
          stack.length = frame.baseStackHeight;
          for (let i = 0; i < arity; i++) stack.push(values[i]);
          callStack.pop();
          break;
        }
        case 'call':
        case 'return_call': {
          const callee = frame.instance.functions[immediates.functionIndex];
          frame.pc = pc + 1;
          performCall(callee, name === 'return_call', frame);
          break;
        }
        case 'call_indirect':
        case 'return_call_indirect': {
          const elemIdx = stack.pop() >>> 0;
          const table = frame.instance.tables[immediates.tableIndex];
          if (elemIdx >= table.length) {
            throw new Trap('undefined element (out of bounds table index)');
          }
          const callee = table._getInternal(elemIdx);
          if (callee === null) {
            throw new Trap('uninitialized element (null function reference)');
          }
          const expectedType = frame.instance.typeEnv.get(immediates.typeIndex);
          if (!frame.instance.typeEnv.isHeapSubtype(callee.typeDef, expectedType)) {
            throw new Trap('indirect call type mismatch');
          }
          frame.pc = pc + 1;
          performCall(callee, name === 'return_call_indirect', frame);
          break;
        }
        case 'call_ref':
        case 'return_call_ref': {
          const callee = stack.pop();
          if (callee === null) {
            throw new Trap('null function reference');
          }
          frame.pc = pc + 1;
          performCall(callee, name === 'return_call_ref', frame);
          break;
        }
        case 'throw': {
          const tag = frame.instance.tags[immediates.tagIndex];
          const arity = tag.funcType.params.length;
          const values = arity > 0 ? stack.splice(stack.length - arity, arity) : [];
          unwindException(createExnRef(tag, values));
          break;
        }
        case 'throw_ref': {
          const exnRef = stack.pop();
          if (exnRef === null) throw new Trap('null exception reference');
          unwindException(exnRef);
          break;
        }
        case 'rethrow': {
          const targetIdx = frame.ctrlFrames.length - 1 - immediates.labelIndex;
          const targetCtrl = frame.ctrlFrames[targetIdx];
          const exnRef = targetCtrl.caughtException;
          if (!exnRef) throw new Trap('invalid rethrow state');
          frame.ctrlFrames.length = targetIdx;
          unwindException(exnRef);
          break;
        }
        case 'drop':
          stack.pop();
          frame.pc = pc + 1;
          break;
        case 'select':
        case 'select_t': {
          const cond = stack.pop() | 0;
          const v2 = stack.pop();
          const v1 = stack.pop();
          stack.push(cond !== 0 ? v1 : v2);
          frame.pc = pc + 1;
          break;
        }
        case 'local.get':
          stack.push(frame.locals[immediates.localIndex]);
          frame.pc = pc + 1;
          break;
        case 'local.set':
          frame.locals[immediates.localIndex] = stack.pop();
          frame.pc = pc + 1;
          break;
        case 'local.tee':
          frame.locals[immediates.localIndex] = stack[stack.length - 1];
          frame.pc = pc + 1;
          break;
        case 'global.get':
          stack.push(frame.instance.globals[immediates.globalIndex]._getInternal());
          frame.pc = pc + 1;
          break;
        case 'global.set':
          frame.instance.globals[immediates.globalIndex]._setInternal(stack.pop());
          frame.pc = pc + 1;
          break;
        case 'table.get': {
          const idx = stack.pop() >>> 0;
          const table = frame.instance.tables[immediates.tableIndex];
          stack.push(table._getInternal(idx));
          frame.pc = pc + 1;
          break;
        }
        case 'table.set': {
          const val = stack.pop();
          const idx = stack.pop() >>> 0;
          const table = frame.instance.tables[immediates.tableIndex];
          table._setInternal(idx, val);
          frame.pc = pc + 1;
          break;
        }
        case 'table.size': {
          const table = frame.instance.tables[immediates.tableIndex];
          stack.push(table.length | 0);
          frame.pc = pc + 1;
          break;
        }
        case 'table.grow': {
          const delta = stack.pop() | 0;
          const initVal = stack.pop();
          const table = frame.instance.tables[immediates.tableIndex];
          chargeFuel(Math.max(0, delta), ins, frame);
          stack.push(table._growInternal(delta, initVal) | 0);
          frame.pc = pc + 1;
          break;
        }
        case 'table.fill': {
          const len = stack.pop() >>> 0;
          const val = stack.pop();
          const dst = stack.pop() >>> 0;
          chargeFuel(len, ins, frame);
          frame.instance.tables[immediates.tableIndex]._fillInternal(dst, val, len);
          frame.pc = pc + 1;
          break;
        }
        case 'table.copy': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(len, ins, frame);
          const dstTable = frame.instance.tables[immediates.destinationTable];
          const srcTable = frame.instance.tables[immediates.sourceTable];
          srcTable.copyTo(dstTable, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'table.init': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(len, ins, frame);
          const table = frame.instance.tables[immediates.tableIndex];
          const seg = frame.instance.elementSegments[immediates.elementIndex];
          table.initFromSegment(seg, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'elem.drop': {
          frame.instance.elementSegments[immediates.elementIndex].dropped = true;
          frame.instance.elementSegments[immediates.elementIndex].elements = [];
          frame.pc = pc + 1;
          break;
        }
        case 'memory.fill': {
          const len = stack.pop() >>> 0;
          const val = stack.pop() | 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(Math.ceil(len / 64), ins, frame);
          frame.instance.memories[immediates.memoryIndex].fill(dst, val, len);
          frame.pc = pc + 1;
          break;
        }
        case 'memory.copy': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(Math.ceil(len / 64), ins, frame);
          const dstMem = frame.instance.memories[immediates.destinationMemory];
          const srcMem = frame.instance.memories[immediates.sourceMemory];
          srcMem.copyTo(dstMem, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'memory.init': {
          const len = stack.pop() >>> 0;
          const src = stack.pop() >>> 0;
          const dst = stack.pop() >>> 0;
          chargeFuel(Math.ceil(len / 64), ins, frame);
          const mem = frame.instance.memories[immediates.memoryIndex];
          const seg = frame.instance.dataSegments[immediates.dataIndex];
          mem.initFromSegment(seg, dst, src, len);
          frame.pc = pc + 1;
          break;
        }
        case 'data.drop': {
          frame.instance.dataSegments[immediates.dataIndex].dropped = true;
          frame.instance.dataSegments[immediates.dataIndex].bytes = new Uint8Array(0);
          frame.pc = pc + 1;
          break;
        }
        case 'ref.null':
          stack.push(null);
          frame.pc = pc + 1;
          break;
        case 'ref.is_null':
          stack.push(stack.pop() === null ? 1 : 0);
          frame.pc = pc + 1;
          break;
        case 'ref.as_non_null': {
          const v = stack.pop();
          if (v === null) throw new Trap('null reference');
          stack.push(v);
          frame.pc = pc + 1;
          break;
        }
        case 'ref.eq': {
          const b = stack.pop();
          const a = stack.pop();
          stack.push(isEqRefEqual(a, b) ? 1 : 0);
          frame.pc = pc + 1;
          break;
        }
        case 'ref.func':
          stack.push(frame.instance.functions[immediates.functionIndex]);
          frame.pc = pc + 1;
          break;
        case 'i32.const':
          stack.push(immediates.value | 0);
          frame.pc = pc + 1;
          break;
        case 'i64.const':
          stack.push(BigInt.asIntN(64, immediates.value));
          frame.pc = pc + 1;
          break;
        case 'f32.const':
          stack.push(f32FromBits(immediates.bits));
          frame.pc = pc + 1;
          break;
        case 'f64.const':
          stack.push(f64FromBits(immediates.bits));
          frame.pc = pc + 1;
          break;
        default: {
          if (opcode === 0xfb) {
            execGC(name, immediates, stack, frame.instance, limits);
          } else if (opcode === 0xfd) {
            execSIMD(name, immediates, stack, frame.instance.memories);
          } else if (!execScalarMemory(name, immediates, stack, frame.instance.memories)) {
            if (!execScalarNumeric(name, stack)) {
              throw new Trap(`Unimplemented instruction ${name}`);
            }
          }
          frame.pc = pc + 1;
          break;
        }
      }
    } catch (err) {
      if (err instanceof WasmError && !(err instanceof GuestException)) {
        if (err.functionIndex === undefined) err.functionIndex = frame.funcRef.funcIndex;
        if (err.instruction === undefined) err.instruction = name;
        if (err.opcode === undefined) err.opcode = opcode;
        if (err.offset === undefined) err.offset = ins.offset;
      }
      throw err;
    }
  }

  return formatReturnValues(stack, entryFuncRef.typeDef.results);
}

function formatReturnValues(stack, resultTypes) {
  if (resultTypes.length === 0) return undefined;
  if (resultTypes.length === 1) {
    return exportWasmValueToJS(stack[0], resultTypes[0]);
  }
  return resultTypes.map((rt, idx) => exportWasmValueToJS(stack[idx], rt));
}

module.exports = {
  coerceJSValueToWasm,
  exportWasmValueToJS,
  createExnRef,
  evaluateConstantExpression,
  executeFunction
};
