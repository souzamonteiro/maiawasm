#!/usr/bin/env node
/**
 * WAT Parser Test Suite
 * Validates that the WAT parser correctly parses all fixtures
 * (fixtures are validated against external WebAssembler)
 */

const fs = require('fs');
const path = require('path');

// Load the WAT parser
const WAT = require('../WAT.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const EXPECTED_AST_DIR = path.join(__dirname, 'expected-ast');

// Optional AST snapshot mode (safe by default: disabled)
const ENABLE_AST_CHECK = process.env.AST_CHECK === '1' || process.argv.includes('--ast');
const UPDATE_AST = process.env.UPDATE_AST === '1' || process.argv.includes('--update-ast');
const ENABLE_ROUNDTRIP = process.env.ROUNDTRIP_CHECK === '1' || process.argv.includes('--roundtrip');
const NEED_AST = ENABLE_AST_CHECK || ENABLE_ROUNDTRIP;

// Test files and their expected status
const TEST_CASES = [
  { file: '01-basic-module.wat', shouldPass: true },
  { file: '02-arithmetic.wat', shouldPass: true },
  { file: '03-control-flow.wat', shouldPass: true },
  { file: '04-memory.wat', shouldPass: true },
  { file: '05-table.wat', shouldPass: true },
  { file: '06-globals.wat', shouldPass: true },
  { file: '07-float.wat', shouldPass: true },
  { file: '08-simd.wat', shouldPass: true },
  { file: '09-complex.wat', shouldPass: true },
  { file: '10-errors.wat', shouldPass: false }  // Should fail
];

function createAstBuilder(source) {
  let root = null;
  const stack = [];

  const handler = {
    reset: () => {
      root = null;
      stack.length = 0;
    },
    startNonterminal: (name, begin) => {
      const node = {
        kind: 'nt',
        name,
        begin,
        children: []
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        root = node;
      }

      stack.push(node);
    },
    endNonterminal: (name, end) => {
      const node = stack.pop();
      if (node) {
        node.end = end;
      }
    },
    terminal: (token, begin, end) => {
      if (stack.length === 0) return;
      stack[stack.length - 1].children.push({
        kind: 't',
        token,
        text: source.slice(begin, end)
      });
    },
    whitespace: () => {}
  };

  return {
    handler,
    getAst: () => root
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeAst(node) {
  if (!node) return null;

  if (node.kind === 'nt') {
    return {
      kind: 'nt',
      name: node.name,
      children: (node.children || []).map(normalizeAst)
    };
  }

  return {
    kind: 't',
    token: node.token,
    text: node.text
  };
}

function collectTerminalTexts(node, out) {
  if (!node) return;
  if (node.kind === 't') {
    out.push(node.text);
    return;
  }
  for (const child of node.children || []) {
    collectTerminalTexts(child, out);
  }
}

function needsSpace(prev, curr) {
  if (!prev) return false;
  if (curr === ')') return false;
  if (prev === '(') return false;
  return true;
}

function astToWat(ast) {
  const tokens = [];
  collectTerminalTexts(ast, tokens);

  let out = '';
  let prev = '';
  for (const t of tokens) {
    if (needsSpace(prev, t)) out += ' ';
    out += t;
    prev = t;
  }
  return out;
}

console.log('WAT Parser Test Suite');
console.log('='.repeat(60));
console.log('Testing WAT parser with validated fixture files\n');
if (ENABLE_AST_CHECK) {
  console.log(`AST snapshot mode: ${UPDATE_AST ? 'UPDATE' : 'VERIFY'}`);
  console.log();
}
if (ENABLE_ROUNDTRIP) {
  console.log('AST roundtrip mode: ON');
  console.log();
}

let passed = 0;
let failed = 0;
const failures = [];

for (const testCase of TEST_CASES) {
  const filePath = path.join(FIXTURES_DIR, testCase.file);
  
  process.stdout.write(`${testCase.file.padEnd(25)} ... `);
  
  if (!fs.existsSync(filePath)) {
    console.log('⊘ NOT FOUND');
    continue;
  }
  
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    
    // Event handler: basic mode or AST-building mode
    const astBuilder = NEED_AST ? createAstBuilder(source) : null;
    const eventHandler = astBuilder
      ? astBuilder.handler
      : {
          reset: () => {},
          startNonterminal: () => {},
          endNonterminal: () => {},
          terminal: () => {},
          whitespace: () => {}
        };
    
    // Parse the file
    const parser = new WAT(source, eventHandler);
    
    try {
      parser.parse_wat();
      
      if (testCase.shouldPass) {
        if (ENABLE_ROUNDTRIP) {
          const ast = astBuilder.getAst();
          const regeneratedWat = astToWat(ast);

          try {
            const roundtripBuilder = createAstBuilder(regeneratedWat);
            const roundtripParser = new WAT(regeneratedWat, roundtripBuilder.handler);
            roundtripParser.parse_wat();

            const originalNorm = JSON.stringify(normalizeAst(ast));
            const regeneratedNorm = JSON.stringify(normalizeAst(roundtripBuilder.getAst()));

            if (originalNorm !== regeneratedNorm) {
              console.log('✗ FAIL (AST roundtrip mismatch)');
              failed++;
              failures.push({
                file: testCase.file,
                reason: 'AST->WAT->AST mismatch'
              });
              continue;
            }
          } catch (roundtripError) {
            let rtErrorMsg = 'Unknown roundtrip error';
            if (roundtripError.getMessage) {
              rtErrorMsg = roundtripError.getMessage();
            } else if (roundtripError.message) {
              rtErrorMsg = roundtripError.message;
            } else {
              rtErrorMsg = String(roundtripError);
            }

            console.log('✗ FAIL (roundtrip parse failed)');
            failed++;
            failures.push({
              file: testCase.file,
              reason: `Roundtrip parse failed: ${rtErrorMsg}`
            });
            continue;
          }
        }

        if (ENABLE_AST_CHECK) {
          const ast = astBuilder.getAst();
          const snapshotPath = path.join(EXPECTED_AST_DIR, `${testCase.file}.ast.json`);

          if (UPDATE_AST) {
            ensureDir(EXPECTED_AST_DIR);
            fs.writeFileSync(snapshotPath, JSON.stringify(ast, null, 2), 'utf8');
            console.log('✓ PASS (AST snapshot updated)');
            passed++;
          } else {
            if (!fs.existsSync(snapshotPath)) {
              console.log('✗ FAIL (AST snapshot not found)');
              failed++;
              failures.push({
                file: testCase.file,
                reason: `Missing AST snapshot: ${snapshotPath}`
              });
            } else {
              const expectedAst = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
              const actual = JSON.stringify(ast);
              const expected = JSON.stringify(expectedAst);

              if (actual === expected) {
                console.log('✓ PASS');
                passed++;
              } else {
                console.log('✗ FAIL (AST mismatch)');
                failed++;
                failures.push({
                  file: testCase.file,
                  reason: 'AST snapshot mismatch'
                });
              }
            }
          }
        } else {
          console.log('✓ PASS');
          passed++;
        }
      } else {
        console.log('✗ FAIL (should have failed but passed)');
        failed++;
        failures.push({
          file: testCase.file,
          reason: 'Expected parse to fail but it succeeded'
        });
      }
    } catch (parseError) {
      // Parse failed
      if (!testCase.shouldPass) {
        console.log('✓ PASS (correctly failed)');
        passed++;
      } else {
        let errorMsg = 'Unknown error';
        if (parseError.getMessage) {
          errorMsg = parseError.getMessage();
        } else if (parseError.message) {
          errorMsg = parseError.message;
        } else {
          errorMsg = String(parseError);
        }
        
        console.log(`✗ FAIL`);
        failed++;
        failures.push({
          file: testCase.file,
          reason: errorMsg
        });
      }
    }
  } catch (err) {
    console.log(`✗ FAIL (${err.message})`);
    failed++;
    failures.push({
      file: testCase.file,
      reason: err.message
    });
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failures.length > 0) {
  console.log('Failures:\n');
  failures.forEach((failure, index) => {
    console.log(`${index + 1}. ${failure.file}`);
    console.log(`   Error: ${failure.reason.split('\n')[0]}`);
    console.log();
  });
}

process.exit(failed > 0 ? 1 : 0);
