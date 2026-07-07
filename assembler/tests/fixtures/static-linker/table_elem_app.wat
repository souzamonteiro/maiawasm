;; Static linker regression: consumer uses imported table via call_indirect

(module
  (type $t0 (func (result i32)))
  (import "table_lib" "tbl" (table 1 funcref))

  (func $table_elem_app (result i32)
    i32.const 0
    call_indirect (type $t0))

  (export "table_elem_app" (func $table_elem_app))
)
