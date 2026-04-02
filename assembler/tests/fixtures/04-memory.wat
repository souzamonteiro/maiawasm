;; Test: Memory operations
;; Expected: Module with memory and memory access functions

(module
  ;; Define memory with 1 page (64KiB)
  (memory $mem 1)
  
  ;; Store a value at offset
  (func $store (param $offset i32) (param $value i32)
    local.get $offset
    local.get $value
    i32.store)
  
  ;; Load a value from offset
  (func $load (param $offset i32) (result i32)
    local.get $offset
    i32.load)
  
  ;; Store byte
  (func $store8 (param $offset i32) (param $value i32)
    local.get $offset
    local.get $value
    i32.store8)
  
  ;; Load byte (unsigned)
  (func $load8_u (param $offset i32) (result i32)
    local.get $offset
    i32.load8_u)
  
  ;; Copy memory region
  (func $copy (param $dest i32) (param $src i32) (param $len i32)
    local.get $dest
    local.get $src
    local.get $len
    memory.copy)
  
  ;; Fill memory with value
  (func $fill (param $dest i32) (param $value i32) (param $len i32)
    local.get $dest
    local.get $value
    local.get $len
    memory.fill)
  
  ;; Get memory size
  (func $size (result i32)
    memory.size)
  
  ;; Grow memory
  (func $grow (param $pages i32) (result i32)
    local.get $pages
    memory.grow)
  
  (export "memory" (memory $mem))
  (export "store" (func $store))
  (export "load" (func $load))
  (export "store8" (func $store8))
  (export "load8_u" (func $load8_u))
  (export "copy" (func $copy))
  (export "fill" (func $fill))
  (export "size" (func $size))
  (export "grow" (func $grow))
)