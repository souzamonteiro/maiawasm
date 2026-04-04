(module

  (type (func
  ))
  (type (func
    (param i32)
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
  (export "test_entry" (func 3))
  (export "__indirect_function_table" (table 0))
  (export "emscripten_stack_init" (func 4))
  (export "emscripten_stack_get_free" (func 5))
  (export "emscripten_stack_get_base" (func 6))
  (export "emscripten_stack_get_end" (func 7))
  (export "_emscripten_stack_restore" (func 8))
  (export "emscripten_stack_get_current" (func 9))

  (func (type 0)
    call 4
  )
  (func (type 1) (param i32) (result i32)
    (local i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 1
    local.get 1
    local.get 0
    i32.store offset=12 align=4
    local.get 1
    i32.const 0
    i32.store offset=8 align=4
    block
    i32.const 0
    i32.load offset=65808 align=4
    local.get 1
    i32.load offset=12 align=4
    i32.add
    i32.const 256
    i32.le_u
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 1
    i32.const 0
    i32.load offset=65808 align=4
    i32.const 65552
    i32.add
    i32.store offset=8 align=4
    local.get 1
    i32.load offset=12 align=4
    i32.const 0
    i32.load offset=65808 align=4
    i32.add
    local.set 2
    i32.const 0
    local.get 2
    i32.store offset=65808 align=4
    end
    local.get 1
    i32.load offset=8 align=4
    return
  )
  (func (type 2) (result i32)
    (local i32 i32)
    i32.const 0
    i32.load offset=65536 align=4
    i32.const 1
    i32.add
    local.set 0
    i32.const 0
    local.get 0
    i32.store offset=65536 align=4
    i32.const 0
    i32.load offset=65812 align=4
    i32.const 1
    i32.add
    local.set 1
    i32.const 0
    local.get 1
    i32.store offset=65812 align=4
    i32.const 0
    i32.load offset=65536 align=4
    i32.const 0
    i32.load offset=65812 align=4
    i32.add
    return
  )
  (func (type 2) (result i32)
    (local i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 0
    local.get 0
    global.set 0
    local.get 0
    i32.const 0
    i32.store offset=4 align=4
    local.get 0
    i32.const 0
    i32.store offset=12 align=4
    block
    loop
    local.get 0
    i32.load offset=12 align=4
    i32.const 5
    i32.lt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 1
    local.get 0
    call 2
    local.get 0
    i32.load offset=4 align=4
    i32.add
    i32.store offset=4 align=4
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
    i32.const 16
    call 1
    i32.store offset=8 align=4
    block
    local.get 0
    i32.load offset=8 align=4
    i32.const 0
    i32.ne
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    local.get 0
    i32.load offset=8 align=4
    i32.const 7
    i32.store offset=0 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.const 9
    i32.store offset=4 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.const 11
    i32.store offset=8 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.const 13
    i32.store offset=12 align=4
    local.get 0
    local.get 0
    i32.load offset=8 align=4
    i32.load offset=0 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.load offset=12 align=4
    i32.add
    local.get 0
    i32.load offset=4 align=4
    i32.add
    i32.store offset=4 align=4
    end
    local.get 0
    i32.load offset=4 align=4
    local.set 1
    local.get 0
    i32.const 16
    i32.add
    global.set 0
    local.get 1
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
  (func (type 2) (result i32)
    global.get 0
    global.get 1
    i32.sub
  )
  (func (type 2) (result i32)
    global.get 2
  )
  (func (type 2) (result i32)
    global.get 1
  )
  (func (type 3) (param i32)
    local.get 0
    global.set 0
  )
  (func (type 2) (result i32)
    global.get 0
  )
)