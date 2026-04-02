#!/usr/bin/env node
/**
 * WAT Parser Detailed Debug
 * Shows detailed error information for parser failures
 */

const fs = require('fs');
const path = require('path');
const WAT = require('../WAT.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Test just the first one
const testFile = '01-basic-module.wat';
const filePath = path.join(FIXTURES_DIR, testFile);

const source = fs.readFileSync(filePath, 'utf8');

console.log(`Testing: ${testFile}`);
console.log('='.repeat(60));
console.log('\nSource code:');
console.log('-'.repeat(60));
console.log(source);
console.log('-'.repeat(60));

const eventHandler = {
  reset: (input) => {},
  startNonterminal: (name, begin) => {},
  endNonterminal: (name, end) => {},
  terminal: (value, begin, end) => {},
  whitespace: (begin, end) => {}
};

try {
  const parser = new WAT(source, eventHandler);
  parser.parse_wat();
  console.log('\n✓ Parse succeeded!');
} catch (err) {
  console.log('\n✗ Parse failed!');
  console.log('\nError Message:', err.getMessage ? err.getMessage() : err.message);
  
  if (err.getBegin && err.getEnd) {
    const begin = err.getBegin();
    const end = err.getEnd();
    const context = source.substring(Math.max(0, begin - 40), Math.min(source.length, end + 40));
    const lines = source.substring(0, begin).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    
    console.log(`\nLocation: Line ${line}, Column ${column}`);
    console.log(`\nContext:\n${context}`);
  }
  
  if (err.getExpected) {
    console.log(`\nExpected:`, err.getExpected());
  }
}
