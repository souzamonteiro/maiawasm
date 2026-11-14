'use strict';

const { ValTypeName, PackedTypeName, HeapTypeName, heapTypeToString } = require('../wasm-binary.js');
const { ValidationError, Trap } = require('./errors.js');

const ABSTRACT_HEAP_TYPES = new Set([
  'func', 'extern', 'exn', 'any', 'eq', 'i31', 'struct', 'array',
  'none', 'nofunc', 'noexn', 'noextern'
]);

const CODE_TO_HEAP = {
  0x70: 'func',
  0x6f: 'extern',
  0x69: 'exn',
  0x6e: 'any',
  0x6d: 'eq',
  0x6c: 'i31',
  0x6b: 'struct',
  0x6a: 'array',
  0x71: 'none',
  0x73: 'nofunc',
  0x74: 'noexn',
  0x72: 'noextern'
};

function normalizeHeapType(ht) {
  if (typeof ht === 'string') {
    if (ABSTRACT_HEAP_TYPES.has(ht)) return ht;
    const n = Number(ht);
    if (Number.isInteger(n) && n >= 0) return n;
    throw new ValidationError(`Invalid heap type: ${ht}`);
  }
  if (typeof ht === 'number') {
    if (ht >= 0 && Number.isInteger(ht)) return ht;
    if (ht < 0) {
      const name = HeapTypeName[ht + 0x80];
      if (name) return name;
    }
    if (CODE_TO_HEAP[ht]) return CODE_TO_HEAP[ht];
  }
  if (ht && typeof ht === 'object' && typeof ht.canonicalId === 'string') {
    return ht;
  }
  throw new ValidationError(`Invalid heap type: ${JSON.stringify(ht)}`);
}

function normalizeValType(type) {
  if (!type && type !== 0) throw new ValidationError(`Invalid value type: ${type}`);
  if (typeof type === 'object') {
    if (type.kind === 'num' || type.kind === 'vec' || type.kind === 'packed' || type.kind === 'bot') {
      return type;
    }
    if (type.kind === 'ref') {
      return {
        kind: 'ref',
        nullable: Boolean(type.nullable),
        heapType: normalizeHeapType(type.heapType)
      };
    }
  }
  if (typeof type === 'number') {
    switch (type) {
      case 0x7f: return { kind: 'num', name: 'i32', code: 0x7f };
      case 0x7e: return { kind: 'num', name: 'i64', code: 0x7e };
      case 0x7d: return { kind: 'num', name: 'f32', code: 0x7d };
      case 0x7c: return { kind: 'num', name: 'f64', code: 0x7c };
      case 0x7b: return { kind: 'vec', name: 'v128', code: 0x7b };
      case 0x78: return { kind: 'packed', name: 'i8', code: 0x78 };
      case 0x77: return { kind: 'packed', name: 'i16', code: 0x77 };
      default:
        if (CODE_TO_HEAP[type]) {
          return { kind: 'ref', nullable: true, heapType: CODE_TO_HEAP[type] };
        }
    }
  }
  if (typeof type === 'string') {
    switch (type) {
      case 'i32': return { kind: 'num', name: 'i32', code: 0x7f };
      case 'i64': return { kind: 'num', name: 'i64', code: 0x7e };
      case 'f32': return { kind: 'num', name: 'f32', code: 0x7d };
      case 'f64': return { kind: 'num', name: 'f64', code: 0x7c };
      case 'v128': return { kind: 'vec', name: 'v128', code: 0x7b };
      case 'i8': return { kind: 'packed', name: 'i8', code: 0x78 };
      case 'i16': return { kind: 'packed', name: 'i16', code: 0x77 };
      case 'funcref': return { kind: 'ref', nullable: true, heapType: 'func' };
      case 'externref': return { kind: 'ref', nullable: true, heapType: 'extern' };
      case 'exnref': return { kind: 'ref', nullable: true, heapType: 'exn' };
      case 'anyref': return { kind: 'ref', nullable: true, heapType: 'any' };
      case 'eqref': return { kind: 'ref', nullable: true, heapType: 'eq' };
      case 'i31ref': return { kind: 'ref', nullable: true, heapType: 'i31' };
      case 'structref': return { kind: 'ref', nullable: true, heapType: 'struct' };
      case 'arrayref': return { kind: 'ref', nullable: true, heapType: 'array' };
      case 'nullref': return { kind: 'ref', nullable: true, heapType: 'none' };
      case 'nullfuncref': return { kind: 'ref', nullable: true, heapType: 'nofunc' };
      case 'nullexnref': return { kind: 'ref', nullable: true, heapType: 'noexn' };
      case 'nullexternref': return { kind: 'ref', nullable: true, heapType: 'noextern' };
      default:
        if (ABSTRACT_HEAP_TYPES.has(type)) {
          return { kind: 'ref', nullable: true, heapType: type };
        }
    }
  }
  throw new ValidationError(`Unknown value type: ${JSON.stringify(type)}`);
}

