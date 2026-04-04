int global_counter = 0;
static int static_counter = 0;

void *allocate_memory(unsigned int size) {
    static char buffer[256];
    static unsigned int offset = 0;
    void *p = 0;

    if (offset + size <= 256) {
        p = (void *)&buffer[offset];
        offset += size;
    }

    return p;
}

int bump_counter(void) {
    global_counter++;
    static_counter++;
    return global_counter + static_counter;
}

int test_entry(void) {
    int i;
    int *mem;
    int s = 0;

    for (i = 0; i < 5; i++) {
        s += bump_counter();
    }

    mem = (int *)allocate_memory(4U * sizeof(int));
    if (mem != 0) {
        mem[0] = 7;
        mem[1] = 9;
        mem[2] = 11;
        mem[3] = 13;
        s += mem[0] + mem[3];
    }

    return s;
}
