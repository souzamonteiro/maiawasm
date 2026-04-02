/**
 * Generate expected WASM outputs for tests
 * 
 * This script handles both valid files (should compile) and
 * error files (should fail with specific errors)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const EXPECTED_DIR = path.join(__dirname, 'expected');

// Ensure expected directory exists
if (!fs.existsSync(EXPECTED_DIR)) {
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });
}

// Files that should FAIL to compile (error test files)
const ERROR_FILES = ['10-errors.wat'];

// Check if wat2wasm is available
function hasWat2Wasm() {
  try {
    execSync('wat2wasm --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Find all .wat files
const watFiles = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.wat'));

console.log('Generating expected outputs...\n');

if (!hasWat2Wasm()) {
  console.log('⚠️  wat2wasm not found. Install with: brew install wabt');
  console.log('   Only creating placeholder files.\n');
}

let successCount = 0;
let failCount = 0;

for (const watFile of watFiles) {
  const watPath = path.join(FIXTURES_DIR, watFile);
  const baseName = watFile.replace('.wat', '');
  
  process.stdout.write(`  ${watFile} ... `);
  
  if (ERROR_FILES.includes(watFile)) {
    // For error files, we create a .error file with a note
    const errorPath = path.join(EXPECTED_DIR, baseName + '.error');
    fs.writeFileSync(errorPath, 'This file should fail to compile');
    console.log('✓ created .error file');
    successCount++;
    
  } else {
    // For valid files, try to compile with wat2wasm if available
    const wasmPath = path.join(EXPECTED_DIR, baseName + '.wasm');
    
    if (hasWat2Wasm()) {
      try {
        execSync(`wat2wasm ${watPath} -o ${wasmPath}`, { stdio: 'pipe' });
        console.log('✓ compiled');
        successCount++;
      } catch (error) {
        console.log('❌ compilation failed');
        failCount++;
      }
    } else {
      // If wat2wasm not available, create a placeholder
      fs.writeFileSync(wasmPath + '.placeholder', 'Install wabt to generate actual WASM');
      console.log('⚠ created placeholder');
      successCount++;
    }
  }
}

console.log(`\nSummary: ${successCount} succeeded, ${failCount} failed`);