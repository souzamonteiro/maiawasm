'use strict';

const assert = require('assert');
const { WasmDisassembler } = require('../wasm-disassembler.js');

function uleb(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function makeSection(id, payload) {
  return Buffer.concat([Buffer.from([id]), uleb(payload.length), payload]);
}

function makeNameSection() {
  const sectionName = Buffer.from('name', 'utf8');
  const sectionNameField = Buffer.concat([uleb(sectionName.length), sectionName]);

  // subsection 0: module name
  const modName = Buffer.from('demo_mod', 'utf8');
  const sub0Payload = Buffer.concat([uleb(modName.length), modName]);
  const sub0 = Buffer.concat([Buffer.from([0x00]), uleb(sub0Payload.length), sub0Payload]);

  // subsection 1: function names
  const fnName = Buffer.from('answer', 'utf8');
  const sub1Payload = Buffer.concat([uleb(1), uleb(0), uleb(fnName.length), fnName]);
  const sub1 = Buffer.concat([Buffer.from([0x01]), uleb(sub1Payload.length), sub1Payload]);

  return makeSection(0x00, Buffer.concat([sectionNameField, sub0, sub1]));
}

function makeMinimalWasmWithCustom() {
  const magicVersion = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  // (type (func (result i32)))
  const typeSection = makeSection(0x01, Buffer.from([0x01, 0x60, 0x00, 0x01, 0x7f]));
  // (func (type 0))
  const funcSection = makeSection(0x03, Buffer.from([0x01, 0x00]));
  // function body: local decl count 0, i32.const 42, end
  const codeSection = makeSection(0x0a, Buffer.from([0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b]));

  return Buffer.concat([magicVersion, typeSection, funcSection, codeSection, makeNameSection()]);
}

const dis = new WasmDisassembler(makeMinimalWasmWithCustom());
const wat = dis.disassemble();

assert.ok(wat.includes('(module'));
assert.strictEqual(dis.customSections.length, 1);
assert.strictEqual(dis.customSections[0].name, 'name');
assert.strictEqual(dis.nameSection.moduleName, 'demo_mod');
assert.strictEqual(dis.nameSection.functionNames.get(0), 'answer');
console.log('PASS custom_name_section_parse');

console.log('\nAll custom-section tests passed.');
