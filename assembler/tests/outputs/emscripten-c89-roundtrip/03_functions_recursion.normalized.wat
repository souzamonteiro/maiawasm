(module

  (type (func
  ))
  (type (func
    (param i32 i32)
    (result i32)
  ))
  (type (func
    (param i32)
    (result i32)
  ))
  (type (func
    (param i32 i32 i32 i32)
    (result i32)
  ))
  (type (func
    (result i32)
  ))
  (type (func
    (param i32)
  ))

  (table 1 1 funcref)

  (memory 258 258)

  (global (mut i32) (i32.const 65536))
  (global (mut i32) (i32.const 0))
  (global (mut i32) (i32.const 0))

  (export "memory" (memory 0))
  (export "test_entry" (func 5))
  (export "__indirect_function_table" (table 0))
  (export "emscripten_stack_init" (func 6))
  (export "emscripten_stack_get_free" (func 7))
  (export "emscripten_stack_get_base" (func 8))
  (export "emscripten_stack_get_end" (func 9))
  (export "_emscripten_stack_restore" (func 10))
  (export "emscripten_stack_get_current" (func 11))

  (func (type 0)
    call 6
  )
  (func (type 1) (param i32 i32) (result i32)
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
  (func (type 2) (param i32) (result i32)
    (local i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 1
    local.get 1
    global.set 0
    local.get 1
    local.get 0
    i32.store offset=8 align=4
    block
    block
    local.get 1
    i32.load offset=8 align=4
    i32.const 1
    i32.le_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 1
    i32.const 1
    i32.store offset=12 align=4
    br 1
    end
    local.get 1
    local.get 1
    i32.load offset=8 align=4
    local.get 1
    i32.load offset=8 align=4
    i32.const 1
    i32.sub
    call 2
    i32.mul
    i32.store offset=12 align=4
    end
    local.get 1
    i32.load offset=12 align=4
    local.set 2
    local.get 1
    i32.const 16
    i32.add
    global.set 0
    local.get 2
    return
  )
  (func (type 2) (param i32) (result i32)
    (local i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 1
    local.get 1
    global.set 0
    local.get 1
    local.get 0
    i32.store offset=8 align=4
    block
    block
    local.get 1
    i32.load offset=8 align=4
    i32.const 1
    i32.le_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 1
    local.get 1
    i32.load offset=8 align=4
    i32.store offset=12 align=4
    br 1
    end
    local.get 1
    local.get 1
    i32.load offset=8 align=4
    i32.const 1
    i32.sub
    call 3
    local.get 1
    i32.load offset=8 align=4
    i32.const 2
    i32.sub
    call 3
    i32.add
    i32.store offset=12 align=4
    end
    local.get 1
    i32.load offset=12 align=4
    local.set 2
    local.get 1
    i32.const 16
    i32.add
    global.set 0
    local.get 2
    return
  )
  (func (type 3) (param i32 i32 i32 i32) (result i32)
    (local i32 i32)
    global.get 0
    i32.const 32
    i32.sub
    local.set 4
    local.get 4
    global.set 0
    local.get 4
    local.get 0
    i32.store offset=24 align=4
    local.get 4
    local.get 1
    i32.store offset=20 align=4
    local.get 4
    local.get 2
    i32.store offset=16 align=4
    local.get 4
    local.get 3
    i32.store offset=12 align=4
    block
    block
    local.get 4
    i32.load offset=20 align=4
    local.get 4
    i32.load offset=16 align=4
    i32.gt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 4
    i32.const 4294967295
    i32.store offset=28 align=4
    br 1
    end
    local.get 4
    local.get 4
    i32.load offset=20 align=4
    local.get 4
    i32.load offset=16 align=4
    i32.add
    i32.const 2
    i32.div_s
    i32.store offset=8 align=4
    block
    local.get 4
    i32.load offset=24 align=4
    local.get 4
    i32.load offset=8 align=4
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=0 align=4
    local.get 4
    i32.load offset=12 align=4
    i32.eq
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 4
    local.get 4
    i32.load offset=8 align=4
    i32.store offset=28 align=4
    br 1
    end
    block
    local.get 4
    i32.load offset=24 align=4
    local.get 4
    i32.load offset=8 align=4
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=0 align=4
    local.get 4
    i32.load offset=12 align=4
    i32.gt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 4
    local.get 4
    i32.load offset=24 align=4
    local.get 4
    i32.load offset=20 align=4
    local.get 4
    i32.load offset=8 align=4
    i32.const 1
    i32.sub
    local.get 4
    i32.load offset=12 align=4
    call 4
    i32.store offset=28 align=4
    br 1
    end
    local.get 4
    local.get 4
    i32.load offset=24 align=4
    local.get 4
    i32.load offset=8 align=4
    i32.const 1
    i32.add
    local.get 4
    i32.load offset=16 align=4
    local.get 4
    i32.load offset=12 align=4
    call 4
    i32.store offset=28 align=4
    end
    local.get 4
    i32.load offset=28 align=4
    local.set 5
    local.get 4
    i32.const 32
    i32.add
    global.set 0
    local.get 5
    return
  )
  (func (type 4) (result i32)
    (local i32 i32 i32)
    global.get 0
    i32.const 48
    i32.sub
    local.set 0
    local.get 0
    global.set 0
    i32.const 0
    local.set 1
    local.get 0
    local.get 1
    i64.load offset=65560 align=8
    i64.store offset=40 align=8
    local.get 0
    local.get 1
    i64.load offset=65552 align=8
    i64.store offset=32 align=8
    local.get 0
    local.get 1
    i64.load offset=65544 align=8
    i64.store offset=24 align=8
    local.get 0
    local.get 1
    i64.load offset=65536 align=8
    i64.store offset=16 align=8
    local.get 0
    i32.const 0
    i32.store offset=12 align=4
    local.get 0
    i32.const 3
    i32.const 4
    call 1
    local.get 0
    i32.load offset=12 align=4
    i32.add
    i32.store offset=12 align=4
    local.get 0
    i32.const 5
    call 2
    local.get 0
    i32.load offset=12 align=4
    i32.add
    i32.store offset=12 align=4
    local.get 0
    i32.const 7
    call 3
    local.get 0
    i32.load offset=12 align=4
    i32.add
    i32.store offset=12 align=4
    local.get 0
    local.get 0
    i32.const 16
    i32.add
    i32.const 0
    i32.const 7
    i32.const 11
    call 4
    local.get 0
    i32.load offset=12 align=4
    i32.add
    i32.store offset=12 align=4
    local.get 0
    i32.load offset=12 align=4
    local.set 2
    local.get 0
    i32.const 48
    i32.add
    global.set 0
    local.get 2
    return
  )
  (func (type 0)
    i32.const 65536
    global.set 2
    i32.const 0
    i32.const 15
    i32.add
    i32.const 4294967280
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

  (data (i32.const 65536) "\01\00\00\00\03\00\00\00\05\00\00\00\07\00\00\00\09\00\00\00\0b\00\00\00\0d\00\00\00\0f\00\00\00")
)