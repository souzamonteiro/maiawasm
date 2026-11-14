'use strict';

const { ValidationError, ResourceLimitError } = require('./errors.js');
const {
  BOT_TYPE,
  I32_TYPE,
  I64_TYPE,
  F32_TYPE,
  F64_TYPE,
  V128_TYPE,
  normalizeValType,
  normalizeHeapType,
  formatValType,
  isDefaultable,
  heapHierarchy,
  TypeEnvironment
} = require('./types.js');

const DEFAULT_LIMITS = Object.freeze({
  maxModuleBytes: 64 * 1024 * 1024,
  maxTypes: 100000,
  maxFunctions: 100000,
  maxTables: 100,
  maxMemories: 100,
  maxGlobals: 100000,
  maxTags: 10000,
  maxImports: 100000,
  maxExports: 100000,
  maxDataSegments: 100000,
  maxElementSegments: 100000,
  maxLocals: 50000,
  maxInstructionsPerFunction: 500000,
  maxControlDepth: 10000
});

function unpackedValType(storage) {
  const s = normalizeValType(storage);
  if (s.kind === 'packed') return I32_TYPE;
  return s;
}

function blockSignature(blockType, typeEnv) {
  if (!blockType || blockType.kind === 'empty') {
    return { params: [], results: [] };
  }
  if (blockType.kind === 'value') {
    return { params: [], results: [normalizeValType(blockType.valueType)] };
  }
  if (blockType.kind === 'type') {
    const def = typeEnv.get(blockType.typeIndex);
    if (def.kind !== 'func') {
      throw new ValidationError(`Block type index ${blockType.typeIndex} is not a function type`);
    }
    return { params: def.params, results: def.results };
  }
  throw new ValidationError(`Invalid block type: ${JSON.stringify(blockType)}`);
}

