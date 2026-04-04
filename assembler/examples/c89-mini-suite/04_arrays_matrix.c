void bubble_sort(int *arr, int n) {
    int i;
    int j;
    int tmp;

    for (i = 0; i < n - 1; i++) {
        for (j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                tmp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = tmp;
            }
        }
    }
}

int matrix_sum(int m[3][4]) {
    int i;
    int j;
    int s = 0;

    for (i = 0; i < 3; i++) {
        for (j = 0; j < 4; j++) {
            s += m[i][j];
        }
    }

    return s;
}

int test_entry(void) {
    int arr[6] = {9, 2, 8, 1, 5, 4};
    int m[3][4] = {
        {1, 2, 3, 4},
        {5, 6, 7, 8},
        {9, 10, 11, 12}
    };

    bubble_sort(arr, 6);
    return arr[0] + arr[5] + matrix_sum(m);
}
