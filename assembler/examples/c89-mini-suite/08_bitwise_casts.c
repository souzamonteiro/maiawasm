int test_entry(void) {
    int a = 0x0F;
    int b = 0xF0;
    int c;
    int result = 0;
    float x = 4.0f;
    int y;
    void *vp;
    float *fp;

    c = (a & b) | ((a ^ b) << 2);
    result += c;

    c = ~(a | b) & 0xFF;
    result += c;

    c = (a << 4) | (b >> 4);
    result += c;

    y = (int)x;
    result += y;

    vp = (void *)&x;
    fp = (float *)vp;
    result += (int)(*fp);

    return result;
}