function validateConstantExpression(expr, expectedType, ctx) {
  const { typeEnv, globals, importedGlobalCount, functions, declaredFunctions } = ctx;
  const stack = [];
  const instructions = expr.instructions || [];
  if (instructions.length === 0 || instructions[instructions.length - 1].name !== 'end') {
    throw new ValidationError('Constant expression must end with end', { offset: expr.offset });
  }
  for (let i = 0; i < instructions.length - 1; i++) {
    const ins = instructions[i];
    const { name, immediates, offset } = ins;
    switch (name) {
      case 'i32.const':
        stack.push(I32_TYPE);
        break;
      case 'i64.const':
        stack.push(I64_TYPE);
        break;
      case 'f32.const':
        stack.push(F32_TYPE);
        break;
      case 'f64.const':
        stack.push(F64_TYPE);
        break;
      case 'v128.const':
        stack.push(V128_TYPE);
        break;
      case 'ref.null': {
        const ht = normalizeHeapType(immediates.heapType);
        if (typeof ht === 'number') typeEnv.get(ht);
        stack.push({ kind: 'ref', nullable: true, heapType: ht });
        break;
      }
      case 'ref.func': {
        const funcIdx = immediates.functionIndex;
        if (funcIdx < 0 || funcIdx >= functions.length) {
          throw new ValidationError(`Function index ${funcIdx} out of bounds in constant expression`, { offset });
        }
        if (declaredFunctions) declaredFunctions.add(funcIdx);
        stack.push({ kind: 'ref', nullable: false, heapType: functions[funcIdx].typeIndex });
        break;
      }
      case 'global.get': {
        const gIdx = immediates.globalIndex;
        if (gIdx < 0 || gIdx >= ctx.visibleGlobalsCount) {
          throw new ValidationError(`Global index ${gIdx} out of bounds in constant expression`, { offset });
        }
        const g = globals[gIdx];
        if (g.mutable) {
          throw new ValidationError(`Constant expression cannot reference mutable global ${gIdx}`, { offset });
        }
        stack.push(g.valType);
        break;
      }
      case 'ref.i31': {
        const top = stack.pop();
        if (!top || !typeEnv.isValueSubtype(top, I32_TYPE)) {
          throw new ValidationError('ref.i31 in constant expression requires i32', { offset });
        }
        stack.push({ kind: 'ref', nullable: false, heapType: 'i31' });
        break;
      }
      case 'struct.new': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'struct') throw new ValidationError('struct.new requires struct type', { offset });
        for (let f = def.fields.length - 1; f >= 0; f--) {
          const got = stack.pop();
          const want = unpackedValType(def.fields[f].storage);
          if (!got || !typeEnv.isValueSubtype(got, want)) {
            throw new ValidationError('struct.new field type mismatch in constant expression', { offset });
          }
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'struct.new_default': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'struct') throw new ValidationError('struct.new_default requires struct type', { offset });
        for (const field of def.fields) {
          if (!isDefaultable(field.storage)) {
            throw new ValidationError('struct.new_default on non-defaultable field', { offset });
          }
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'array.new': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'array') throw new ValidationError('array.new requires array type', { offset });
        const lenType = stack.pop();
        const elemType = stack.pop();
        if (!lenType || !typeEnv.isValueSubtype(lenType, I32_TYPE) ||
            !elemType || !typeEnv.isValueSubtype(elemType, unpackedValType(def.field.storage))) {
          throw new ValidationError('array.new type mismatch in constant expression', { offset });
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'array.new_default': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'array') throw new ValidationError('array.new_default requires array type', { offset });
        if (!isDefaultable(def.field.storage)) {
          throw new ValidationError('array.new_default on non-defaultable element', { offset });
        }
        const lenType = stack.pop();
        if (!lenType || !typeEnv.isValueSubtype(lenType, I32_TYPE)) {
          throw new ValidationError('array.new_default requires i32 length', { offset });
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'array.new_fixed': {
        const def = typeEnv.get(immediates.typeIndex);
        if (def.kind !== 'array') throw new ValidationError('array.new_fixed requires array type', { offset });
        const want = unpackedValType(def.field.storage);
        for (let k = 0; k < immediates.length; k++) {
          const got = stack.pop();
          if (!got || !typeEnv.isValueSubtype(got, want)) {
            throw new ValidationError('array.new_fixed element type mismatch in constant expression', { offset });
          }
        }
        stack.push({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
        break;
      }
      case 'any.convert_extern': {
        const got = stack.pop();
        if (!got || !typeEnv.isValueSubtype(got, { kind: 'ref', nullable: true, heapType: 'extern' })) {
          throw new ValidationError('any.convert_extern type mismatch in constant expression', { offset });
        }
        stack.push({ kind: 'ref', nullable: got.nullable, heapType: 'any' });
        break;
      }
      case 'extern.convert_any': {
        const got = stack.pop();
        if (!got || !typeEnv.isValueSubtype(got, { kind: 'ref', nullable: true, heapType: 'any' })) {
          throw new ValidationError('extern.convert_any type mismatch in constant expression', { offset });
        }
        stack.push({ kind: 'ref', nullable: got.nullable, heapType: 'extern' });
        break;
      }
      case 'i32.add':
      case 'i32.sub':
      case 'i32.mul': {
        const b = stack.pop(), a = stack.pop();
        if (!a || !b || !typeEnv.isValueSubtype(a, I32_TYPE) || !typeEnv.isValueSubtype(b, I32_TYPE)) {
          throw new ValidationError(`${name} requires [i32, i32] in constant expression`, { offset });
        }
        stack.push(I32_TYPE);
        break;
      }
      case 'i64.add':
      case 'i64.sub':
      case 'i64.mul': {
        const b = stack.pop(), a = stack.pop();
        if (!a || !b || !typeEnv.isValueSubtype(a, I64_TYPE) || !typeEnv.isValueSubtype(b, I64_TYPE)) {
          throw new ValidationError(`${name} requires [i64, i64] in constant expression`, { offset });
        }
        stack.push(I64_TYPE);
        break;
      }
      default:
        throw new ValidationError(`Instruction ${name} is not valid in a constant expression`, { offset, instruction: name });
    }
  }
  if (stack.length !== 1 || !typeEnv.isValueSubtype(stack[0], expectedType)) {
    throw new ValidationError(
      `Constant expression type mismatch: expected ${formatValType(expectedType)}, got ${stack.length === 1 ? formatValType(stack[0]) : `[${stack.map(formatValType).join(', ')}]`}`,
      { offset: expr.offset }
    );
  }
}

function validateFunctionBody(body, funcIndex, funcType, moduleCtx, options) {
  const {
    typeEnv,
    functions,
    tables,
    memories,
    globals,
    tags,
    dataSegments,
    elementSegments,
    dataCountSection,
    declaredFunctions
  } = moduleCtx;
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const legacyExceptions = options.legacyExceptions !== false;

  const localTypes = [...funcType.params];
  for (const decl of body.locals) {
    if (localTypes.length + decl.count > limits.maxLocals) {
      throw new ResourceLimitError(`Function ${funcIndex} exceeds maxLocals (${limits.maxLocals})`, {
        functionIndex: funcIndex,
        offset: body.offset
      });
    }
    const vt = normalizeValType(decl.valType);
    if (vt.kind === 'ref' && typeof vt.heapType === 'number') typeEnv.get(vt.heapType);
    for (let i = 0; i < decl.count; i++) localTypes.push(vt);
  }

  const instructions = body.instructions;
  if (instructions.length > limits.maxInstructionsPerFunction) {
    throw new ResourceLimitError(
      `Function ${funcIndex} instruction count (${instructions.length}) exceeds maxInstructionsPerFunction (${limits.maxInstructionsPerFunction})`,
      { functionIndex: funcIndex, offset: body.offset }
    );
  }

  // Track non-defaultable local initialization
  const initLocals = localTypes.map((vt, idx) => idx < funcType.params.length || isDefaultable(vt));

  const valStack = [];
  const ctrlStack = [];
  const jumpTable = new Array(instructions.length);

  function fail(ins, msg) {
    throw new ValidationError(`Function ${funcIndex} (${ins ? ins.name : 'body'}): ${msg}`, {
      functionIndex: funcIndex,
      instruction: ins ? ins.name : undefined,
      opcode: ins ? ins.opcode : undefined,
      offset: ins ? ins.offset : body.offset
    });
  }

  function pushCtrl(kind, params, results, startPc, extra = {}) {
    if (ctrlStack.length + 1 > limits.maxControlDepth) {
      throw new ResourceLimitError(`Control depth exceeds maxControlDepth (${limits.maxControlDepth})`, {
        functionIndex: funcIndex,
        offset: instructions[startPc]?.offset
      });
    }
    const frame = {
      kind,
      params,
      results,
      height: valStack.length,
      unreachable: false,
      startPc,
      initSnapshot: initLocals.slice(),
      ...extra
    };
    ctrlStack.push(frame);
    pushVals(params);
    return frame;
  }

  function currentCtrl() {
    return ctrlStack[ctrlStack.length - 1];
  }

  function pushVal(vt) {
    valStack.push(normalizeValType(vt));
  }

  function pushVals(types) {
    for (const t of types) pushVal(t);
  }

  function popVal(ins, expected) {
    const frame = currentCtrl();
    if (valStack.length === frame.height) {
      if (frame.unreachable) return BOT_TYPE;
      fail(ins, `type mismatch: operand stack underflow (expected ${expected ? formatValType(expected) : 'value'})`);
    }
    const actual = valStack.pop();
    if (expected !== undefined && !typeEnv.isValueSubtype(actual, expected)) {
      fail(ins, `type mismatch: expected ${formatValType(expected)}, got ${formatValType(actual)}`);
    }
    return actual;
  }

  function popVals(ins, expectedTypes) {
    const popped = new Array(expectedTypes.length);
    for (let i = expectedTypes.length - 1; i >= 0; i--) {
      popped[i] = popVal(ins, expectedTypes[i]);
    }
    return popped;
  }

  function labelTypes(frame) {
    return frame.kind === 'loop' ? frame.params : frame.results;
  }

  function markUnreachable() {
    const frame = currentCtrl();
    valStack.length = frame.height;
    frame.unreachable = true;
  }

  function getLabelFrame(ins, depth) {
    if (depth < 0 || depth >= ctrlStack.length) {
      fail(ins, `unknown label depth ${depth}`);
    }
    return ctrlStack[ctrlStack.length - 1 - depth];
  }

  function requireMemory(ins, memIdx = 0) {
    if (memIdx < 0 || memIdx >= memories.length) {
      fail(ins, `unknown memory ${memIdx}`);
    }
  }

  function requireDataCount(ins, dataIdx) {
    if (dataCountSection === null) {
      fail(ins, `${ins.name} requires a DataCount section`);
    }
    if (dataIdx < 0 || dataIdx >= dataSegments.length) {
      fail(ins, `unknown data segment ${dataIdx}`);
    }
  }

  // Push outer function control frame
  pushCtrl('function', [], funcType.results, -1);

  for (let pc = 0; pc < instructions.length; pc++) {
    const ins = instructions[pc];
    const { name, opcode, immediates } = ins;

    switch (name) {
      case 'unreachable':
        markUnreachable();
        break;
      case 'nop':
        break;
      case 'block':
      case 'loop': {
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVals(ins, sig.params);
        const frame = pushCtrl(name, sig.params, sig.results, pc);
        jumpTable[pc] = {
          kind: name,
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height
        };
        break;
      }
      case 'if': {
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVal(ins, I32_TYPE);
        popVals(ins, sig.params);
        const frame = pushCtrl('if', sig.params, sig.results, pc, { hasElse: false, elsePc: null });
        jumpTable[pc] = {
          kind: 'if',
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height,
          elsePc: null,
          endPc: null
        };
        break;
      }
      case 'else': {
        const frame = currentCtrl();
        if (frame.kind !== 'if' || frame.hasElse) {
          fail(ins, 'misplaced else');
        }
        popVals(ins, frame.results);
        if (valStack.length !== frame.height) {
          fail(ins, 'extra values on stack at else');
        }
        frame.hasElse = true;
        frame.elsePc = pc;
        frame.unreachable = false;
        for (let i = 0; i < initLocals.length; i++) initLocals[i] = frame.initSnapshot[i];
        pushVals(frame.params);
        if (jumpTable[frame.startPc]) jumpTable[frame.startPc].elsePc = pc;
        jumpTable[pc] = {
          kind: 'else',
          ifPc: frame.startPc,
          paramCount: frame.params.length,
          resultCount: frame.results.length,
          stackHeight: frame.height,
          endPc: null
        };
        break;
      }
      case 'try': {
        if (!legacyExceptions) {
          fail(ins, 'legacy try instruction is disabled');
        }
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVals(ins, sig.params);
        const frame = pushCtrl('try', sig.params, sig.results, pc, {
          inCatch: false,
          seenCatchAll: false,
          handlers: []
        });
        jumpTable[pc] = {
          kind: 'try',
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height,
          handlers: frame.handlers,
          endPc: null
        };
        break;
      }
      case 'catch':
      case 'catch_all': {
        if (!legacyExceptions) {
          fail(ins, `legacy ${name} instruction is disabled`);
        }
        const frame = currentCtrl();
        if (frame.kind !== 'try' || frame.seenCatchAll) {
          fail(ins, `misplaced ${name}`);
        }
        popVals(ins, frame.results);
        if (valStack.length !== frame.height) {
          fail(ins, `extra values on stack before ${name}`);
        }
        frame.inCatch = true;
        frame.unreachable = false;
        for (let i = 0; i < initLocals.length; i++) initLocals[i] = frame.initSnapshot[i];
        if (name === 'catch') {
          const tagIdx = immediates.tagIndex;
          if (tagIdx < 0 || tagIdx >= tags.length) fail(ins, `unknown tag ${tagIdx}`);
          const tagType = tags[tagIdx].funcType;
          pushVals(tagType.params);
          frame.handlers.push({ kind: 'catch', tagIndex: tagIdx, targetPc: pc + 1, arity: tagType.params.length });
        } else {
          frame.seenCatchAll = true;
          frame.handlers.push({ kind: 'catch_all', targetPc: pc + 1, arity: 0 });
        }
        jumpTable[pc] = {
          kind: name,
          tryPc: frame.startPc,
          resultCount: frame.results.length,
          stackHeight: frame.height,
          endPc: null
        };
        break;
      }
      case 'try_table': {
        const sig = blockSignature(immediates.blockType, typeEnv);
        popVals(ins, sig.params);
        // Validate catch clauses in surrounding label context (before pushing try_table)
        const resolvedCatches = [];
        for (const c of immediates.catches) {
          const targetFrame = getLabelFrame(ins, c.labelIndex);
          const targetTypes = labelTypes(targetFrame);
          let expectedTypes;
          if (c.kind === 0 || c.kind === 1) {
            if (c.tagIndex < 0 || c.tagIndex >= tags.length) {
              fail(ins, `unknown tag ${c.tagIndex} in try_table`);
            }
            const tagParams = tags[c.tagIndex].funcType.params;
            expectedTypes = c.kind === 0
              ? tagParams
              : [...tagParams, { kind: 'ref', nullable: false, heapType: 'exn' }];
          } else if (c.kind === 2) {
            expectedTypes = [];
          } else if (c.kind === 3) {
            expectedTypes = [{ kind: 'ref', nullable: false, heapType: 'exn' }];
          } else {
            fail(ins, `invalid catch kind ${c.kind}`);
          }
          if (expectedTypes.length !== targetTypes.length) {
            fail(ins, `try_table catch label arity mismatch: expected ${targetTypes.length}, got ${expectedTypes.length}`);
          }
          for (let i = 0; i < expectedTypes.length; i++) {
            if (!typeEnv.isValueSubtype(expectedTypes[i], targetTypes[i])) {
              fail(ins, `try_table catch type mismatch at index ${i}`);
            }
          }
          resolvedCatches.push({
            kind: c.kind,
            tagIndex: c.tagIndex,
            labelIndex: c.labelIndex,
            targetStartPc: targetFrame.startPc,
            targetKind: targetFrame.kind,
            stackHeight: targetFrame.height,
            arity: targetTypes.length
          });
        }
        const frame = pushCtrl('try_table', sig.params, sig.results, pc, { catches: resolvedCatches });
        jumpTable[pc] = {
          kind: 'try_table',
          paramCount: sig.params.length,
          resultCount: sig.results.length,
          stackHeight: frame.height,
          catches: resolvedCatches,
          endPc: null
        };
        break;
      }
      case 'end': {
        const frame = currentCtrl();
        if (frame.kind === 'if' && !frame.hasElse) {
          // Implicit empty else branch must satisfy params -> results
          if (frame.params.length !== frame.results.length) {
            fail(ins, 'if without else has mismatched parameter and result arity');
          }
          for (let i = 0; i < frame.params.length; i++) {
            if (!typeEnv.isValueSubtype(frame.params[i], frame.results[i])) {
              fail(ins, 'if without else type mismatch');
            }
          }
        }
        popVals(ins, frame.results);
        if (valStack.length !== frame.height) {
          fail(ins, `type mismatch: extra values on stack at end of ${frame.kind} (expected height ${frame.height}, got ${valStack.length})`);
        }
        ctrlStack.pop();
        for (let i = 0; i < initLocals.length; i++) initLocals[i] = frame.initSnapshot[i];
        if (frame.startPc >= 0 && jumpTable[frame.startPc]) {
          jumpTable[frame.startPc].endPc = pc;
          if (frame.kind === 'if' && frame.elsePc !== null && jumpTable[frame.elsePc]) {
            jumpTable[frame.elsePc].endPc = pc;
          }
          if (frame.kind === 'try') {
            for (let p = frame.startPc + 1; p < pc; p++) {
              if (jumpTable[p] && jumpTable[p].tryPc === frame.startPc) {
                jumpTable[p].endPc = pc;
              }
            }
          }
        }
        jumpTable[pc] = {
          kind: 'end',
          blockKind: frame.kind,
          startPc: frame.startPc,
          resultCount: frame.results.length,
          stackHeight: frame.height
        };
        if (ctrlStack.length > 0) {
          pushVals(frame.results);
        }
        break;
      }
      case 'br': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        popVals(ins, types);
        jumpTable[pc] = {
          kind: 'br',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        markUnreachable();
        break;
      }
      case 'br_if': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        popVal(ins, I32_TYPE);
        popVals(ins, types);
        pushVals(types);
        jumpTable[pc] = {
          kind: 'br_if',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        break;
      }
      case 'br_table': {
        popVal(ins, I32_TYPE);
        const defaultFrame = getLabelFrame(ins, immediates.defaultTarget);
        const defaultTypes = labelTypes(defaultFrame);
        const arity = defaultTypes.length;
        const targetsMeta = [];
        for (const depth of [...immediates.targets, immediates.defaultTarget]) {
          const tFrame = getLabelFrame(ins, depth);
          const tTypes = labelTypes(tFrame);
          if (tTypes.length !== arity) {
            fail(ins, `br_table target arity mismatch: expected ${arity}, got ${tTypes.length}`);
          }
          // Verify current stack has subtypes for each target without consuming until after loop
          for (let i = 0; i < arity; i++) {
            const stackIndex = valStack.length - arity + i;
            if (stackIndex < currentCtrl().height) {
              if (!currentCtrl().unreachable) fail(ins, 'br_table stack underflow');
            } else if (!typeEnv.isValueSubtype(valStack[stackIndex], tTypes[i])) {
              fail(ins, `br_table target type mismatch at index ${i}`);
            }
          }
          targetsMeta.push({
            labelIndex: depth,
            targetStartPc: tFrame.startPc,
            targetKind: tFrame.kind,
            arity,
            stackHeight: tFrame.height
          });
        }
        popVals(ins, defaultTypes);
        jumpTable[pc] = {
          kind: 'br_table',
          targets: targetsMeta.slice(0, -1),
          defaultTarget: targetsMeta[targetsMeta.length - 1]
        };
        markUnreachable();
        break;
      }
      case 'br_on_null': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        const refVal = popVal(ins);
        if (refVal.kind !== 'ref' && refVal.kind !== 'bot') {
          fail(ins, `br_on_null requires reference type, got ${formatValType(refVal)}`);
        }
        popVals(ins, types);
        pushVals(types);
        pushVal(refVal.kind === 'bot' ? BOT_TYPE : { kind: 'ref', nullable: false, heapType: refVal.heapType });
        jumpTable[pc] = {
          kind: 'br_on_null',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        break;
      }
      case 'br_on_non_null': {
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        if (types.length === 0) {
          fail(ins, 'br_on_non_null target label must expect at least one reference value');
        }
        const refVal = popVal(ins);
        if (refVal.kind !== 'ref' && refVal.kind !== 'bot') {
          fail(ins, `br_on_non_null requires reference type, got ${formatValType(refVal)}`);
        }
        const nonNullRef = refVal.kind === 'bot' ? BOT_TYPE : { kind: 'ref', nullable: false, heapType: refVal.heapType };
        const prefixTypes = types.slice(0, -1);
        const lastTargetType = types[types.length - 1];
        if (!typeEnv.isValueSubtype(nonNullRef, lastTargetType)) {
          fail(ins, `br_on_non_null reference ${formatValType(nonNullRef)} does not match target ${formatValType(lastTargetType)}`);
        }
        popVals(ins, prefixTypes);
        pushVals(prefixTypes);
        jumpTable[pc] = {
          kind: 'br_on_non_null',
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height
        };
        break;
      }
      case 'br_on_cast':
      case 'br_on_cast_fail': {
        const sourceType = normalizeValType(immediates.sourceType);
        const targetType = normalizeValType(immediates.targetType);
        if (!typeEnv.isValueSubtype(targetType, sourceType)) {
          fail(ins, `${name} target type ${formatValType(targetType)} is not a subtype of source type ${formatValType(sourceType)}`);
        }
        const target = getLabelFrame(ins, immediates.labelIndex);
        const types = labelTypes(target);
        if (types.length === 0) {
          fail(ins, `${name} target label must expect at least one value`);
        }
        const diffType = {
          kind: 'ref',
          nullable: sourceType.nullable && !targetType.nullable,
          heapType: sourceType.heapType
        };
        const branchRefType = name === 'br_on_cast' ? targetType : diffType;
        const fallthroughRefType = name === 'br_on_cast' ? diffType : targetType;
        const lastTargetType = types[types.length - 1];
        if (!typeEnv.isValueSubtype(branchRefType, lastTargetType)) {
          fail(ins, `${name} branch type ${formatValType(branchRefType)} is not a subtype of label type ${formatValType(lastTargetType)}`);
        }
        const prefixTypes = types.slice(0, -1);
        popVal(ins, sourceType);
        popVals(ins, prefixTypes);
        pushVals(prefixTypes);
        pushVal(fallthroughRefType);
        jumpTable[pc] = {
          kind: name,
          labelIndex: immediates.labelIndex,
          targetStartPc: target.startPc,
          targetKind: target.kind,
          arity: types.length,
          stackHeight: target.height,
          targetType
        };
        break;
      }
      case 'return': {
        popVals(ins, funcType.results);
        markUnreachable();
        break;
      }
      case 'call':
      case 'return_call': {
        const fnIdx = immediates.functionIndex;
        if (fnIdx < 0 || fnIdx >= functions.length) fail(ins, `unknown function ${fnIdx}`);
        const calleeType = functions[fnIdx].funcType;
        popVals(ins, calleeType.params);
        if (name === 'return_call') {
          if (calleeType.results.length !== funcType.results.length) {
            fail(ins, 'return_call result arity mismatch');
          }
          for (let i = 0; i < calleeType.results.length; i++) {
            if (!typeEnv.isValueSubtype(calleeType.results[i], funcType.results[i])) {
              fail(ins, 'return_call result type mismatch');
            }
          }
          markUnreachable();
        } else {
          pushVals(calleeType.results);
        }
        break;
      }
      case 'call_indirect':
      case 'return_call_indirect': {
        const tblIdx = immediates.tableIndex;
        if (tblIdx < 0 || tblIdx >= tables.length) fail(ins, `unknown table ${tblIdx}`);
        if (!typeEnv.isValueSubtype(tables[tblIdx].elemType, { kind: 'ref', nullable: true, heapType: 'func' })) {
          fail(ins, `call_indirect table ${tblIdx} element type must be a funcref subtype`);
        }
        const calleeType = typeEnv.get(immediates.typeIndex);
        if (calleeType.kind !== 'func') fail(ins, `type ${immediates.typeIndex} is not a function type`);
        popVal(ins, I32_TYPE);
        popVals(ins, calleeType.params);
        if (name === 'return_call_indirect') {
          if (calleeType.results.length !== funcType.results.length) {
            fail(ins, 'return_call_indirect result arity mismatch');
          }
          for (let i = 0; i < calleeType.results.length; i++) {
            if (!typeEnv.isValueSubtype(calleeType.results[i], funcType.results[i])) {
              fail(ins, 'return_call_indirect result type mismatch');
            }
          }
          markUnreachable();
        } else {
          pushVals(calleeType.results);
        }
        break;
      }
      case 'call_ref':
      case 'return_call_ref': {
        const calleeType = typeEnv.get(immediates.typeIndex);
        if (calleeType.kind !== 'func') fail(ins, `type ${immediates.typeIndex} is not a function type`);
        popVal(ins, { kind: 'ref', nullable: true, heapType: immediates.typeIndex });
        popVals(ins, calleeType.params);
        if (name === 'return_call_ref') {
          if (calleeType.results.length !== funcType.results.length) {
            fail(ins, 'return_call_ref result arity mismatch');
          }
          for (let i = 0; i < calleeType.results.length; i++) {
            if (!typeEnv.isValueSubtype(calleeType.results[i], funcType.results[i])) {
              fail(ins, 'return_call_ref result type mismatch');
            }
          }
          markUnreachable();
        } else {
          pushVals(calleeType.results);
        }
        break;
      }
      case 'throw': {
        const tagIdx = immediates.tagIndex;
        if (tagIdx < 0 || tagIdx >= tags.length) fail(ins, `unknown tag ${tagIdx}`);
        popVals(ins, tags[tagIdx].funcType.params);
        markUnreachable();
        break;
      }
      case 'throw_ref': {
        popVal(ins, { kind: 'ref', nullable: true, heapType: 'exn' });
        markUnreachable();
        break;
      }
      case 'rethrow': {
        if (!legacyExceptions) fail(ins, 'legacy rethrow instruction is disabled');
        const target = getLabelFrame(ins, immediates.labelIndex);
        if (target.kind !== 'try' || !target.inCatch) {
          fail(ins, 'rethrow target is not an enclosing catch block');
        }
        jumpTable[pc] = {
          kind: 'rethrow',
          labelIndex: immediates.labelIndex,
          targetTryPc: target.startPc
        };
        markUnreachable();
        break;
      }
      case 'drop':
        popVal(ins);
        break;
      case 'select': {
        popVal(ins, I32_TYPE);
        const t2 = popVal(ins);
        const t1 = popVal(ins);
        if (t1.kind === 'bot') {
          pushVal(t2);
        } else if (t2.kind === 'bot') {
          pushVal(t1);
        } else {
          const isNumOrVec1 = t1.kind === 'num' || t1.kind === 'vec';
          const isNumOrVec2 = t2.kind === 'num' || t2.kind === 'vec';
          if (!isNumOrVec1 || !isNumOrVec2 || t1.name !== t2.name) {
            fail(ins, `untyped select requires matching numeric/vector types, got ${formatValType(t1)} and ${formatValType(t2)}`);
          }
          pushVal(t1);
        }
        break;
      }
      case 'select_t': {
        if (!immediates.types || immediates.types.length !== 1) {
          fail(ins, 'select_t requires exactly 1 result type');
        }
        const expected = normalizeValType(immediates.types[0]);
        popVal(ins, I32_TYPE);
        popVal(ins, expected);
        popVal(ins, expected);
        pushVal(expected);
        break;
      }
      case 'local.get': {
        const idx = immediates.localIndex;
        if (idx < 0 || idx >= localTypes.length) fail(ins, `unknown local ${idx}`);
        if (!initLocals[idx]) fail(ins, `uninitialized non-defaultable local ${idx}`);
        pushVal(localTypes[idx]);
        break;
      }
      case 'local.set': {
        const idx = immediates.localIndex;
        if (idx < 0 || idx >= localTypes.length) fail(ins, `unknown local ${idx}`);
        popVal(ins, localTypes[idx]);
        initLocals[idx] = true;
        break;
      }
      case 'local.tee': {
        const idx = immediates.localIndex;
        if (idx < 0 || idx >= localTypes.length) fail(ins, `unknown local ${idx}`);
        popVal(ins, localTypes[idx]);
        initLocals[idx] = true;
        pushVal(localTypes[idx]);
        break;
      }
      case 'global.get': {
        const idx = immediates.globalIndex;
        if (idx < 0 || idx >= globals.length) fail(ins, `unknown global ${idx}`);
        pushVal(globals[idx].valType);
        break;
      }
      case 'global.set': {
        const idx = immediates.globalIndex;
        if (idx < 0 || idx >= globals.length) fail(ins, `unknown global ${idx}`);
        if (!globals[idx].mutable) fail(ins, `global ${idx} is immutable`);
        popVal(ins, globals[idx].valType);
        break;
      }
      case 'table.get': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, I32_TYPE);
        pushVal(tables[idx].elemType);
        break;
      }
      case 'table.set': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, tables[idx].elemType);
        popVal(ins, I32_TYPE);
        break;
      }
      case 'table.size': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        pushVal(I32_TYPE);
        break;
      }
      case 'table.grow': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, I32_TYPE);
        popVal(ins, tables[idx].elemType);
        pushVal(I32_TYPE);
        break;
      }
      case 'table.fill': {
        const idx = immediates.tableIndex;
        if (idx < 0 || idx >= tables.length) fail(ins, `unknown table ${idx}`);
        popVal(ins, I32_TYPE);
        popVal(ins, tables[idx].elemType);
        popVal(ins, I32_TYPE);
        break;
      }
      case 'table.copy': {
        const dst = immediates.destinationTable;
        const src = immediates.sourceTable;
        if (dst < 0 || dst >= tables.length) fail(ins, `unknown destination table ${dst}`);
        if (src < 0 || src >= tables.length) fail(ins, `unknown source table ${src}`);
        if (!typeEnv.isValueSubtype(tables[src].elemType, tables[dst].elemType)) {
          fail(ins, 'table.copy element type mismatch');
        }
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'table.init': {
        const tblIdx = immediates.tableIndex;
        const elemIdx = immediates.elementIndex;
        if (tblIdx < 0 || tblIdx >= tables.length) fail(ins, `unknown table ${tblIdx}`);
        if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
        if (!typeEnv.isValueSubtype(elementSegments[elemIdx].elemType, tables[tblIdx].elemType)) {
          fail(ins, 'table.init element type mismatch');
        }
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'elem.drop': {
        const elemIdx = immediates.elementIndex;
        if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
        break;
      }
      case 'memory.size': {
        requireMemory(ins, immediates.memoryIndex);
        pushVal(I32_TYPE);
        break;
      }
      case 'memory.grow': {
        requireMemory(ins, immediates.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(I32_TYPE);
        break;
      }
      case 'memory.fill': {
        requireMemory(ins, immediates.memoryIndex);
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'memory.copy': {
        requireMemory(ins, immediates.destinationMemory);
        requireMemory(ins, immediates.sourceMemory);
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'memory.init': {
        requireMemory(ins, immediates.memoryIndex);
        requireDataCount(ins, immediates.dataIndex);
        popVals(ins, [I32_TYPE, I32_TYPE, I32_TYPE]);
        break;
      }
      case 'data.drop': {
        requireDataCount(ins, immediates.dataIndex);
        break;
      }
      case 'ref.null': {
        const ht = normalizeHeapType(immediates.heapType);
        if (typeof ht === 'number') typeEnv.get(ht);
        pushVal({ kind: 'ref', nullable: true, heapType: ht });
        break;
      }
      case 'ref.is_null': {
        const v = popVal(ins);
        if (v.kind !== 'ref' && v.kind !== 'bot') fail(ins, 'ref.is_null requires a reference type');
        pushVal(I32_TYPE);
        break;
      }
      case 'ref.as_non_null': {
        const v = popVal(ins);
        if (v.kind === 'bot') {
          pushVal(BOT_TYPE);
        } else if (v.kind === 'ref') {
          pushVal({ kind: 'ref', nullable: false, heapType: v.heapType });
        } else {
          fail(ins, 'ref.as_non_null requires a reference type');
        }
        break;
      }
      case 'ref.eq': {
        const eqRef = { kind: 'ref', nullable: true, heapType: 'eq' };
        popVal(ins, eqRef);
        popVal(ins, eqRef);
        pushVal(I32_TYPE);
        break;
      }
      case 'ref.func': {
        const fnIdx = immediates.functionIndex;
        if (fnIdx < 0 || fnIdx >= functions.length) fail(ins, `unknown function ${fnIdx}`);
        if (declaredFunctions && !declaredFunctions.has(fnIdx)) {
          fail(ins, `undeclared function reference ${fnIdx}`);
        }
        pushVal({ kind: 'ref', nullable: false, heapType: functions[fnIdx].typeIndex });
        break;
      }

      // Constants
      case 'i32.const': pushVal(I32_TYPE); break;
      case 'i64.const': pushVal(I64_TYPE); break;
      case 'f32.const': pushVal(F32_TYPE); break;
      case 'f64.const': pushVal(F64_TYPE); break;

      // Scalar loads & stores
      case 'i32.load':
      case 'i32.load8_s':
      case 'i32.load8_u':
      case 'i32.load16_s':
      case 'i32.load16_u':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(I32_TYPE);
        break;
      case 'i64.load':
      case 'i64.load8_s':
      case 'i64.load8_u':
      case 'i64.load16_s':
      case 'i64.load16_u':
      case 'i64.load32_s':
      case 'i64.load32_u':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(I64_TYPE);
        break;
      case 'f32.load':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(F32_TYPE);
        break;
      case 'f64.load':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVal(ins, I32_TYPE);
        pushVal(F64_TYPE);
        break;
      case 'i32.store':
      case 'i32.store8':
      case 'i32.store16':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, I32_TYPE]);
        break;
      case 'i64.store':
      case 'i64.store8':
      case 'i64.store16':
      case 'i64.store32':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, I64_TYPE]);
        break;
      case 'f32.store':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, F32_TYPE]);
        break;
      case 'f64.store':
        requireMemory(ins, immediates.memarg.memoryIndex);
        popVals(ins, [I32_TYPE, F64_TYPE]);
        break;

      default: {
        if (opcode === 0xfb) {
          validateGCInstruction(ins, { typeEnv, dataSegments, elementSegments, requireDataCount, popVal, popVals, pushVal, fail });
        } else if (opcode === 0xfd) {
          validateSIMDInstruction(ins, { requireMemory, popVal, popVals, pushVal, fail });
        } else {
          validateScalarNumericInstruction(ins, { popVal, popVals, pushVal, fail });
        }
        break;
      }
    }
  }

  if (ctrlStack.length !== 0) {
    throw new ValidationError(`Function ${funcIndex}: unclosed control frames at end of body`, {
      functionIndex: funcIndex,
      offset: body.endOffset
    });
  }

  return {
    localTypes,
    jumpTable
  };
}

