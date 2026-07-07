;; Static linker regression: provider exports local memory with seeded data

(module
  (memory $mem 1)
  (export "mem" (memory $mem))
)