const BOT_TYPE = Object.freeze({ kind: 'bot', name: 'bot' });
const I32_TYPE = Object.freeze({ kind: 'num', name: 'i32', code: 0x7f });
const I64_TYPE = Object.freeze({ kind: 'num', name: 'i64', code: 0x7e });
const F32_TYPE = Object.freeze({ kind: 'num', name: 'f32', code: 0x7d });
const F64_TYPE = Object.freeze({ kind: 'num', name: 'f64', code: 0x7c });
const V128_TYPE = Object.freeze({ kind: 'vec', name: 'v128', code: 0x7b });

function formatValType(type) {
  const t = normalizeValType(type);
  if (t.kind === 'bot') return 'bot';
  if (t.kind === 'num' || t.kind === 'vec' || t.kind === 'packed') return t.name;
  if (t.kind === 'ref') {
    const ht = typeof t.heapType === 'object' ? t.heapType.canonicalId : t.heapType;
    return `(ref ${t.nullable ? 'null ' : ''}${ht})`;
  }
  return String(type);
}

function isDefaultable(type) {
  const t = normalizeValType(type);
  if (t.kind === 'num' || t.kind === 'vec' || t.kind === 'packed') return true;
  if (t.kind === 'ref') return t.nullable;
  return true;
}

function defaultValueForType(type) {
  const t = normalizeValType(type);
  if (t.kind === 'num') {
    if (t.name === 'i32') return 0;
    if (t.name === 'i64') return 0n;
    if (t.name === 'f32' || t.name === 'f64') return 0;
  }
  if (t.kind === 'packed') return 0;
  if (t.kind === 'vec') return new Uint8Array(16);
  if (t.kind === 'ref') {
    if (!t.nullable) throw new ValidationError(`Non-nullable reference type ${formatValType(t)} has no default value`);
    return null;
  }
  return 0;
}

function heapHierarchy(ht, typeEnv = null) {
  if (typeof ht === 'object' && ht !== null && ht.kind) {
    return ht.kind === 'func' ? 'func' : 'any';
  }
  const norm = normalizeHeapType(ht);
  if (typeof norm === 'number') {
    const def = typeEnv ? typeEnv.get(norm) : null;
    if (!def) throw new ValidationError(`Unknown type index ${norm}`);
    return def.kind === 'func' ? 'func' : 'any';
  }
  if (norm === 'func' || norm === 'nofunc') return 'func';
  if (norm === 'extern' || norm === 'noextern') return 'extern';
  if (norm === 'exn' || norm === 'noexn') return 'exn';
  return 'any';
}

class TypeEnvironment {
  constructor(typeSection = [], typeGroups = []) {
    this.rawTypes = typeSection;
    this.rawGroups = typeGroups.length > 0
      ? typeGroups
      : typeSection.map((_, idx) => ({ recursive: false, startIndex: idx, size: 1 }));
    this.types = [];
    this._build();
  }