function validateScalarNumericInstruction(ins, { popVal, popVals, pushVal, fail }) {
  const { name } = ins;
  switch (name) {
    case 'i32.eqz':
    case 'i32.clz':
    case 'i32.ctz':
    case 'i32.popcnt':
    case 'i32.extend8_s':
    case 'i32.extend16_s':
      popVal(ins, I32_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i32.eq':
    case 'i32.ne':
    case 'i32.lt_s':
    case 'i32.lt_u':
    case 'i32.gt_s':
    case 'i32.gt_u':
    case 'i32.le_s':
    case 'i32.le_u':
    case 'i32.ge_s':
    case 'i32.ge_u':
    case 'i32.add':
    case 'i32.sub':
    case 'i32.mul':
    case 'i32.div_s':
    case 'i32.div_u':
    case 'i32.rem_s':
    case 'i32.rem_u':
    case 'i32.and':
    case 'i32.or':
    case 'i32.xor':
    case 'i32.shl':
    case 'i32.shr_s':
    case 'i32.shr_u':
    case 'i32.rotl':
    case 'i32.rotr':
      popVals(ins, [I32_TYPE, I32_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'i64.eqz':
    case 'i32.wrap_i64':
      popVal(ins, I64_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i64.eq':
    case 'i64.ne':
    case 'i64.lt_s':
    case 'i64.lt_u':
    case 'i64.gt_s':
    case 'i64.gt_u':
    case 'i64.le_s':
    case 'i64.le_u':
    case 'i64.ge_s':
    case 'i64.ge_u':
      popVals(ins, [I64_TYPE, I64_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'i64.clz':
    case 'i64.ctz':
    case 'i64.popcnt':
    case 'i64.extend8_s':
    case 'i64.extend16_s':
    case 'i64.extend32_s':
      popVal(ins, I64_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'i64.add':
    case 'i64.sub':
    case 'i64.mul':
    case 'i64.div_s':
    case 'i64.div_u':
    case 'i64.rem_s':
    case 'i64.rem_u':
    case 'i64.and':
    case 'i64.or':
    case 'i64.xor':
    case 'i64.shl':
    case 'i64.shr_s':
    case 'i64.shr_u':
    case 'i64.rotl':
    case 'i64.rotr':
      popVals(ins, [I64_TYPE, I64_TYPE]);
      pushVal(I64_TYPE);
      break;
    case 'f32.eq':
    case 'f32.ne':
    case 'f32.lt':
    case 'f32.gt':
    case 'f32.le':
    case 'f32.ge':
      popVals(ins, [F32_TYPE, F32_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'f64.eq':
    case 'f64.ne':
    case 'f64.lt':
    case 'f64.gt':
    case 'f64.le':
    case 'f64.ge':
      popVals(ins, [F64_TYPE, F64_TYPE]);
      pushVal(I32_TYPE);
      break;
    case 'f32.abs':
    case 'f32.neg':
    case 'f32.ceil':
    case 'f32.floor':
    case 'f32.trunc':
    case 'f32.nearest':
    case 'f32.sqrt':
      popVal(ins, F32_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f32.add':
    case 'f32.sub':
    case 'f32.mul':
    case 'f32.div':
    case 'f32.min':
    case 'f32.max':
    case 'f32.copysign':
      popVals(ins, [F32_TYPE, F32_TYPE]);
      pushVal(F32_TYPE);
      break;
    case 'f64.abs':
    case 'f64.neg':
    case 'f64.ceil':
    case 'f64.floor':
    case 'f64.trunc':
    case 'f64.nearest':
    case 'f64.sqrt':
      popVal(ins, F64_TYPE);
      pushVal(F64_TYPE);
      break;
    case 'f64.add':
    case 'f64.sub':
    case 'f64.mul':
    case 'f64.div':
    case 'f64.min':
    case 'f64.max':
    case 'f64.copysign':
      popVals(ins, [F64_TYPE, F64_TYPE]);
      pushVal(F64_TYPE);
      break;
    case 'i32.trunc_f32_s':
    case 'i32.trunc_f32_u':
    case 'i32.trunc_sat_f32_s':
    case 'i32.trunc_sat_f32_u':
    case 'i32.reinterpret_f32':
      popVal(ins, F32_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i32.trunc_f64_s':
    case 'i32.trunc_f64_u':
    case 'i32.trunc_sat_f64_s':
    case 'i32.trunc_sat_f64_u':
      popVal(ins, F64_TYPE);
      pushVal(I32_TYPE);
      break;
    case 'i64.extend_i32_s':
    case 'i64.extend_i32_u':
      popVal(ins, I32_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'i64.trunc_f32_s':
    case 'i64.trunc_f32_u':
    case 'i64.trunc_sat_f32_s':
    case 'i64.trunc_sat_f32_u':
      popVal(ins, F32_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'i64.trunc_f64_s':
    case 'i64.trunc_f64_u':
    case 'i64.trunc_sat_f64_s':
    case 'i64.trunc_sat_f64_u':
    case 'i64.reinterpret_f64':
      popVal(ins, F64_TYPE);
      pushVal(I64_TYPE);
      break;
    case 'f32.convert_i32_s':
    case 'f32.convert_i32_u':
    case 'f32.reinterpret_i32':
      popVal(ins, I32_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f32.convert_i64_s':
    case 'f32.convert_i64_u':
      popVal(ins, I64_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f32.demote_f64':
      popVal(ins, F64_TYPE);
      pushVal(F32_TYPE);
      break;
    case 'f64.convert_i32_s':
    case 'f64.convert_i32_u':
      popVal(ins, I32_TYPE);
      pushVal(F64_TYPE);
      break;
    case 'f64.convert_i64_s':
    case 'f64.convert_i64_u':
    case 'f64.reinterpret_i64':
      popVal(ins, I64_TYPE);
      pushVal(F64_TYPE);
      break;
    case 'f64.promote_f32':
      popVal(ins, F32_TYPE);
      pushVal(F64_TYPE);
      break;
    default:
      fail(ins, `unhandled instruction ${name}`);
  }
}

function validateGCInstruction(ins, { typeEnv, elementSegments, requireDataCount, popVal, popVals, pushVal, fail }) {
  const { name, immediates } = ins;
  switch (name) {
    case 'ref.i31':
      popVal(ins, I32_TYPE);
      pushVal({ kind: 'ref', nullable: false, heapType: 'i31' });
      break;
    case 'i31.get_s':
    case 'i31.get_u':
      popVal(ins, { kind: 'ref', nullable: true, heapType: 'i31' });
      pushVal(I32_TYPE);
      break;
    case 'struct.new': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      popVals(ins, def.fields.map(f => unpackedValType(f.storage)));
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'struct.new_default': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      for (const f of def.fields) {
        if (!isDefaultable(f.storage)) fail(ins, 'struct.new_default field is not defaultable');
      }
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'struct.get':
    case 'struct.get_s':
    case 'struct.get_u': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      if (immediates.fieldIndex < 0 || immediates.fieldIndex >= def.fields.length) {
        fail(ins, `struct field index ${immediates.fieldIndex} out of bounds`);
      }
      const field = def.fields[immediates.fieldIndex];
      const isPacked = field.storage.kind === 'packed';
      if (name === 'struct.get' && isPacked) fail(ins, 'struct.get cannot read packed field; use struct.get_s/u');
      if (name !== 'struct.get' && !isPacked) fail(ins, `${name} requires packed field`);
      popVal(ins, { kind: 'ref', nullable: true, heapType: immediates.typeIndex });
      pushVal(unpackedValType(field.storage));
      break;
    }
    case 'struct.set': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'struct') fail(ins, `type ${immediates.typeIndex} is not a struct`);
      if (immediates.fieldIndex < 0 || immediates.fieldIndex >= def.fields.length) {
        fail(ins, `struct field index ${immediates.fieldIndex} out of bounds`);
      }
      const field = def.fields[immediates.fieldIndex];
      if (!field.mutable) fail(ins, `struct field ${immediates.fieldIndex} is immutable`);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        unpackedValType(field.storage)
      ]);
      break;
    }
    case 'array.new': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      popVals(ins, [unpackedValType(def.field.storage), I32_TYPE]);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_default': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!isDefaultable(def.field.storage)) fail(ins, 'array.new_default element is not defaultable');
      popVal(ins, I32_TYPE);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_fixed': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const elemType = unpackedValType(def.field.storage);
      for (let i = 0; i < immediates.length; i++) popVal(ins, elemType);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_data': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const st = def.field.storage;
      if (st.kind !== 'num' && st.kind !== 'packed' && st.kind !== 'vec') {
        fail(ins, 'array.new_data requires numeric, vector, or packed element storage');
      }
      requireDataCount(ins, immediates.dataIndex);
      popVals(ins, [I32_TYPE, I32_TYPE]);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.new_elem': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const elemIdx = immediates.elementIndex;
      if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
      if (!typeEnv.isValueSubtype(elementSegments[elemIdx].elemType, unpackedValType(def.field.storage))) {
        fail(ins, 'array.new_elem element type mismatch');
      }
      popVals(ins, [I32_TYPE, I32_TYPE]);
      pushVal({ kind: 'ref', nullable: false, heapType: immediates.typeIndex });
      break;
    }
    case 'array.get':
    case 'array.get_s':
    case 'array.get_u': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      const isPacked = def.field.storage.kind === 'packed';
      if (name === 'array.get' && isPacked) fail(ins, 'array.get cannot read packed element; use array.get_s/u');
      if (name !== 'array.get' && !isPacked) fail(ins, `${name} requires packed element`);
      popVals(ins, [{ kind: 'ref', nullable: true, heapType: immediates.typeIndex }, I32_TYPE]);
      pushVal(unpackedValType(def.field.storage));
      break;
    }
    case 'array.set': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, `array type ${immediates.typeIndex} is immutable`);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        unpackedValType(def.field.storage)
      ]);
      break;
    }
    case 'array.len':
      popVal(ins, { kind: 'ref', nullable: true, heapType: 'array' });
      pushVal(I32_TYPE);
      break;
    case 'array.fill': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, `array type ${immediates.typeIndex} is immutable`);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        unpackedValType(def.field.storage),
        I32_TYPE
      ]);
      break;
    }
    case 'array.copy': {
      const dstDef = typeEnv.get(immediates.destinationType);
      const srcDef = typeEnv.get(immediates.sourceType);
      if (dstDef.kind !== 'array' || srcDef.kind !== 'array') fail(ins, 'array.copy requires array types');
      if (!dstDef.field.mutable) fail(ins, 'array.copy destination array is immutable');
      if (!typeEnv.isStorageSubtype(srcDef.field.storage, dstDef.field.storage)) {
        fail(ins, 'array.copy storage type mismatch');
      }
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.destinationType },
        I32_TYPE,
        { kind: 'ref', nullable: true, heapType: immediates.sourceType },
        I32_TYPE,
        I32_TYPE
      ]);
      break;
    }
    case 'array.init_data': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, 'array.init_data target array is immutable');
      const st = def.field.storage;
      if (st.kind !== 'num' && st.kind !== 'packed' && st.kind !== 'vec') {
        fail(ins, 'array.init_data requires numeric, vector, or packed element storage');
      }
      requireDataCount(ins, immediates.dataIndex);
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        I32_TYPE,
        I32_TYPE
      ]);
      break;
    }
    case 'array.init_elem': {
      const def = typeEnv.get(immediates.typeIndex);
      if (def.kind !== 'array') fail(ins, `type ${immediates.typeIndex} is not an array`);
      if (!def.field.mutable) fail(ins, 'array.init_elem target array is immutable');
      const elemIdx = immediates.elementIndex;
      if (elemIdx < 0 || elemIdx >= elementSegments.length) fail(ins, `unknown element segment ${elemIdx}`);
      if (!typeEnv.isValueSubtype(elementSegments[elemIdx].elemType, unpackedValType(def.field.storage))) {
        fail(ins, 'array.init_elem element type mismatch');
      }
      popVals(ins, [
        { kind: 'ref', nullable: true, heapType: immediates.typeIndex },
        I32_TYPE,
        I32_TYPE,
        I32_TYPE
      ]);
      break;
    }
    case 'ref.test':
    case 'ref.test_null': {
      const ht = normalizeHeapType(immediates.heapType);
      if (typeof ht === 'number') typeEnv.get(ht);
      const top = heapHierarchy(ht, typeEnv);
      popVal(ins, { kind: 'ref', nullable: true, heapType: top });
      pushVal(I32_TYPE);
      break;
    }
    case 'ref.cast':
    case 'ref.cast_null': {
      const ht = normalizeHeapType(immediates.heapType);
      if (typeof ht === 'number') typeEnv.get(ht);
      const top = heapHierarchy(ht, typeEnv);
      popVal(ins, { kind: 'ref', nullable: true, heapType: top });
      pushVal({ kind: 'ref', nullable: Boolean(immediates.nullable), heapType: ht });
      break;
    }
    case 'any.convert_extern': {
      const got = popVal(ins, { kind: 'ref', nullable: true, heapType: 'extern' });
      pushVal({ kind: 'ref', nullable: got.kind === 'bot' ? false : got.nullable, heapType: 'any' });
      break;
    }
    case 'extern.convert_any': {
      const got = popVal(ins, { kind: 'ref', nullable: true, heapType: 'any' });
      pushVal({ kind: 'ref', nullable: got.kind === 'bot' ? false : got.nullable, heapType: 'extern' });
      break;
    }
    default:
      fail(ins, `unhandled GC instruction ${name}`);
  }
}

