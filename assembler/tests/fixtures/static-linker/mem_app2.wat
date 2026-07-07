;; Static linker regression: consumer reads from imported memory

(module
  (import "mem_lib" "mem" (memory 1))

  (func $mem_app2 (result i32)
    i32.const 0
    i32.const 65
    i32.store8
    i32.const 0
    i32.load8_u)

  (export "mem_app2" (func $mem_app2))
)
