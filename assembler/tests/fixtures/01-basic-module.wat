;; Test: Basic module structure
;; Expected: Simple module with one function

(module
  ;; Simple function that returns 42
  (func $answer (result i32)
    i32.const 42
    return)
  
  ;; Export the function
  (export "answer" (func $answer))
)