(module

  (type (func
  ))
  (type (func
    (result i32)
  ))
  (type (func
    (param i32)
  ))

  (table 1 1 funcref)

  (memory 257 257)

  (global (mut i32) (i32.const 65536))
  (global (mut i32) (i32.const 0))
  (global (mut i32) (i32.const 0))

  (export "memory" (memory 0))
  (export "test_entry" (func 1))
  (export "__indirect_function_table" (table 0))
  (export "emscripten_stack_init" (func 2))
  (export "emscripten_stack_get_free" (func 3))
  (export "emscripten_stack_get_base" (func 4))
  (export "emscripten_stack_get_end" (func 5))
  (export "_emscripten_stack_restore" (func 6))
  (export "emscripten_stack_get_current" (func 7))

  (func (type 0)
    call 2
  )
  (func (type 1) (result i32)
    (local i32 i32 i32)
    global.get 0
    i32.const 48
    i32.sub
    local.set 0
    local.get 0
    i32.const 0
    i32.store offset=8 align=4
    local.get 0
    i32.const 3
    i32.store offset=40 align=4
    local.get 0
    i32.const 4
    i32.store offset=44 align=4
    local.get 0
    i32.const 0
    i32.store offset=24 align=4
    local.get 0
    i32.const 0
    i32.store offset=28 align=4
    local.get 0
    i32.const 10
    i32.store offset=32 align=4
    local.get 0
    i32.const 20
    i32.store offset=36 align=4
    local.get 0
    i32.const 42
    i32.store offset=20 align=4
    local.get 0
    local.get 0
    i32.load offset=20 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    i32.const 65
    i32.store8 offset=20 align=1
    local.get 0
    i32.load8_u offset=20 align=1
    local.set 1
    i32.const 24
    local.set 2
    local.get 0
    local.get 1
    local.get 2
    i32.shl
    local.get 2
    i32.shr_s
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    i32.const 5
    i32.store offset=16 align=4
    local.get 0
    i32.const 1
    i32.store offset=12 align=4
    local.get 0
    local.get 0
    i32.load offset=40 align=4
    local.get 0
    i32.load offset=44 align=4
    i32.add
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    local.get 0
    i32.load offset=32 align=4
    local.get 0
    i32.load offset=36 align=4
    i32.add
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    local.get 0
    i32.load offset=16 align=4
    local.get 0
    i32.load offset=12 align=4
    i32.add
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    i32.load offset=8 align=4
    return
  )
  (func (type 0)
    i32.const 65536
    global.set 2
    i32.const 0
    i32.const 15
    i32.add
    i32.const -16
    i32.and
    global.set 1
  )
  (func (type 1) (result i32)
    global.get 0
    global.get 1
    i32.sub
  )
  (func (type 1) (result i32)
    global.get 2
  )
  (func (type 1) (result i32)
    global.get 1
  )
  (func (type 2) (param i32)
    local.get 0
    global.set 0
  )
  (func (type 1) (result i32)
    global.get 0
  )
)