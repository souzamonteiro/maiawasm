'use strict';

function naturalAlignment(op) {
  const scalar = /^(i32|i64|f32|f64)\.(?:load|store)(8|16|32)?(?:_[su])?$/.exec(op);
  if (scalar) return Math.log2(Number(scalar[2] || scalar[1].slice(1)) / 8);
  if (op === 'v128.load' || op === 'v128.store') return 4;
  if (/^v128\.load(?:8x8|16x4|32x2)_[su]$/.test(op)) return 3;
  const vector = /^v128\.(?:load|store)(8|16|32|64)_(?:splat|lane|zero)$/.exec(op);
  if (vector) return Math.log2(Number(vector[1]) / 8);
  throw new Error(`Unknown memory access instruction ${op}`);
}

module.exports = { naturalAlignment };
