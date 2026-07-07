;; Static linker regression: provider exports local table with element segment

(module
  (type $t0 (func (result i32)))
  (table $tbl 1 funcref)

  (func $forty_two (type $t0) (result i32)
    i32.const 42)

  (elem (i32.const 0) func $forty_two)
  (export "tbl" (table $tbl))
)
