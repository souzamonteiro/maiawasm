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
    (local i32 i32)
    global.get 0
    i32.const 16
    i32.sub
    local.set 0
    local.get 0
    i32.const 0
    i32.store offset=8 align=4
    local.get 0
    i32.const 0
    i32.store offset=12 align=4
    block
    loop
    local.get 0
    i32.load offset=12 align=4
    i32.const 12
    i32.lt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 1
    block
    block
    local.get 0
    i32.load offset=12 align=4
    i32.const 5
    i32.eq
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    br 1
    end
    block
    local.get 0
    i32.load offset=12 align=4
    i32.const 10
    i32.eq
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    br 3
    end
    local.get 0
    local.get 0
    i32.load offset=12 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    end
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
    i32.const 3
    i32.store offset=12 align=4
    block
    loop
    local.get 0
    i32.load offset=12 align=4
    i32.const 0
    i32.gt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 1
    local.get 0
    local.get 0
    i32.load offset=12 align=4
    local.get 0
    i32.load offset=8 align=4
    i32.add
    i32.store offset=8 align=4
    local.get 0
    local.get 0
    i32.load offset=12 align=4
    i32.const -1
    i32.add
    i32.store offset=12 align=4
    br 0
    end
    end
    local.get 0
    i32.const 0
    i32.store offset=12 align=4
    loop
    local.get 0
    local.get 0
    i32.load offset=8 align=4
    i32.const 2
    i32.add
    i32.store offset=8 align=4
    local.get 0
    local.get 0
    i32.load offset=12 align=4
    i32.const 1
    i32.add
    i32.store offset=12 align=4
    local.get 0
    i32.load offset=12 align=4
    i32.const 2
    i32.lt_s
    i32.const 1
    i32.and
    br_if 0
    end
    local.get 0
    i32.load offset=8 align=4
    i32.const 3
    i32.and
    local.set 1
    local.get 1
    i32.const 1
    i32.gt_u
    drop
    block
    block
    block
    block
    local.get 1
    br_table 0 1 2
    end
    local.get 0
    local.get 0
    i32.load offset=8 align=4
    i32.const 11
    i32.add
    i32.store offset=8 align=4
    br 2
    end
    local.get 0
    local.get 0
    i32.load offset=8 align=4
    i32.const 22
    i32.add
    i32.store offset=8 align=4
    br 1
    end
    local.get 0
    local.get 0
    i32.load offset=8 align=4
    i32.const 33
    i32.add
    i32.store offset=8 align=4
    end
    block
    block
    local.get 0
    i32.load offset=8 align=4
    i32.const 0
    i32.gt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    br 1
    end
    local.get 0
    i32.const -1
    i32.store offset=8 align=4
    end
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