  _build() {
    let groupIndex = 0;
    for (const group of this.rawGroups) {
      const { startIndex, size } = group;
      const endIndex = startIndex + size;
      if (endIndex > this.rawTypes.length) {
        throw new ValidationError(`Recursive type group exceeds type section bounds (${endIndex} > ${this.rawTypes.length})`);
      }
      // First create placeholder entries so intra-group references resolve bounds
      for (let idx = startIndex; idx < endIndex; idx++) {
        const raw = this.rawTypes[idx];
        const supertypes = raw.subtype && Array.isArray(raw.subtype.supertypes) ? raw.subtype.supertypes : [];
        if (supertypes.length > 1) {
          throw new ValidationError(`Type ${idx} has more than one supertype (${supertypes.length})`, { offset: raw.offset });
        }
        for (const sup of supertypes) {
          if (sup >= idx) {
            throw new ValidationError(`Type ${idx} references forward or self supertype ${sup}`, { offset: raw.offset });
          }
        }
        let normalized;
        if (raw.kind === 'func') {
          normalized = {
            index: idx,
            groupStart: startIndex,
            groupSize: size,
            groupOffset: idx - startIndex,
            kind: 'func',
            params: raw.params.map(normalizeValType),
            results: raw.results.map(normalizeValType),
            isFinal: raw.subtype ? Boolean(raw.subtype.isFinal) : true,
            supertypes: [...supertypes],
            offset: raw.offset
          };
        } else if (raw.kind === 'struct') {
          normalized = {
            index: idx,
            groupStart: startIndex,
            groupSize: size,
            groupOffset: idx - startIndex,
            kind: 'struct',
            fields: raw.fields.map(f => ({
              storage: normalizeValType(f.storage),
              mutable: Boolean(f.mutable)
            })),
            isFinal: raw.subtype ? Boolean(raw.subtype.isFinal) : true,
            supertypes: [...supertypes],
            offset: raw.offset
          };
        } else if (raw.kind === 'array') {
          normalized = {
            index: idx,
            groupStart: startIndex,
            groupSize: size,
            groupOffset: idx - startIndex,
            kind: 'array',
            field: {
              storage: normalizeValType(raw.field.storage),
              mutable: Boolean(raw.field.mutable)
            },
            isFinal: raw.subtype ? Boolean(raw.subtype.isFinal) : true,
            supertypes: [...supertypes],
            offset: raw.offset
          };
        } else {
          throw new ValidationError(`Unknown composite type kind ${raw.kind}`, { offset: raw.offset });
        }
        this.types[idx] = normalized;
      }

      // Verify all type indices referenced inside the group are < endIndex
      for (let idx = startIndex; idx < endIndex; idx++) {
        this._validateTypeReferencesInDef(this.types[idx], endIndex);
      }

      // Compute canonical group representation
      const groupMembersRepr = [];
      for (let idx = startIndex; idx < endIndex; idx++) {
        groupMembersRepr.push(this._serializeDefForGroup(this.types[idx], startIndex, endIndex));
      }
      const groupCanonicalId = `rec[${groupMembersRepr.join(';')}]`;
      for (let idx = startIndex; idx < endIndex; idx++) {
        const t = this.types[idx];
        t.groupCanonicalId = groupCanonicalId;
        t.canonicalId = `${groupCanonicalId}#${idx - startIndex}`;
        t.supertypeCaIds = new Set();
        for (const supIdx of t.supertypes) {
          const supDef = this.types[supIdx];
          t.supertypeCaIds.add(supDef.canonicalId);
          for (const anc of supDef.supertypeCaIds) {
            t.supertypeCaIds.add(anc);
          }
        }
      }
      groupIndex++;
    }
  }

  _validateTypeReferencesInDef(def, maxExclusive) {
    const checkType = vt => {
      if (vt.kind === 'ref' && typeof vt.heapType === 'number') {
        if (vt.heapType < 0 || vt.heapType >= maxExclusive) {
          throw new ValidationError(`Type index ${vt.heapType} out of bounds (max ${maxExclusive - 1})`, { offset: def.offset });
        }
      }
    };
    if (def.kind === 'func') {
      def.params.forEach(checkType);
      def.results.forEach(checkType);
    } else if (def.kind === 'struct') {
      def.fields.forEach(f => checkType(f.storage));
    } else if (def.kind === 'array') {
      checkType(def.field.storage);
    }
  }

