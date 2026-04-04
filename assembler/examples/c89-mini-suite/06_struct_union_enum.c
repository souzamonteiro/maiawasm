typedef struct {
    int x;
    int y;
} Point;

typedef struct {
    Point top_left;
    Point bottom_right;
} Rect;

typedef union {
    int i;
    float f;
    char c;
} Value;

enum colors {
    RED,
    GREEN = 5,
    BLUE,
    YELLOW = 10
};

enum booleans {
    FALSE = 0,
    TRUE = 1
};

int test_entry(void) {
    Point p;
    Rect r;
    Value v;
    enum colors color;
    enum booleans ok;
    int out = 0;

    p.x = 3;
    p.y = 4;

    r.top_left.x = 0;
    r.top_left.y = 0;
    r.bottom_right.x = 10;
    r.bottom_right.y = 20;

    v.i = 42;
    out += v.i;
    v.c = 'A';
    out += (int)v.c;

    color = GREEN;
    ok = TRUE;

    out += p.x + p.y;
    out += r.bottom_right.x + r.bottom_right.y;
    out += color + ok;

    return out;
}
