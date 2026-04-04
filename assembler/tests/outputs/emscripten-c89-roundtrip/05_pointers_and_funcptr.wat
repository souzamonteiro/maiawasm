(module

  (type (func
    (param i32 i32)
    (result i32)
  ))
  (type (func
  ))
  (type (func
    (param i32 i32)
  ))
  (type (func
    (param i32 i32 i32)
    (result i32)
  ))
  (type (func
    (result i32)
  ))
  (type (func
    (param i32)
  ))

  (table 2 2 funcref)

  (memory 258 258)

  (global (mut i32) (i32.const 65536))
  (global (mut i32) (i32.const 0))
  (global (mut i32) (i32.const 0))

  (export "memory" (memory 0))
  (export "__indirect_function_table" (table 0))
  (export "test_entry" (func 4))
  (export "emscripten_stack_init" (func 5))
  (export "emscripten_stack_get_free" (func 6))
  (export "emscripten_stack_get_base" (func 7))
  (export "emscripten_stack_get_end" (func 8))
  (export "_emscripten_stack_restore" (func 9))
  (export "emscripten_stack_get_current" (func 10))

  (elem (i32.const 1) func 1)

  (func (type 1)
    call 5
  )
  (func (type 0) (param i32 i32) (result i32)
    (local i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 2
    local.get 2
    local.get 0
    i32.store offset=12 align=4
    local.get 2
    local.get 1
    i32.store offset=8 align=4
    local.get 2
    i32.load offset=12 align=4
    local.get 2
    i32.load offset=8 align=4
    i32.add
    return
  )
  (func (type 2) (param i32 i32)
    (local i32 i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 2
    local.get 2
    local.get 0
    i32.store offset=12 align=4
    local.get 2
    local.get 1
    i32.store offset=8 align=4
    local.get 2
    local.get 2
    i32.load offset=12 align=4
    i32.load offset=0 align=4
    i32.store offset=4 align=4
    local.get 2
    i32.load offset=8 align=4
    i32.load offset=0 align=4
    local.set 3
    local.get 2
    i32.load offset=12 align=4
    local.get 3
    i32.store offset=0 align=4
    local.get 2
    i32.load offset=4 align=4
    local.set 4
    local.get 2
    i32.load offset=8 align=4
    local.get 4
    i32.store offset=0 align=4
    return
  )
  (func (type 3) (param i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 3
    local.get 3
    global.set 0
    local.get 3
    local.get 0
    i32.store offset=12 align=4
    local.get 3
    local.get 1
    i32.store offset=8 align=4
    local.get 3
    local.get 2
    i32.store offset=4 align=4
    local.get 3
    i32.load offset=12 align=4
    local.set 4
    local.get 3
    i32.load offset=8 align=4
    local.get 3
    i32.load offset=4 align=4
    local.get 4
    call_indirect (type 0)
    local.set 5
    local.get 3
    i32.const 16
    i32.add
    global.set 0
    local.get 5
    return
  )
  (func (type 4) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    i32.const 64
    i32.sub
    local.set 0
    local.get 0
    global.set 0
    local.get 0
    i32.const 10
    i32.store offset=60 align=4
    local.get 0
    i32.const 25
    i32.store offset=56 align=4
    local.get 0
    local.get 0
    i32.const 60
    i32.add
    i32.store offset=52 align=4
    local.get 0
    local.get 0
    i32.const 52
    i32.add
    i32.store offset=48 align=4
    i32.const 0
    local.set 1
    local.get 0
    local.get 1
    i64.load offset=65544 align=8
    i64.store offset=40 align=8
    local.get 0
    local.get 1
    i64.load offset=65536 align=8
    i64.store offset=32 align=8
    local.get 0
    i32.const 0
    i32.store offset=8 align=4
    local.get 0
    i32.load offset=48 align=4
    i32.load offset=0 align=4
    i32.const 12
    i32.store offset=0 align=4
    local.get 0
    i32.const 60
    i32.add
    local.get 0
    i32.const 56
    i32.add
    call 2
    local.get 0
    i32.load offset=60 align=4
    local.set 2
    local.get 0
    i32.load offset=56 align=4
    local.set 3
    local.get 0
    i32.const 1
    local.get 2
    local.get 3
    call 3
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    i32.const 0
    i32.store offset=12 align=4
    block
    loop
    local.get 0
    i32.load offset=12 align=4
    i32.const 4
    i32.lt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 1
    local.get 0
    i32.load offset=12 align=4
    local.set 4
    local.get 0
    i32.const 32
    i32.add
    local.get 4
    i32.const 2
    i32.shl
    i32.add
    local.set 5
    local.get 0
    i32.load offset=12 align=4
    local.set 6
    local.get 0
    i32.const 16
    i32.add
    local.get 6
    i32.const 2
    i32.shl
    i32.add
    local.get 5
    i32.store offset=0 align=4
    local.get 0
    i32.load offset=12 align=4
    local.set 7
    local.get 0
    local.get 0
    i32.const 16
    i32.add
    local.get 7
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=0 align=4
    i32.load offset=0 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    local.get 0
    i32.load offset=12 align=4
    i32.const 1
    i32.add
    i32.store offset=12 align=4
    br 0
    end
    end
    local.get 0
    i32.load offset=8 align=4
    local.set 8
    local.get 0
    i32.const 64
    i32.add
    global.set 0
    local.get 8
    return
  )
  (func (type 1)
    i32.const 65536
    global.set 2
    i32.const 0
    i32.const 15
    i32.add
    i32.const -16
    i32.and
    global.set 1
  )
  (func (type 4) (result i32)
    global.get 0
    global.get 1
    i32.sub
  )
  (func (type 4) (result i32)
    global.get 2
  )
  (func (type 4) (result i32)
    global.get 1
  )
  (func (type 5) (param i32)
    local.get 0
    global.set 0
  )
  (func (type 4) (result i32)
    global.get 0
  )

  (data (i32.const 65536) "\01\00\00\00\02\00\00\00\03\00\00\00\04\00\00\00")
)