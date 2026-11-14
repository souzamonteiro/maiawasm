'use strict';

const fs = require('fs');
const path = require('path');

const MODULES = [
  { id: './wasm-strings.js', file: 'wasm-strings.js' },
  { id: './wasm-memory.js', file: 'wasm-memory.js' },
  { id: './wasm-binary.js', file: 'wasm-binary.js' },
  { id: './wasm-reader.js', file: 'wasm-reader.js' },
  { id: './wasm-control.js', file: 'wasm-control.js' },
  { id: './wasm-instructions.js', file: 'wasm-instructions.js' },
  { id: './wasm-module.js', file: 'wasm-module.js' },
  { id: './vm/errors.js', file: 'vm/errors.js' },
  { id: './vm/types.js', file: 'vm/types.js' },
  { id: './vm/numeric.js', file: 'vm/numeric.js' },
  { id: './vm/memory.js', file: 'vm/memory.js' },
  { id: './vm/simd.js', file: 'vm/simd.js' },
  { id: './vm/gc.js', file: 'vm/gc.js' },
  { id: './vm/validate.js', file: 'vm/validate.js' },
  { id: './vm/interpreter.js', file: 'vm/interpreter.js' },
  { id: './vm/store.js', file: 'vm/store.js' },
  { id: './wasm-vm.js', file: 'wasm-vm.js' }
];

function normalizeRequirePath(fromId, reqPath) {
  const fromDir = path.posix.dirname(fromId);
  const resolved = path.posix.normalize(path.posix.join(fromDir, reqPath));
  return resolved.startsWith('.') ? resolved : `./${resolved}`;
}

function buildBundle() {
  const chunks = [];
  chunks.push('(function (root, factory) {');
  chunks.push('  if (typeof module === "object" && module.exports) {');
  chunks.push('    module.exports = factory();');
  chunks.push('  } else {');
  chunks.push('    root.MaiaWasmVM = factory();');
  chunks.push('  }');
  chunks.push('})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {');
  chunks.push('  "use strict";');
  chunks.push('  const __modules = Object.create(null);');
  chunks.push('  const __cache = Object.create(null);');
  chunks.push('  function __require(id) {');
  chunks.push('    if (__cache[id]) return __cache[id].exports;');
  chunks.push('    if (!__modules[id]) throw new Error("Module not found in bundle: " + id);');
  chunks.push('    const mod = { exports: {} };');
  chunks.push('    __cache[id] = mod;');
  chunks.push('    __modules[id](mod, mod.exports, __require);');
  chunks.push('    return mod.exports;');
  chunks.push('  }');

  for (const entry of MODULES) {
    const absPath = path.join(__dirname, entry.file);
    let source = fs.readFileSync(absPath, 'utf8');
    source = source.replace(/^'use strict';\s*/m, '');
    source = source.replace(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, (_m, req) => {
      const targetId = normalizeRequirePath(entry.id, req);
      return `__require(${JSON.stringify(targetId)})`;
    });
    chunks.push(`  __modules[${JSON.stringify(entry.id)}] = function (module, exports, require) {\n${source}\n  };`);
  }

  chunks.push('  return __require("./wasm-vm.js");');
  chunks.push('});\n');

  const outPath = path.join(__dirname, 'wasm-vm.browser.js');
  fs.writeFileSync(outPath, chunks.join('\n'), 'utf8');
  return outPath;
}

if (require.main === module) {
  const out = buildBundle();
  console.log(`Built browser bundle: ${out}`);
}

module.exports = { buildBundle };
