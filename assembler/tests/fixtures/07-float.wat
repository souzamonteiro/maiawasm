;; Test: Floating point operations
;; Expected: Functions with f32 and f64 arithmetic

(module
  ;; f32 operations
  (func $f32_add (param $a f32) (param $b f32) (result f32)
    local.get $a
    local.get $b
    f32.add)
  
  (func $f32_mul (param $a f32) (param $b f32) (result f32)
    local.get $a
    local.get $b
    f32.mul)
  
  (func $f32_sqrt (param $a f32) (result f32)
    local.get $a
    f32.sqrt)
  
  (func $f32_min (param $a f32) (param $b f32) (result f32)
    local.get $a
    local.get $b
    f32.min)
  
  (func $f32_max (param $a f32) (param $b f32) (result f32)
    local.get $a
    local.get $b
    f32.max)
  
  (func $f32_abs (param $a f32) (result f32)
    local.get $a
    f32.abs)
  
  (func $f32_neg (param $a f32) (result f32)
    local.get $a
    f32.neg)
  
  (func $f32_ceil (param $a f32) (result f32)
    local.get $a
    f32.ceil)
  
  (func $f32_floor (param $a f32) (result f32)
    local.get $a
    f32.floor)
  
  (func $f32_trunc (param $a f32) (result f32)
    local.get $a
    f32.trunc)
  
  (func $f32_nearest (param $a f32) (result f32)
    local.get $a
    f32.nearest)
  
  ;; f64 operations
  (func $f64_add (param $a f64) (param $b f64) (result f64)
    local.get $a
    local.get $b
    f64.add)
  
  (func $f64_mul (param $a f64) (param $b f64) (result f64)
    local.get $a
    local.get $b
    f64.mul)
  
  (func $f64_div (param $a f64) (param $b f64) (result f64)
    local.get $a
    local.get $b
    f64.div)
  
  (func $hypotenuse (param $x f64) (param $y f64) (result f64)
    local.get $x
    local.get $x
    f64.mul
    local.get $y
    local.get $y
    f64.mul
    f64.add
    f64.sqrt)
  
  (export "f32_add" (func $f32_add))
  (export "f32_mul" (func $f32_mul))
  (export "f32_sqrt" (func $f32_sqrt))
  (export "f32_min" (func $f32_min))
  (export "f32_max" (func $f32_max))
  (export "f32_abs" (func $f32_abs))
  (export "f32_neg" (func $f32_neg))
  (export "f32_ceil" (func $f32_ceil))
  (export "f32_floor" (func $f32_floor))
  (export "f32_trunc" (func $f32_trunc))
  (export "f32_nearest" (func $f32_nearest))
  (export "f64_add" (func $f64_add))
  (export "f64_mul" (func $f64_mul))
  (export "f64_div" (func $f64_div))
  (export "hypotenuse" (func $hypotenuse))
)