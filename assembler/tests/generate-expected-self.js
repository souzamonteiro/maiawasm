/**
 * Generate expected WASM outputs using the assembler itself
 * This is useful for regression testing
 */

const fs = require('fs');
const path = require('path');
const { WatAssembler } = require('../wat-assembler.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const EXPECTED_DIR = path.join(__dirname, 'expected');

if (!fs.existsSync(EXPECTED_DIR)) {
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });
}

// Files that should FAIL assembly (error test files)
const SHOULD_FAIL = ['10-errors.wat'];

const watFiles = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.wat'));

console.log('Generating expected outputs using current assembler...\n');

const assembler = new WatAssembler();
let successCount = 0;
let failCount = 0;

for (const watFile of watFiles) {
  const watPath = path.join(FIXTURES_DIR, watFile);
  const baseName = watFile.replace('.wat', '');
  
  process.stdout.write(`  ${watFile} -> `);
  
  try {
    const source = fs.readFileSync(watPath, 'utf8');
    
    if (SHOULD_FAIL.includes(watFile)) {
      // This file should FAIL
      try {
        // Attempt to assemble - should throw
        assembler.assemble(source);
        
        // If we get here, it didn't fail as expected
        console.log('❌ FAILED (should have errored but succeeded)');
        failCount++;
      } catch (error) {
        // Success! It failed as expected
        // Save a marker that this file should fail
        const errorPath = path.join(EXPECTED_DIR, baseName + '.error');
        fs.writeFileSync(errorPath, 'expected failure');
        console.log('✓ created .error (correctly failed)');
        successCount++;
      }
    } else {
      // This file should succeed
      const wasmPath = path.join(EXPECTED_DIR, baseName + '.wasm');
      const wasm = assembler.assemble(source);
      fs.writeFileSync(wasmPath, Buffer.from(wasm));
      console.log('✓ created .wasm');
      successCount++;
    }
  } catch (error) {
    if (SHOULD_FAIL.includes(watFile)) {
      // This file should fail and it did
      const errorPath = path.join(EXPECTED_DIR, baseName + '.error');
      fs.writeFileSync(errorPath, 'expected failure');
      console.log('✓ created .error (correctly failed)');
      successCount++;
    } else {
      console.log('❌ FAILED: ' + error.message.split('\n')[0]);
      failCount++;
    }
  }
}

console.log(`\nSummary: ${successCount} passed, ${failCount} failed`);

if (failCount > 0) {
  process.exit(1);
}