  _serializeValTypeForGroup(vt, groupStart, groupEnd) {
    if (vt.kind === 'num' || vt.kind === 'vec' || vt.kind === 'packed') return vt.name;
    if (vt.kind === 'ref') {
      let htRepr;
      if (typeof vt.heapType === 'number') {
        if (vt.heapType >= groupStart && vt.heapType < groupEnd) {
          htRepr = `@self+${vt.heapType - groupStart}`;
        } else {
          htRepr = this.types[vt.heapType].canonicalId;
        }
      } else if (typeof vt.heapType === 'object' && vt.heapType.canonicalId) {
        htRepr = vt.heapType.canonicalId;
      } else {
        htRepr = String(vt.heapType);
      }
      return `ref(${vt.nullable ? 'null,' : ''}${htRepr})`;
    }
    return 'bot';
  }

  _serializeDefForGroup(def, groupStart, groupEnd) {
    const supRepr = def.supertypes.map(supIdx => {
      if (supIdx >= groupStart && supIdx < groupEnd) return `@self+${supIdx - groupStart}`;
      return this.types[supIdx].canonicalId;
    }).join(',');
    const head = `${def.isFinal ? 'final' : 'open'}(${supRepr}):${def.kind}`;
    if (def.kind === 'func') {
      const p = def.params.map(t => this._serializeValTypeForGroup(t, groupStart, groupEnd)).join(',');
      const r = def.results.map(t => this._serializeValTypeForGroup(t, groupStart, groupEnd)).join(',');
      return `${head}(${p})->(${r})`;
    }
    if (def.kind === 'struct') {
      const f = def.fields.map(field =>
        `${field.mutable ? 'mut ' : ''}${this._serializeValTypeForGroup(field.storage, groupStart, groupEnd)}`
      ).join(',');
      return `${head}{${f}}`;
    }
    if (def.kind === 'array') {
      return `${head}[${def.field.mutable ? 'mut ' : ''}${this._serializeValTypeForGroup(def.field.storage, groupStart, groupEnd)}]`;
    }
    return head;
  }

  get(index) {
    if (typeof index === 'object' && index !== null && index.canonicalId) return index;
    if (!Number.isInteger(index) || index < 0 || index >= this.types.length) {
      throw new ValidationError(`Type index ${index} out of bounds (count=${this.types.length})`);
    }
    return this.types[index];
  }

  validateSubtyping() {
    for (let i = 0; i < this.types.length; i++) {
      const sub = this.types[i];
      for (const supIdx of sub.supertypes) {
        const sup = this.types[supIdx];
        if (sup.isFinal) {
          throw new ValidationError(`Type ${i} cannot subtype final type ${supIdx}`, { offset: sub.offset });
        }
        if (!this.isCompositeSubtype(sub, sup)) {
          throw new ValidationError(`Type ${i} (${sub.kind}) does not match declared supertype ${supIdx} (${sup.kind})`, { offset: sub.offset });
        }
      }
    }
  }

  isCompositeSubtype(sub, sup) {
    if (sub.kind !== sup.kind) return false;
    if (sub.kind === 'func') {
      if (sub.params.length !== sup.params.length || sub.results.length !== sup.results.length) {
        return false;
      }
      for (let i = 0; i < sub.params.length; i++) {
        if (!this.isValueSubtype(sup.params[i], sub.params[i])) return false;
      }
      for (let i = 0; i < sub.results.length; i++) {
        if (!this.isValueSubtype(sub.results[i], sup.results[i])) return false;
      }
      return true;
    }
    if (sub.kind === 'struct') {
      if (sub.fields.length < sup.fields.length) return false;
      for (let i = 0; i < sup.fields.length; i++) {
        if (!this.isFieldSubtype(sub.fields[i], sup.fields[i])) return false;
      }
      return true;
    }
    if (sub.kind === 'array') {
      return this.isFieldSubtype(sub.field, sup.field);
    }
    return false;
  }

