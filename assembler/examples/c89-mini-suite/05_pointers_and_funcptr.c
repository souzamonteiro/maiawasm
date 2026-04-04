int add(int a, int b) {
    return a + b;
}

void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}

int apply(int (*fn)(int, int), int x, int y) {
    return fn(x, y);
}

int test_entry(void) {
    int x = 10;
    int y = 25;
    int *p = &x;
    int **pp = &p;
    int vals[4] = {1, 2, 3, 4};
    int *ptrs[4];
    int i;
    int sum = 0;

    **pp = 12;
    swap(&x, &y);
    sum += apply(add, x, y);

    for (i = 0; i < 4; i++) {
        ptrs[i] = &vals[i];
        sum += *ptrs[i];
    }

    return sum;
}
