int add(int a, int b) {
    return a + b;
}

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int fibonacci_recursive(int n) {
    if (n <= 1) {
        return n;
    }
    return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2);
}

int binary_search_recursive(int *arr, int lo, int hi, int target) {
    int mid;
    if (lo > hi) {
        return -1;
    }

    mid = (lo + hi) / 2;
    if (arr[mid] == target) {
        return mid;
    }

    if (arr[mid] > target) {
        return binary_search_recursive(arr, lo, mid - 1, target);
    }

    return binary_search_recursive(arr, mid + 1, hi, target);
}

int test_entry(void) {
    int arr[8] = {1, 3, 5, 7, 9, 11, 13, 15};
    int r = 0;

    r += add(3, 4);
    r += factorial(5);
    r += fibonacci_recursive(7);
    r += binary_search_recursive(arr, 0, 7, 11);

    return r;
}
