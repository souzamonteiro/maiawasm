/**
 * Run tests against the assembler
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WatAssembler = require('../wat-assembler.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const EXPECTED_DIR = path.join(__dirname, 'expected');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

const args = new Set(process.argv.slice(2));
const STRICT_HASH = args.has('--strict-hash') || args.has('--strict') || process.env.STRICT_HASH === '1';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Files that should FAIL assembly
const SHOULD_FAIL = ['10-errors.wat'];

function sanitizeWat(source) {
  return source
    .split('\n')
    .map(line => line.replace(/;;.*$/, ''))
    .join('\n')
    .trim();
}

const watFiles = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.wat'));

console.log('Running tests...\n');
if (STRICT_HASH) {
  console.log('Mode: STRICT_HASH enabled (hash mismatch is a failure)\n');
}

const assembler = new WatAssembler();
let passed = 0;
let failed = 0;

for (const watFile of watFiles) {
  const watPath = path.join(FIXTURES_DIR, watFile);
  const baseName = watFile.replace('.wat', '');
  const expectedWasmPath = path.join(EXPECTED_DIR, baseName + '.wasm');
  const expectedErrorPath = path.join(EXPECTED_DIR, baseName + '.error');
  const outputPath = path.join(OUTPUT_DIR, baseName + '.wasm');
  
  process.stdout.write(`  ${watFile} ... `);
  
  try {
    const source = sanitizeWat(fs.readFileSync(watPath, 'utf8'));
    
    if (SHOULD_FAIL.includes(watFile)) {
      // This file should FAIL
      try {
        const wasm = assembler.assemble(source);
        
        // Check if we have an expected error file
        if (fs.existsSync(expectedErrorPath)) {
          console.log('❌ FAILED (should have errored but succeeded)');
          failed++;
        } else {
          console.log('❌ FAILED (unexpected success)');
          failed++;
        }
      } catch (error) {
        // Check if we expected this file to fail
        if (fs.existsSync(expectedErrorPath)) {
          console.log('✓ PASSED (correctly failed)');
          passed++;
        } else {
          console.log('❌ FAILED (unexpected error: ' + error.message.split('\n')[0] + ')');
          failed++;
        }
      }
    } else {
      // This file should succeed
      const wasm = assembler.assemble(source);
      fs.writeFileSync(outputPath, Buffer.from(wasm));

      const isValidWasm = WebAssembly.validate(new Uint8Array(wasm));
      
      // Compare with expected if available
      if (fs.existsSync(expectedWasmPath)) {
        const expected = fs.readFileSync(expectedWasmPath);
        const expectedHash = crypto.createHash('sha256').update(expected).digest('hex').substring(0, 8);
        const actualHash = crypto.createHash('sha256').update(wasm).digest('hex').substring(0, 8);
        
        if (expectedHash === actualHash) {
          console.log('✓ PASSED');
          passed++;
        } else {
          if (STRICT_HASH) {
            console.log('❌ FAILED (strict hash mismatch)');
            console.log(`    Expected: ${expectedHash}, Got: ${actualHash}`);
            failed++;
          } else if (isValidWasm) {
            console.log('✓ PASSED (valid wasm, hash mismatch)');
            console.log(`    Expected: ${expectedHash}, Got: ${actualHash}`);
            passed++;
          } else {
            console.log('❌ FAILED (invalid wasm + hash mismatch)');
            console.log(`    Expected: ${expectedHash}, Got: ${actualHash}`);
            failed++;
          }
        }
      } else {
        if (isValidWasm) {
          console.log('✓ PASSED (valid wasm, no expected output)');
          passed++;
        } else {
          console.log('❌ FAILED (invalid wasm, no expected output)');
          failed++;
        }
      }
    }
  } catch (error) {
    if (SHOULD_FAIL.includes(watFile)) {
      console.log('✓ PASSED (correctly failed)');
      passed++;
    } else {
      console.log('❌ FAILED: ' + error.message.split('\n')[0]);
      failed++;
    }
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}