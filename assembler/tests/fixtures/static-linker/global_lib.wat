;; Static linker regression: provider exports local immutable global

(module
  (global $g i32 (i32.const 7))
  (export "g" (global $g))
)
