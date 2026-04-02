;; Test: Global variables
;; Expected: Module with mutable and immutable globals

(module
  ;; Imports must come first
  (import "env" "imported_global" (global $imported i32))
  
  ;; Immutable global
  (global $PI f64 (f64.const 3.14159))
  
  ;; Mutable global
  (global $counter (mut i32) (i32.const 0))
  
  ;; Export globals
  (export "PI" (global $PI))
  (export "counter" (global $counter))
  
  ;; Functions to manipulate globals
  (func $get_pi (result f64)
    global.get $PI)
  
  (func $get_counter (result i32)
    global.get $counter)
  
  (func $set_counter (param $value i32)
    local.get $value
    global.set $counter)
  
  (func $increment_counter
    global.get $counter
    i32.const 1
    i32.add
    global.set $counter)
  
  (func $get_imported (result i32)
    global.get $imported)
  
  (export "get_pi" (func $get_pi))
  (export "get_counter" (func $get_counter))
  (export "set_counter" (func $set_counter))
  (export "increment_counter" (func $increment_counter))
  (export "get_imported" (func $get_imported))
)