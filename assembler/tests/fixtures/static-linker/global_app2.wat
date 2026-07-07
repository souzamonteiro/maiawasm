;; Static linker regression: consumer reads imported global

(module
  (import "global_lib" "g" (global i32))

  (func $global_app2 (result i32)
    global.get 0)

  (export "global_app2" (func $global_app2))
)
