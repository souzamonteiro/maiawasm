#define SCALE 3

int test_entry(void) {
    int a = 10;
    int b = 20;
    int r = 0;

    r += a + b;
    r += b - a;
    r += a * 2;
    r += b / 2;
    r += b % 7;

    r += (a < b) ? 1 : 0;
    r += (a == b) ? 10 : 0;
    r += (a && b) ? 100 : 0;

    r += ((a + b) * SCALE) / 2;
    return r;
}
