;; Test: Control flow instructions
;; Expected: Functions with blocks, loops, and conditionals

(module
  ;; If-then-else: return absolute value
  (func $abs (param $x i32) (result i32)
    (if (result i32)
      (local.get $x)
      (i32.const 0)
      (i32.lt_s)
      (then
        i32.const 0
        local.get $x
        i32.sub)
      (else
        local.get $x)))
  
  ;; Loop: factorial
  (func $factorial (param $n i32) (result i32)
    (local $i i32)
    (local $result i32)
    
    i32.const 1
    local.set $result
    i32.const 1
    local.set $i
    
    (block $done
      (loop $loop
        ;; if i > n, break
        local.get $i
        local.get $n
        i32.gt_s
        if
          br $done
        end
        
        ;; result = result * i
        local.get $result
        local.get $i
        i32.mul
        local.set $result
        
        ;; i = i + 1
        local.get $i
        i32.const 1
        i32.add
        local.set $i
        
        br $loop))
    
    local.get $result)
  
  ;; Block with multiple returns
  (func $max3 (param $a i32) (param $b i32) (param $c i32) (result i32)
    (block $exit (result i32)
      ;; Check if a is largest
      (if
        (local.get $a)
        (local.get $b)
        (i32.gt_s)
        (then
          (if
            (local.get $a)
            (local.get $c)
            (i32.gt_s)
            (then
              local.get $a
              br $exit))
          local.get $a
          br $exit))
      
      ;; Check if b is largest
      (if
        (local.get $b)
        (local.get $c)
        (i32.gt_s)
        (then
          local.get $b
          br $exit))
      
      ;; c is largest
      local.get $c))
  
  (export "abs" (func $abs))
  (export "factorial" (func $factorial))
  (export "max3" (func $max3))
)