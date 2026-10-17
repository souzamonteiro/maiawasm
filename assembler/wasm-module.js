'use strict';

const { BinaryReader } = require('./wasm-reader.js');
const { decodeExpression } = require('./wasm-instructions.js');
const { PackedTypeName } = require('./wasm-binary.js');

// Tags precede globals; data-count precedes code, regardless of section IDs.
const SECTION_ORDER = new Map(
  [1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11].map((id, index) => [id, index + 1])
);

class ModuleDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.resetState();
  }

  resetState() {
    this.offset = 0;
    this.reader = null;
    this.binaryVersion = 1;
    this.sections = [];
    this.typeSection = [];
    this.typeGroups = [];
    this.importSection = [];
    this.functionSection = [];
    this.tableSection = [];
    this.memorySection = [];
    this.globalSection = [];
    this.exportSection = [];
    this.startSection = null;
    this.elementSection = [];
    this.codeSection = [];
    this.expressions = [];
    this.dataSection = [];
    this.tagSection = [];
    this.dataCountSection = null;
    this.customSections = [];
    this.nameSection = {
      moduleName: null,
      functionNames: new Map(),
      localNames: new Map(),
    };
    this.sectionEnd = null;
    this.seenSections = new Set();
    this.lastSectionOrder = 0;
  }

  ensureAvailable(length, context, absoluteOffset = this.offset) {
    const end = this.sectionEnd !== null && this.sectionEnd !== undefined ? this.sectionEnd : this.buffer.length;
    if (!Number.isSafeInteger(length) || !Number.isSafeInteger(absoluteOffset) ||
        absoluteOffset < 0 || length < 0 || length > end - absoluteOffset) {
      throw new Error(`Out-of-bounds read (${context}) at offset ${absoluteOffset}, length ${length}, end ${end}`);
    }
  }

  readByte(context) {
    return this.readWith('readByte', context);
  }

  readULEB(context, bitWidth = 32, options) {
    return this.readWith('readULEB', context, bitWidth, options);
  }

  readSLEB(context, bitWidth, options) {
    return this.readWith('readSLEB', context, bitWidth, options);
  }

  readBytes(length, context) {
    return this.readWith('readBytes', length, context);
  }

  readCount(context, minimumEntryBytes = 1) {
    return this.readWith('readCount', context, minimumEntryBytes);
  }

  readWith(method, ...args) {
    if (!this.reader || this.reader.bytes !== this.buffer) {
      this.reader = new BinaryReader(this.buffer, { context: 'binary read' });
    }
    this.reader.offset = this.offset;
    this.reader.end = this.sectionEnd ?? this.buffer.length;
    const result = this.reader[method](...args);
    this.offset = this.reader.offset;
    return result;
  }

  withReadLimit(length, context, parse) {
    this.ensureAvailable(length, context);
    const previousEnd = this.sectionEnd;
    const end = this.offset + length;
    this.sectionEnd = end;
    try {
      const result = parse();
      if (this.offset !== end) {
        throw new Error(`${context} has unconsumed bytes at offset ${this.offset} (end=${end})`);
      }
      return result;
    } finally {
      this.sectionEnd = previousEnd;
    }
  }

  readUTF8String(context) {
    return this.readWith('readUTF8String', context);
  }

  readReferenceType(context) {
    return this.readValueType(context, true);
  }

  readValueType(context, referenceOnly = false) {
    return this.readWith('readValueType', context, referenceOnly);
  }

  readMutability(context) {
    const value = this.readByte(context);
    if (value > 1) throw new Error(`Invalid mutability ${value} (${context})`);
    return value === 1;
  }

  decode() {
    this.resetState();
    if (!(this.buffer instanceof Uint8Array) || this.buffer.length < 8) {
      throw new Error('Input is not a valid WASM buffer (too small)');
    }
    
    // Check magic number and version
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    if (view.getUint32(0, true) !== 0x6d736100 || view.getUint32(4, true) !== 0x1) {
      throw new Error('Invalid WASM magic number or version');
    }

    this.offset = 8; // Skip magic and version
    
    // Parse all sections
    while (this.offset < this.buffer.length) {
      this.parseSection();
    }
    
    return Object.fromEntries([
      ['bytes', this.buffer],
      ...['binaryVersion', 'sections', 'typeSection', 'typeGroups', 'importSection',
        'functionSection', 'tableSection', 'memorySection', 'globalSection', 'exportSection',
        'startSection', 'elementSection', 'codeSection', 'expressions', 'dataSection',
        'tagSection', 'dataCountSection', 'customSections', 'nameSection']
        .map(key => [key, this[key]])
    ]);
  }

  parseSection() {
    const sectionOffset = this.offset;
    this.ensureAvailable(1, 'section id');
    const sectionId = this.buffer[this.offset++];
    if (sectionId !== 0) {
      const order = SECTION_ORDER.get(sectionId);
      if (order === undefined) {
        throw new Error(`Unknown section ${sectionId} at offset ${sectionOffset}`);
      }
      if (this.seenSections.has(sectionId)) {
        throw new Error(`Duplicate section ${sectionId} at offset ${sectionOffset}`);
      }
      if (order < this.lastSectionOrder) {
        throw new Error(`Section ${sectionId} out of order at offset ${sectionOffset}`);
      }
      this.seenSections.add(sectionId);
      this.lastSectionOrder = order;
    }
    const sectionLength = this.readULEB('section length');
    const payloadOffset = this.offset;
    const sectionEnd = this.offset + sectionLength;
    if (sectionEnd > this.buffer.length) {
      throw new Error(`Section ${sectionId} exceeds buffer bounds (offset=${this.offset}, length=${sectionLength})`);
    }
    const previousSectionEnd = this.sectionEnd;
    this.sectionEnd = sectionEnd;
    
    try {
      switch (sectionId) {
        case 0x00: this.parseCustomSection(); break;
        case 0x01: this.parseTypeSection(); break;
        case 0x02: this.parseImportSection(); break;
        case 0x03: this.parseFunctionSection(); break;
        case 0x04: this.parseTableSection(); break;
        case 0x05: this.parseMemorySection(); break;
        case 0x06: this.parseGlobalSection(); break;
        case 0x07: this.parseExportSection(); break;
        case 0x08: this.parseStartSection(); break;
        case 0x09: this.parseElementSection(); break;
        case 0x0a: this.parseCodeSection(); break;
        case 0x0b: this.parseDataSection(); break;
        case 0x0c: this.parseDataCountSection(); break;
        case 0x0d: this.parseTagSection(); break;
      }

      if (this.offset < sectionEnd) {
        throw new Error(`Section ${sectionId} has unconsumed bytes at offset ${this.offset} (end=${sectionEnd})`);
      } else if (this.offset > sectionEnd) {
        throw new Error(`Section ${sectionId} parser overread at offset ${this.offset}`);
      }
      this.sections.push({ id: sectionId, offset: sectionOffset, payloadOffset, endOffset: sectionEnd });
    } finally {
      this.sectionEnd = previousSectionEnd;
    }
  }

  parseCustomSection() {
    const sectionStart = this.offset;
    const name = this.readUTF8String('custom section name');
    const payloadStart = this.offset;

    this.customSections.push({
      name,
      offset: sectionStart,
      payloadOffset: payloadStart,
      payloadLength: this.sectionEnd - payloadStart,
      payload: this.buffer.subarray(payloadStart, this.sectionEnd),
    });

    if (name !== 'name') {
      this.offset = this.sectionEnd;
      return;
    }

    while (this.offset < this.sectionEnd) {
      const subsectionId = this.readByte('name subsection id');
      const subsectionSize = this.readULEB('name subsection size');
      this.withReadLimit(subsectionSize, `name subsection ${subsectionId}`, () => {
        if (subsectionId === 0x00) {
          this.nameSection.moduleName = this.readUTF8String('module name');
        } else if (subsectionId === 0x01) {
          const count = this.readCount('function name count', 2);
          for (let i = 0; i < count; i++) {
            const functionIndex = this.readULEB('function name index');
            const functionName = this.readUTF8String('function name');
            this.nameSection.functionNames.set(functionIndex, functionName);
          }
        } else if (subsectionId === 0x02) {
          const functionCount = this.readCount('local name function count', 2);
          for (let i = 0; i < functionCount; i++) {
            const functionIndex = this.readULEB('local name function index');
            const localCount = this.readCount('local name count', 2);
            const localMap = new Map();
            for (let j = 0; j < localCount; j++) {
              const localIndex = this.readULEB('local name index');
              const localName = this.readUTF8String('local name');
              localMap.set(localIndex, localName);
            }
            this.nameSection.localNames.set(functionIndex, localMap);
          }
        } else {
          this.readBytes(subsectionSize, `unknown name subsection ${subsectionId}`);
        }
      });
    }
  }

  parseTypeSection() {
    const count = this.readCount('type count');
    for (let i = 0; i < count; i++) {
      const offset = this.offset;
      const recursive = this.buffer[this.offset] === 0x4e;
      if (recursive) this.readByte('recursive group marker');
      const size = recursive ? this.readCount('recursive group count') : 1;
      const startIndex = this.typeSection.length;
      for (let j = 0; j < size; j++) {
        this.typeSection.push(this.parseSubtype());
      }
      this.typeGroups.push({ recursive, startIndex, size, offset, endOffset: this.offset });
    }
  }

  parseSubtype() {
    const offset = this.offset;
    let form = this.readByte('type form');
    const explicit = form === 0x50 || form === 0x4f;
    const isFinal = form !== 0x50;
    const supertypes = [];
    if (explicit) {
      const count = this.readCount('supertype count');
      for (let i = 0; i < count; i++) supertypes.push(this.readULEB('supertype index'));
      form = this.readByte('composite type form');
    }
    let type;
    if (form === 0x60) {
      const readTypes = context => {
        const count = this.readCount(context);
        const types = [];
        for (let i = 0; i < count; i++) types.push(this.readValueType(context));
        return types;
      };
      type = { kind: 'func', params: readTypes('parameter count'), results: readTypes('result count') };
    } else if (form === 0x5f) {
      const count = this.readCount('field count', 2);
      const fields = [];
      for (let i = 0; i < count; i++) fields.push(this.parseFieldType());
      type = { kind: 'struct', fields };
    } else if (form === 0x5e) {
      type = { kind: 'array', field: this.parseFieldType() };
    } else {
      throw new Error(`Invalid composite type form 0x${form.toString(16)} at offset ${this.offset - 1}`);
    }
    return { ...type, subtype: { explicit, isFinal, supertypes }, offset, endOffset: this.offset };
  }

  parseFieldType() {
    const code = this.buffer[this.offset];
    const storage = PackedTypeName[code] ? this.readByte('packed field type') : this.readValueType('field value type');
    const mutable = this.readMutability('field mutability');
    return { storage, mutable };
  }

  parseImportSection() {
    const count = this.readCount('import count', 4);
    
    for (let i = 0; i < count; i++) {
      const module = this.readUTF8String('import module');
      const name = this.readUTF8String('import name');
      
      const kind = this.readByte('import kind');
      let importDesc = { module, name, kind };
      
      switch (kind) {
        case 0x00: // Function
          importDesc.typeIdx = this.readULEB('import function type');
          break;
        case 0x01: // Table
          importDesc.tableType = this.parseTableType();
          break;
        case 0x02: // Memory
          importDesc.memoryType = this.parseMemoryType();
          break;
        case 0x03: // Global
          importDesc.globalType = this.parseGlobalType();
          break;
        case 0x04: // Tag
          importDesc.attribute = this.readTagAttribute('import tag attribute');
          importDesc.typeIdx = this.readULEB('import tag type');
          break;
        default:
          throw new Error(`Invalid import kind ${kind} at offset ${this.offset - 1}`);
      }
      
      this.importSection.push(importDesc);
    }
  }

  parseTableType() {
    const elemType = this.readReferenceType('table element type');
    const limits = this.parseLimits();
    return { elemType, limits };
  }

  parseMemoryType() {
    const limits = this.parseLimits();
    if (limits.min > 65536 || (limits.max !== undefined && limits.max > 65536)) {
      throw new Error('Memory32 limits exceed 65536 pages');
    }
    return limits;
  }

  parseGlobalType() {
    const valType = this.readValueType('global value type');
    const mutable = this.readMutability('global mutability');
    return { valType, mutable };
  }

  parseLimits() {
    const flags = this.readByte('limits flags');
    if (flags !== 0 && flags !== 1) {
      throw new Error(`Unsupported limits flags 0x${flags.toString(16)}: only unshared memory32/table32 limits are supported`);
    }
    const readLimit = context => {
      const value = this.readULEB(context, 64, { asBigInt: true });
      if (value > 0xffffffffn) throw new Error(`Unsupported ${context}: memory32/table32 limits require u32 values`);
      return Number(value);
    };
    const min = readLimit('limits minimum');
    
    if (flags === 0x01) {
      const max = readLimit('limits maximum');
      if (max < min) throw new Error(`Invalid limits: maximum ${max} is below minimum ${min}`);
      return { min, max };
    }
    return { min };
  }

  parseFunctionSection() {
    const count = this.readCount('function count');

    for (let i = 0; i < count; i++) {
      this.functionSection.push(this.readULEB('function type index'));
    }
  }

  parseTableSection() {
    const count = this.readCount('table count', 3);

    for (let i = 0; i < count; i++) {
      this.tableSection.push(this.parseTableType());
    }
  }

  parseMemorySection() {
    const count = this.readCount('memory count', 2);

    for (let i = 0; i < count; i++) {
      this.memorySection.push(this.parseMemoryType());
    }
  }

  parseGlobalSection() {
    const count = this.readCount('global count', 3);

    for (let i = 0; i < count; i++) {
      const globalType = this.parseGlobalType();
      const initExpr = this.parseExpressionBytes();
      this.globalSection.push({ globalType, initExpr, initializer: this.expressions[this.expressions.length - 1] });
    }
  }

  parseExportSection() {
    const count = this.readCount('export count', 3);

    for (let i = 0; i < count; i++) {
      const name = this.readUTF8String('export name');
      const kind = this.readByte('export kind');
      if (kind > 4) throw new Error(`Invalid export kind ${kind} at offset ${this.offset - 1}`);
      const index = this.readULEB('export index');
      this.exportSection.push({ name, kind, index });
    }
  }

  parseStartSection() {
    this.startSection = this.readULEB('start function');
  }

  parseElementSection() {
    const count = this.readCount('element count');
    for (let i = 0; i < count; i++) {
      const flags = this.readULEB('element flags');
      if (flags > 7) throw new Error(`Invalid element flags ${flags} at offset ${this.offset}`);

      const entry = {
        flags,
        tableIndex: 0,
        mode: 'active',
        reftype: 0x70,
        initExpr: null,
        elements: [],
        useExpressions: (flags & 0x04) !== 0
      };

      if (flags & 0x01) {
        entry.mode = (flags & 0x02) ? 'declarative' : 'passive';
      }

      if (flags === 2 || flags === 6) {
        entry.tableIndex = this.readULEB('element table index');
      }

      if (entry.mode === 'active') {
        entry.initExpr = this.parseExpressionBytes();
        entry.offsetExpression = this.expressions[this.expressions.length - 1];
      }

      if (flags >= 5) {
        const referenceTypeOffset = this.offset;
        entry.reftype = this.readReferenceType('element reference type');
        entry.reftypeBytes = this.buffer.subarray(referenceTypeOffset, this.offset);
      } else if (flags === 1 || flags === 2 || flags === 3) {
        const elemkind = this.readByte('element kind');
        if (elemkind !== 0) throw new Error(`Invalid element kind ${elemkind} at offset ${this.offset - 1}`);
      }

      const itemCount = this.readCount('element item count');
      if (entry.useExpressions) entry.elementExpressions = [];
      for (let j = 0; j < itemCount; j++) {
        if (entry.useExpressions) {
          entry.elements.push(this.parseExpressionBytes());
          entry.elementExpressions.push(this.expressions[this.expressions.length - 1]);
        } else {
          entry.elements.push(this.readULEB('element function index'));
        }
      }

      this.elementSection.push(entry);
    }
  }

  parseCodeSection() {
    const count = this.readCount('code body count');
    for (let i = 0; i < count; i++) {
      const bodyOffset = this.offset;
      const bodySize = this.readULEB('function body size');
      const payloadOffset = this.offset;
      const body = this.withReadLimit(bodySize, `function body ${i}`, () => {
        const localCount = this.readCount('local declaration count', 2);
        const locals = [];
        for (let j = 0; j < localCount; j++) {
          const count = this.readULEB('local count');
          const valType = this.readValueType('local valtype');
          locals.push({ count, valType });
        }
        const codeOffset = this.offset;
        const code = this.readBytes(this.sectionEnd - this.offset, 'function instructions');
        const decoded = decodeExpression(code, { baseOffset: codeOffset, functionBody: true });
        if (decoded.bytesRead !== code.length) {
          throw new Error(`Function body has unconsumed bytes after end at offset ${decoded.endOffset}`);
        }
        return { locals, code, codeOffset, instructions: decoded.instructions, control: decoded.control,
          offset: bodyOffset, payloadOffset, endOffset: this.offset };
      });
      this.codeSection.push(body);
    }
  }

  parseDataSection() {
    const count = this.readCount('data segment count', 2);

    for (let i = 0; i < count; i++) {
      const flags = this.readULEB('data flags');
      if (flags > 2) throw new Error(`Invalid data flags ${flags} at offset ${this.offset}`);

      const dataEntry = {
        flags,
        mode: flags === 1 ? 'passive' : 'active',
        memoryIndex: 0,
        offsetExpr: null,
        bytes: new Uint8Array(0)
      };

      if (flags === 0) {
        dataEntry.offsetExpr = this.parseExpressionBytes();
      } else if (flags === 2) {
        dataEntry.memoryIndex = this.readULEB('data memory index');
        dataEntry.offsetExpr = this.parseExpressionBytes();
      }
      if (dataEntry.offsetExpr) dataEntry.offsetExpression = this.expressions[this.expressions.length - 1];

      const size = this.readULEB('data byte count');
      dataEntry.bytes = this.readBytes(size, 'data bytes');

      this.dataSection.push(dataEntry);
    }
  }

  parseDataCountSection() {
    this.dataCountSection = this.readULEB('data count');
  }

  parseTagSection() {
    const count = this.readCount('tag count', 2);

    for (let i = 0; i < count; i++) {
      const attribute = this.readTagAttribute('tag attribute');
      const typeIdx = this.readULEB('tag type index');
      this.tagSection.push({ attribute, typeIdx });
    }
  }

  readTagAttribute(context) {
    const attribute = this.readByte(context);
    if (attribute !== 0) throw new Error(`Invalid ${context} ${attribute} at offset ${this.offset - 1}`);
    return attribute;
  }

  parseExpressionBytes() {
    const start = this.offset;
    const decoded = decodeExpression(this.buffer, { start, end: this.sectionEnd ?? this.buffer.length });
    this.offset = decoded.endOffset;
    this.expressions.push(decoded);
    return this.buffer.subarray(start, this.offset);
  }

}

function decodeModule(bytes, { copyInput = true } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('decodeModule requires a Uint8Array');
  if (typeof copyInput !== 'boolean') throw new TypeError('copyInput must be a boolean');
  return new ModuleDecoder(copyInput ? Uint8Array.from(bytes) : bytes).decode();
}

module.exports = { ModuleDecoder, decodeModule };