function validateSIMDInstruction(ins, { requireMemory, popVal, popVals, pushVal, fail }) {
  const { name, immediates } = ins;
  if (name === 'v128.const') {
    pushVal(V128_TYPE);
    return;
  }
  if (name.startsWith('v128.load')) {
    requireMemory(ins, immediates.memarg.memoryIndex);
    if (name.endsWith('_lane')) {
      popVals(ins, [I32_TYPE, V128_TYPE]);
    } else {
      popVal(ins, I32_TYPE);
    }
    pushVal(V128_TYPE);
    return;
  }
  if (name.startsWith('v128.store')) {
    requireMemory(ins, immediates.memarg.memoryIndex);
    popVals(ins, [I32_TYPE, V128_TYPE]);
    return;
  }
  if (name === 'i8x16.splat' || name === 'i16x8.splat' || name === 'i32x4.splat') {
    popVal(ins, I32_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'i64x2.splat') {
    popVal(ins, I64_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f32x4.splat') {
    popVal(ins, F32_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f64x2.splat') {
    popVal(ins, F64_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'i8x16.extract_lane_s' || name === 'i8x16.extract_lane_u' ||
      name === 'i16x8.extract_lane_s' || name === 'i16x8.extract_lane_u' ||
      name === 'i32x4.extract_lane' || name === 'v128.any_true' ||
      name.endsWith('.all_true') || name.endsWith('.bitmask')) {
    popVal(ins, V128_TYPE);
    pushVal(I32_TYPE);
    return;
  }
  if (name === 'i64x2.extract_lane') {
    popVal(ins, V128_TYPE);
    pushVal(I64_TYPE);
    return;
  }
  if (name === 'f32x4.extract_lane') {
    popVal(ins, V128_TYPE);
    pushVal(F32_TYPE);
    return;
  }
  if (name === 'f64x2.extract_lane') {
    popVal(ins, V128_TYPE);
    pushVal(F64_TYPE);
    return;
  }
  if (name === 'i8x16.replace_lane' || name === 'i16x8.replace_lane' || name === 'i32x4.replace_lane' ||
      name.endsWith('.shl') || name.endsWith('.shr_s') || name.endsWith('.shr_u')) {
    popVals(ins, [V128_TYPE, I32_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'i64x2.replace_lane') {
    popVals(ins, [V128_TYPE, I64_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f32x4.replace_lane') {
    popVals(ins, [V128_TYPE, F32_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'f64x2.replace_lane') {
    popVals(ins, [V128_TYPE, F64_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  if (name === 'v128.bitselect') {
    popVals(ins, [V128_TYPE, V128_TYPE, V128_TYPE]);
    pushVal(V128_TYPE);
    return;
  }
  const unarySIMD = new Set([
    'v128.not',
    'i8x16.abs', 'i8x16.neg', 'i8x16.popcnt',
    'i16x8.abs', 'i16x8.neg',
    'i16x8.extadd_pairwise_i8x16_s', 'i16x8.extadd_pairwise_i8x16_u',
    'i16x8.extend_low_i8x16_s', 'i16x8.extend_high_i8x16_s',
    'i16x8.extend_low_i8x16_u', 'i16x8.extend_high_i8x16_u',
    'i32x4.abs', 'i32x4.neg',
    'i32x4.extadd_pairwise_i16x8_s', 'i32x4.extadd_pairwise_i16x8_u',
    'i32x4.extend_low_i16x8_s', 'i32x4.extend_high_i16x8_s',
    'i32x4.extend_low_i16x8_u', 'i32x4.extend_high_i16x8_u',
    'i64x2.abs', 'i64x2.neg',
    'i64x2.extend_low_i32x4_s', 'i64x2.extend_high_i32x4_s',
    'i64x2.extend_low_i32x4_u', 'i64x2.extend_high_i32x4_u',
    'f32x4.abs', 'f32x4.neg', 'f32x4.sqrt', 'f32x4.ceil', 'f32x4.floor', 'f32x4.trunc', 'f32x4.nearest',
    'f64x2.abs', 'f64x2.neg', 'f64x2.sqrt', 'f64x2.ceil', 'f64x2.floor', 'f64x2.trunc', 'f64x2.nearest',
    'f32x4.demote_f64x2_zero', 'f64x2.promote_low_f32x4',
    'i32x4.trunc_sat_f32x4_s', 'i32x4.trunc_sat_f32x4_u',
    'f32x4.convert_i32x4_s', 'f32x4.convert_i32x4_u',
    'i32x4.trunc_sat_f64x2_s_zero', 'i32x4.trunc_sat_f64x2_u_zero',
    'f64x2.convert_low_i32x4_s', 'f64x2.convert_low_i32x4_u'
  ]);
  if (unarySIMD.has(name)) {
    popVal(ins, V128_TYPE);
    pushVal(V128_TYPE);
    return;
  }
  popVals(ins, [V128_TYPE, V128_TYPE]);
  pushVal(V128_TYPE);
}

function validateModule(decoded, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };

  if (decoded.bytes && decoded.bytes.byteLength > limits.maxModuleBytes) {
    throw new ResourceLimitError(`Module size (${decoded.bytes.byteLength}) exceeds maxModuleBytes (${limits.maxModuleBytes})`);
  }
  if (decoded.typeSection.length > limits.maxTypes) {
    throw new ResourceLimitError(`Type count (${decoded.typeSection.length}) exceeds maxTypes (${limits.maxTypes})`);
  }
  if (decoded.importSection.length > limits.maxImports) {
    throw new ResourceLimitError(`Import count (${decoded.importSection.length}) exceeds maxImports (${limits.maxImports})`);
  }
  if (decoded.exportSection.length > limits.maxExports) {
    throw new ResourceLimitError(`Export count (${decoded.exportSection.length}) exceeds maxExports (${limits.maxExports})`);
  }
  if (decoded.dataSection.length > limits.maxDataSegments) {
    throw new ResourceLimitError(`Data segment count (${decoded.dataSection.length}) exceeds maxDataSegments (${limits.maxDataSegments})`);
  }
  if (decoded.elementSection.length > limits.maxElementSegments) {
    throw new ResourceLimitError(`Element segment count (${decoded.elementSection.length}) exceeds maxElementSegments (${limits.maxElementSegments})`);
  }

  if (decoded.functionSection.length !== decoded.codeSection.length) {
    throw new ValidationError(
      `Function section count (${decoded.functionSection.length}) does not match code section count (${decoded.codeSection.length})`
    );
  }
  if (decoded.dataCountSection !== null && decoded.dataCountSection !== decoded.dataSection.length) {
    throw new ValidationError(
      `DataCount section (${decoded.dataCountSection}) does not match data section count (${decoded.dataSection.length})`
    );
  }

  const typeEnv = new TypeEnvironment(decoded.typeSection, decoded.typeGroups);
  typeEnv.validateSubtyping();

  const functions = [];
  const tables = [];
  const memories = [];
  const globals = [];
  const tags = [];

  for (const imp of decoded.importSection) {
    switch (imp.kind) {
      case 0x00: {
        const def = typeEnv.get(imp.typeIdx);
        if (def.kind !== 'func') throw new ValidationError(`Imported function type ${imp.typeIdx} is not a func type`);
        functions.push({ imported: true, module: imp.module, name: imp.name, typeIndex: imp.typeIdx, funcType: def });
        break;
      }
      case 0x01: {
        const elemType = normalizeValType(imp.tableType.elemType);
        if (elemType.kind !== 'ref') throw new ValidationError('Table element type must be a reference type');
        if (typeof elemType.heapType === 'number') typeEnv.get(elemType.heapType);
        tables.push({ imported: true, module: imp.module, name: imp.name, elemType, limits: imp.tableType.limits });
        break;
      }
      case 0x02: {
        memories.push({ imported: true, module: imp.module, name: imp.name, limits: imp.memoryType });
        break;
      }
      case 0x03: {
        const valType = normalizeValType(imp.globalType.valType);
        if (valType.kind === 'ref' && typeof valType.heapType === 'number') typeEnv.get(valType.heapType);
        globals.push({ imported: true, module: imp.module, name: imp.name, valType, mutable: Boolean(imp.globalType.mutable) });
        break;
      }
      case 0x04: {
        const def = typeEnv.get(imp.typeIdx);
        if (def.kind !== 'func' || def.results.length !== 0) {
          throw new ValidationError(`Imported tag type ${imp.typeIdx} must be a function type with empty results`);
        }
        tags.push({ imported: true, module: imp.module, name: imp.name, typeIndex: imp.typeIdx, funcType: def });
        break;
      }
      default:
        throw new ValidationError(`Unknown import kind ${imp.kind}`);
    }
  }

  const importedCounts = {
    functions: functions.length,
    tables: tables.length,
    memories: memories.length,
    globals: globals.length,
    tags: tags.length
  };

  for (let i = 0; i < decoded.functionSection.length; i++) {
    const typeIdx = decoded.functionSection[i];
    const def = typeEnv.get(typeIdx);
    if (def.kind !== 'func') throw new ValidationError(`Function ${functions.length} type ${typeIdx} is not a func type`);
    functions.push({
      imported: false,
      localIndex: i,
      typeIndex: typeIdx,
      funcType: def,
      body: decoded.codeSection[i]
    });
  }

  for (const tbl of decoded.tableSection) {
    const elemType = normalizeValType(tbl.elemType);
    if (elemType.kind !== 'ref') throw new ValidationError('Table element type must be a reference type');
    if (typeof elemType.heapType === 'number') typeEnv.get(elemType.heapType);
    if (!isDefaultable(elemType)) {
      throw new ValidationError(`Defined table element type ${formatValType(elemType)} must be nullable/defaultable`);
    }
    tables.push({ imported: false, elemType, limits: tbl.limits });
  }

  for (const mem of decoded.memorySection) {
    memories.push({ imported: false, limits: mem });
  }

  for (const tag of decoded.tagSection) {
    const def = typeEnv.get(tag.typeIdx);
    if (def.kind !== 'func' || def.results.length !== 0) {
      throw new ValidationError(`Tag type ${tag.typeIdx} must be a function type with empty results`);
    }
    tags.push({ imported: false, typeIndex: tag.typeIdx, funcType: def });
  }

  if (functions.length > limits.maxFunctions) throw new ResourceLimitError(`Total functions exceed maxFunctions (${limits.maxFunctions})`);
  if (tables.length > limits.maxTables) throw new ResourceLimitError(`Total tables exceed maxTables (${limits.maxTables})`);
  if (memories.length > limits.maxMemories) throw new ResourceLimitError(`Total memories exceed maxMemories (${limits.maxMemories})`);
  if (tags.length > limits.maxTags) throw new ResourceLimitError(`Total tags exceed maxTags (${limits.maxTags})`);

  const declaredFunctions = new Set();

  // Globals: constant expression can only reference preceding globals (or imported globals)
  for (let i = 0; i < decoded.globalSection.length; i++) {
    const g = decoded.globalSection[i];
    const valType = normalizeValType(g.globalType.valType);
    if (valType.kind === 'ref' && typeof valType.heapType === 'number') typeEnv.get(valType.heapType);
    const visibleGlobalsCount = globals.length;
    validateConstantExpression(g.initializer, valType, {
      typeEnv,
      globals,
      importedGlobalCount: importedCounts.globals,
      visibleGlobalsCount,
      functions,
      declaredFunctions
    });
    globals.push({
      imported: false,
      valType,
      mutable: Boolean(g.globalType.mutable),
      initializer: g.initializer
    });
  }
  if (globals.length > limits.maxGlobals) throw new ResourceLimitError(`Total globals exceed maxGlobals (${limits.maxGlobals})`);

  // Element segments
  const elementSegments = [];
  for (let i = 0; i < decoded.elementSection.length; i++) {
    const seg = decoded.elementSection[i];
    const elemType = normalizeValType(seg.reftype);
    if (elemType.kind !== 'ref') throw new ValidationError(`Element segment ${i} type must be a reference type`);
    if (typeof elemType.heapType === 'number') typeEnv.get(elemType.heapType);

    if (seg.mode === 'active') {
      if (seg.tableIndex < 0 || seg.tableIndex >= tables.length) {
        throw new ValidationError(`Element segment ${i} references unknown table ${seg.tableIndex}`);
      }
      if (!typeEnv.isValueSubtype(elemType, tables[seg.tableIndex].elemType)) {
        throw new ValidationError(`Element segment ${i} type ${formatValType(elemType)} is not a subtype of table ${seg.tableIndex} element type`);
      }
      validateConstantExpression(seg.offsetExpression, I32_TYPE, {
        typeEnv,
        globals,
        importedGlobalCount: importedCounts.globals,
        visibleGlobalsCount: globals.length,
        functions,
        declaredFunctions: null
      });
    }

    if (seg.useExpressions) {
      for (const expr of seg.elementExpressions) {
        validateConstantExpression(expr, elemType, {
          typeEnv,
          globals,
          importedGlobalCount: importedCounts.globals,
          visibleGlobalsCount: globals.length,
          functions,
          declaredFunctions
        });
      }
    } else {
      for (const fnIdx of seg.elements) {
        if (fnIdx < 0 || fnIdx >= functions.length) {
          throw new ValidationError(`Element segment ${i} references unknown function ${fnIdx}`);
        }
        declaredFunctions.add(fnIdx);
      }
    }
    elementSegments.push({ ...seg, elemType });
  }

  // Data segments
  const dataSegments = [];
  for (let i = 0; i < decoded.dataSection.length; i++) {
    const seg = decoded.dataSection[i];
    if (seg.mode === 'active') {
      if (seg.memoryIndex < 0 || seg.memoryIndex >= memories.length) {
        throw new ValidationError(`Data segment ${i} references unknown memory ${seg.memoryIndex}`);
      }
      validateConstantExpression(seg.offsetExpression, I32_TYPE, {
        typeEnv,
        globals,
        importedGlobalCount: importedCounts.globals,
        visibleGlobalsCount: globals.length,
        functions,
        declaredFunctions: null
      });
    }
    dataSegments.push(seg);
  }

  // Exports
  const seenExports = new Set();
  for (const exp of decoded.exportSection) {
    if (seenExports.has(exp.name)) {
      throw new ValidationError(`Duplicate export name "${exp.name}"`);
    }
    seenExports.add(exp.name);
    switch (exp.kind) {
      case 0x00:
        if (exp.index < 0 || exp.index >= functions.length) throw new ValidationError(`Export "${exp.name}" references unknown function ${exp.index}`);
        declaredFunctions.add(exp.index);
        break;
      case 0x01:
        if (exp.index < 0 || exp.index >= tables.length) throw new ValidationError(`Export "${exp.name}" references unknown table ${exp.index}`);
        break;
      case 0x02:
        if (exp.index < 0 || exp.index >= memories.length) throw new ValidationError(`Export "${exp.name}" references unknown memory ${exp.index}`);
        break;
      case 0x03:
        if (exp.index < 0 || exp.index >= globals.length) throw new ValidationError(`Export "${exp.name}" references unknown global ${exp.index}`);
        break;
      case 0x04:
        if (exp.index < 0 || exp.index >= tags.length) throw new ValidationError(`Export "${exp.name}" references unknown tag ${exp.index}`);
        break;
      default:
        throw new ValidationError(`Invalid export kind ${exp.kind}`);
    }
  }

  // Start section
  if (decoded.startSection !== null) {
    const startIdx = decoded.startSection;
    if (startIdx < 0 || startIdx >= functions.length) {
      throw new ValidationError(`Start function ${startIdx} out of bounds`);
    }
    const stType = functions[startIdx].funcType;
    if (stType.params.length !== 0 || stType.results.length !== 0) {
      throw new ValidationError('Start function must have signature [] -> []');
    }
  }

  // Function bodies
  const moduleCtx = {
    typeEnv,
    functions,
    tables,
    memories,
    globals,
    tags,
    dataSegments,
    elementSegments,
    dataCountSection: decoded.dataCountSection,
    declaredFunctions
  };

  for (let i = importedCounts.functions; i < functions.length; i++) {
    const fn = functions[i];
    const compiled = validateFunctionBody(fn.body, i, fn.funcType, moduleCtx, options);
    fn.localTypes = compiled.localTypes;
    fn.jumpTable = compiled.jumpTable;
  }

  return {
    typeEnv,
    importedCounts,
    functions,
    tables,
    memories,
    globals,
    tags,
    dataSegments,
    elementSegments,
    declaredFunctions
  };
}

module.exports = {
  DEFAULT_LIMITS,
  unpackedValType,
  blockSignature,
  validateConstantExpression,
  validateFunctionBody,
  validateModule
};
