;; Test: Complex module with multiple sections
;; Expected: Module with types, imports, exports, and data

(module
  ;; Type definitions
  (type $binary_op (func (param i32 i32) (result i32)))
  (type $unary_op (func (param i32) (result i32)))
  
  ;; Imports (must come first)
  (import "console" "log" (func $log (param i32)))
  
  ;; Use imported memory OR define own memory, not both
  ;; Option 1: Use imported memory (uncomment to use)
  ;; (import "js" "memory" (memory $memory 1))
  
  ;; Option 2: Define own memory (uncomment to use)
  (memory $memory 1)
  
  ;; Function table
  (table $func_table 10 funcref)
  
  ;; Globals
  (global $debug (mut i32) (i32.const 0))
  
  ;; Data segment
  (data (i32.const 0) "Hello, World!\00")
  
  ;; Element segment
  (elem (i32.const 0) func $add $sub $mul $div)
  
  ;; Functions
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
  
  (func $div (type $binary_op) (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.div_s)
  
  (func $factorial (param $n i32) (result i32)
    (local $result i32)
    i32.const 1
    local.set $result
    
    (block $done
      (loop $loop
        local.get $n
        i32.const 1
        i32.lt_s
        if
          br $done
        end
        
        local.get $result
        local.get $n
        i32.mul
        local.set $result
        
        local.get $n
        i32.const 1
        i32.sub
        local.set $n
        
        br $loop))
    
    local.get $result)
  
  (func $call_with_debug (param $index i32) (param $a i32) (param $b i32) (result i32)
    ;; Log call if debug is enabled
    global.get $debug
    if
      local.get $index
      call $log
    end
    
    ;; Call function from table
    local.get $a
    local.get $b
    local.get $index
    call_indirect (type $binary_op))
  
  (func $toggle_debug
    global.get $debug
    i32.const 1
    i32.xor
    global.set $debug)
  
  (func $print_hello
    i32.const 0  ;; offset
    call $log_string)
  
  (func $log_string (param $offset i32)
    (local $i i32)
    (local $char i32)
    
    (block $done
      (loop $loop
        local.get $offset
        local.get $i
        i32.add
        i32.load8_u
        local.set $char
        
        local.get $char
        i32.eqz
        if
          br $done
        end
        
        local.get $char
        call $log
        
        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $loop))
    
    nop)
  
  ;; Exports
  (export "memory" (memory $memory))
  (export "add" (func $add))
  (export "sub" (func $sub))
  (export "mul" (func $mul))
  (export "div" (func $div))
  (export "factorial" (func $factorial))
  (export "call_with_debug" (func $call_with_debug))
  (export "toggle_debug" (func $toggle_debug))
  (export "print_hello" (func $print_hello))
)