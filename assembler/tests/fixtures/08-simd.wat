;; Test: SIMD operations
;; Expected: Functions with vector operations

(module
  ;; i8x16 operations
  (func $i8x16_splat (param $x i32) (result v128)
    local.get $x
    i8x16.splat)
  
  (func $i8x16_add (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    i8x16.add)
  
  (func $i8x16_sub (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    i8x16.sub)
  
  ;; i16x8 operations
  (func $i16x8_splat (param $x i32) (result v128)
    local.get $x
    i16x8.splat)
  
  (func $i16x8_mul (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    i16x8.mul)
  
  ;; i32x4 operations
  (func $i32x4_splat (param $x i32) (result v128)
    local.get $x
    i32x4.splat)
  
  (func $i32x4_add (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    i32x4.add)
  
  ;; f32x4 operations
  (func $f32x4_splat (param $x f32) (result v128)
    local.get $x
    f32x4.splat)
  
  (func $f32x4_add (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    f32x4.add)
  
  (func $f32x4_mul (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    f32x4.mul)
  
  ;; Vector constants
  (func $make_vec (result v128)
    v128.const i32x4 1 2 3 4)
  
  ;; Extract lanes
  (func $extract_lane (param $v v128) (result i32)
    local.get $v
    i32x4.extract_lane 0)
  
  ;; Replace lane
  (func $replace_lane (param $v v128) (param $x i32) (result v128)
    local.get $v
    local.get $x
    i32x4.replace_lane 2)
  
  ;; Vector shuffle
  (func $shuffle (param $a v128) (param $b v128) (result v128)
    local.get $a
    local.get $b
    i8x16.shuffle 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15)
  
  (export "i8x16_splat" (func $i8x16_splat))
  (export "i8x16_add" (func $i8x16_add))
  (export "i8x16_sub" (func $i8x16_sub))
  (export "i16x8_splat" (func $i16x8_splat))
  (export "i16x8_mul" (func $i16x8_mul))
  (export "i32x4_splat" (func $i32x4_splat))
  (export "i32x4_add" (func $i32x4_add))
  (export "f32x4_splat" (func $f32x4_splat))
  (export "f32x4_add" (func $f32x4_add))
  (export "f32x4_mul" (func $f32x4_mul))
  (export "make_vec" (func $make_vec))
  (export "extract_lane" (func $extract_lane))
  (export "replace_lane" (func $replace_lane))
  (export "shuffle" (func $shuffle))
)