'use strict';

const assert = require('assert');
const { __test } = require('../wasm-disassembler.js');

const { decodeULEB128, decodeSLEB128, decodeUTF8, decodeF32, decodeF64 } = __test;

// ULEB128 known sample from wasm spec docs.
const uleb = decodeULEB128(Buffer.from([0xe5, 0x8e, 0x26]), 0);
assert.strictEqual(uleb.value, 624485);
assert.strictEqual(uleb.bytesRead, 3);
console.log('PASS decodeULEB128');

const u32Max = decodeULEB128(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x0f]), 0);
assert.strictEqual(u32Max.value, 4294967295);
assert.strictEqual(u32Max.bytesRead, 5);

assert.throws(
	() => decodeULEB128(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x10]), 0),
	/out of range for u32/
);
console.log('PASS decodeULEB128 width checks');

// SLEB128 known sample.
const sleb = decodeSLEB128(Buffer.from([0x9b, 0xf1, 0x59]), 0);
assert.strictEqual(sleb.value, -624485);
assert.strictEqual(sleb.bytesRead, 3);
console.log('PASS decodeSLEB128');

const s32Max = decodeSLEB128(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x07]), 0, 32);
assert.strictEqual(s32Max.value, 2147483647);

const s32Min = decodeSLEB128(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x78]), 0, 32);
assert.strictEqual(s32Min.value, -2147483648);

assert.throws(
	() => decodeSLEB128(Buffer.from([0x80, 0x80, 0x80, 0x80, 0x08]), 0, 32),
	/out of range for s32/
);
console.log('PASS decodeSLEB128 width checks');

const utf8Buf = Buffer.from('hello wasm', 'utf8');
assert.strictEqual(decodeUTF8(utf8Buf, 0, utf8Buf.length), 'hello wasm');
console.log('PASS decodeUTF8');

const f32Buf = Buffer.alloc(4);
f32Buf.writeFloatLE(3.5, 0);
assert.strictEqual(decodeF32(f32Buf, 0), 3.5);
console.log('PASS decodeF32');

const f64Buf = Buffer.alloc(8);
f64Buf.writeDoubleLE(Math.PI, 0);
assert.strictEqual(decodeF64(f64Buf, 0), Math.PI);
console.log('PASS decodeF64');

console.log('\nAll primitive decoder unit tests passed.');
