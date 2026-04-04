#define MAX_ITEMS 3
#define WEIGHT(v) ((v) * 2)

int strlen_simple(const char *s) {
    int n = 0;
    while (s[n] != '\0') {
        n++;
    }
    return n;
}

int test_entry(void) {
    const char *items[MAX_ITEMS] = {"first", "second", "third"};
    int i;
    int total = 0;

    for (i = 0; i < MAX_ITEMS; i++) {
        total += WEIGHT(strlen_simple(items[i]));
    }

    return total;
}
