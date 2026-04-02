;; Test: Table operations and element segments
;; Expected: Module with function table and call_indirect

(module
  ;; Define type first
  (type $binary_op (func (param i32 i32) (result i32)))
  
  ;; Define table with 10 elements of funcref
  (table $table 10 funcref)
  
  ;; Define some functions
  (func $add (type $binary_op) (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add)
  
  (func $sub (type $binary_op) (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.sub)
  
  (func $mul (type $binary_op) (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.mul)
  
  ;; Initialize table with functions
  (elem (i32.const 0) func $add $sub $mul)
  
  ;; Call function indirectly
  (func $call_indirect (param $index i32) (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    local.get $index
    call_indirect (type $binary_op))
  
  ;; Table operations
  (func $table_get (param $index i32) (result funcref)
    local.get $index
    table.get $table)
  
  (func $table_set (param $index i32) (param $func funcref)
    local.get $index
    local.get $func
    table.set $table)
  
  (func $table_size (result i32)
    table.size $table)
  
  (func $table_grow (param $delta i32) (param $func funcref) (result i32)
    ;; table.grow expects: (delta i32, value funcref) -> previous size
    local.get $func
    local.get $delta
    table.grow $table)
  
  (export "table" (table $table))
  (export "call_indirect" (func $call_indirect))
  (export "table_get" (func $table_get))
  (export "table_set" (func $table_set))
  (export "table_size" (func $table_size))
  (export "table_grow" (func $table_grow))
)