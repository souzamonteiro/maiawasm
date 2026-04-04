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
  (export "test_entry" (func 2))
  (export "__indirect_function_table" (table 0))
  (export "emscripten_stack_init" (func 3))
  (export "emscripten_stack_get_free" (func 4))
  (export "emscripten_stack_get_base" (func 5))
  (export "emscripten_stack_get_end" (func 6))
  (export "_emscripten_stack_restore" (func 7))
  (export "emscripten_stack_get_current" (func 8))

  (func (type 0)
    call 3
  )
  (func (type 1) (param i32) (result i32)
    (local i32 i32 i32)
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
    loop
    local.get 1
    i32.load offset=12 align=4
    local.get 1
    i32.load offset=8 align=4
    i32.add
    i32.load8_u offset=0 align=1
    local.set 2
    i32.const 24
    local.set 3
    local.get 2
    local.get 3
    i32.shl
    local.get 3
    i32.shr_s
    i32.eqz
    br_if 1
    local.get 1
    local.get 1
    i32.load offset=8 align=4
    i32.const 1
    i32.add
    i32.store offset=8 align=4
    br 0
    end
    end
    local.get 1
    i32.load offset=8 align=4
    return
  )
  (func (type 2) (result i32)
    (local i32 i32 i32 i32)
    global.get 0
    i32.const 32
    i32.sub
    local.set 0
    local.get 0
    global.set 0
    i32.const 0
    local.set 1
    local.get 0
    local.get 1
    i32.load offset=65564 align=4
    i32.store offset=24 align=4
    local.get 0
    local.get 1
    i64.load offset=65556 align=4
    i64.store offset=16 align=8
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
    i32.const 3
    i32.lt_s
    i32.const 1
    i32.and
    i32.eqz
    br_if 1
    local.get 0
    i32.load offset=12 align=4
    local.set 2
    local.get 0
    local.get 0
    i32.const 16
    i32.add
    local.get 2
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=0 align=4
    call 1
    i32.const 1
    i32.shl
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
    local.set 3
    local.get 0
    i32.const 32
    i32.add
    global.set 0
    local.get 3
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

  (data (i32.const 65536) "\66\69\72\73\74\00\74\68\69\72\64\00\73\65\63\6f\6e\64\00\00\00\00\01\00\0c\00\01\00\06\00\01\00")
)