int test_entry(void) {
    int i;
    int acc = 0;

    for (i = 0; i < 12; i++) {
        if (i == 5) {
            continue;
        }
        if (i == 10) {
            break;
        }
        acc += i;
    }

    i = 3;
    while (i > 0) {
        acc += i;
        i--;
    }

    i = 0;
    do {
        acc += 2;
        i++;
    } while (i < 2);

    switch (acc & 3) {
        case 0:
            acc += 11;
            break;
        case 1:
            acc += 22;
            break;
        default:
            acc += 33;
            break;
    }

    if (acc > 0) {
        goto done;
    }

    acc = -1;

done:
    return acc;
}