  isFieldSubtype(subField, supField) {
    if (subField.mutable !== supField.mutable) return false;
    if (subField.mutable) {
      return this.isStorageSubtype(subField.storage, supField.storage) &&
             this.isStorageSubtype(supField.storage, subField.storage);
    }
    return this.isStorageSubtype(subField.storage, supField.storage);
  }

  isStorageSubtype(sub, sup) {
    const a = normalizeValType(sub);
    const b = normalizeValType(sup);
    if (a.kind === 'packed' || b.kind === 'packed') {
      return a.kind === 'packed' && b.kind === 'packed' && a.name === b.name;
    }
    return this.isValueSubtype(a, b);
  }

  resolveConcreteHeapType(ht) {
    if (typeof ht === 'object' && ht !== null && ht.canonicalId) return ht;
    if (typeof ht === 'number') return this.get(ht);
    return null;
  }

  isHeapSubtype(subHt, supHt, supTypeEnv = this) {
    const a = typeof subHt === 'object' && subHt !== null && subHt.canonicalId ? subHt : normalizeHeapType(subHt);
    const b = typeof supHt === 'object' && supHt !== null && supHt.canonicalId ? supHt : normalizeHeapType(supHt);

    const aDef = typeof a === 'number' ? this.get(a) : (typeof a === 'object' ? a : null);
    const bDef = typeof b === 'number' ? supTypeEnv.get(b) : (typeof b === 'object' ? b : null);

    const aId = aDef ? aDef.canonicalId : a;
    const bId = bDef ? bDef.canonicalId : b;
    if (aId === bId) return true;

    // Bottom types
    if (a === 'none') {
      return b === 'any' || b === 'eq' || b === 'i31' || b === 'struct' || b === 'array' ||
             (bDef !== null && (bDef.kind === 'struct' || bDef.kind === 'array'));
    }
    if (a === 'nofunc') {
      return b === 'func' || (bDef !== null && bDef.kind === 'func');
    }
    if (a === 'noextern') {
      return b === 'extern';
    }
    if (a === 'noexn') {
      return b === 'exn';
    }

    // Abstract hierarchy
    if (!aDef) {
      if (a === 'i31' || a === 'struct' || a === 'array') {
        return b === 'eq' || b === 'any';
      }
      if (a === 'eq') {
        return b === 'any';
      }
      return false;
    }

    // Concrete subHt
    if (!bDef) {
      if (aDef.kind === 'func') return b === 'func';
      if (aDef.kind === 'struct') return b === 'struct' || b === 'eq' || b === 'any';
      if (aDef.kind === 'array') return b === 'array' || b === 'eq' || b === 'any';
      return false;
    }

    // Both concrete: check declared supertype chain by canonicalId
    return aDef.supertypeCaIds.has(bDef.canonicalId);
  }

  isValueSubtype(sub, sup, supTypeEnv = this) {
    const a = normalizeValType(sub);
    const b = normalizeValType(sup);
    if (a.kind === 'bot') return true;
    if (b.kind === 'bot') return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'num' || a.kind === 'vec' || a.kind === 'packed') {
      return a.name === b.name;
    }
    if (a.kind === 'ref') {
      if (a.nullable && !b.nullable) return false;
      return this.isHeapSubtype(a.heapType, b.heapType, supTypeEnv);
    }
    return false;
  }

  bindValType(vt) {
    const norm = normalizeValType(vt);
    if (norm.kind === 'ref' && typeof norm.heapType === 'number') {
      return {
        kind: 'ref',
        nullable: norm.nullable,
        heapType: this.get(norm.heapType)
      };
    }
    return norm;
  }
}

module.exports = {
  ABSTRACT_HEAP_TYPES,
  CODE_TO_HEAP,
  BOT_TYPE,
  I32_TYPE,
  I64_TYPE,
  F32_TYPE,
  F64_TYPE,
  V128_TYPE,
  normalizeHeapType,
  normalizeValType,
  formatValType,
  isDefaultable,
  defaultValueForType,
  heapHierarchy,
  TypeEnvironment
};
