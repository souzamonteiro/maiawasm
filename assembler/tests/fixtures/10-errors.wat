;; Test: Error handling
;; Expected: Assembler should catch these errors
;; Note: This file contains semantic errors but valid syntax

(module
  ;; Valid function - no error
  (func $valid_func
    i32.const 42
    return)
  
  ;; Error: unknown function reference
  (func $unknown_func
    call $nonexistent_func)  ;; This will fail - function doesn't exist
  
  ;; Error: invalid local index
  (func $invalid_local
    (local $x i32)
    local.get 999  ;; This will fail - local index out of bounds
    drop)
  
  ;; Error: type mismatch in return
  (func $type_mismatch (result i32)
    f32.const 3.14
    i32.trunc_f32_s)  ;; This should work - converts f32 to i32
  
  ;; Error: invalid memory offset syntax
  (func $invalid_memarg
    i32.load offset=foo  ;; This will fail - invalid offset syntax
    drop)
  
  ;; Duplicate export (semantic error)
  (export "duplicate" (func $type_mismatch))
  (export "duplicate" (func $invalid_local))  ;; This will fail - duplicate export
  
  ;; Error: invalid type reference
  (func $invalid_table
    i32.const 0
    i32.const 0
    i32.const 0
    call_indirect (type $nonexistent))  ;; This will fail - type doesn't exist
  
  ;; Valid function
  (func $dummy
    nop)
)