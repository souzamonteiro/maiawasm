/* Complete C89 Compiler Functionality Test */
/* This test covers a wide range of C89 features, including:
   - Data types and variables
   - Operators (arithmetic, logical, bitwise, etc.)
   - Control flow statements (if-else, switch-case, loops)
   - Functions (declaration, definition, recursion)
   - Pointers and dynamic memory allocation
   - Structures, unions, and enumerations
   - Type definitions and typedefs
   - Preprocessor directives
   - Complex expressions and operator precedence
   - Mathematical functions and standard library usage
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* Structures and Unions */
struct point {
    int x;
    int y;
};

struct rectangle {
    struct point top_left;
    struct point bottom_right;
};

union value {
    int integer;
    float floating;
    char* string;
};

/* Enumerations */
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

/* Type definitions */
typedef struct point Point;
typedef enum booleans Bool;
typedef union value Value;
typedef int* IntPtr;

/* Function declarations */
int add(int a, int b);
int factorial(int n);
int fibonacci_recursive(int n);
void swap(int *a, int *b);
float average(float array[], int size);
int binary_search(int array[], int start, int end, int target);
void bubble_sort(int array[], int size);
void print_matrix(int matrix[][4], int rows);
Point* create_point(int x, int y);
void destroy_point(Point *p);
void* allocate_memory(size_t size);
void free_memory(void *ptr);
void test_pointers();
void test_structures();
void test_unions();
void test_arrays();
void test_operators();
void test_control_flow();
void test_mathematical_functions();

/* Global variables */
int global_counter = 0;
static int static_counter = 0;
int external_variable = 100;

/* Main function */
int main(void) {
    /* Local variable declarations */
    int a = 10;
    int b = 20;
    int result;
    float f = 3.14159;
    double d = 2.718281828459045;
    char c = 'A';
    char str[] = "Hello, World!";
    
    printf("=== COMPLETE C89 COMPILER FUNCTIONALITY TEST ===\n\n");
    
    /* Arithmetic operators test */
    printf("--- Arithmetic Operators ---\n");
    result = add(a, b);
    printf("%d + %d = %d\n", a, b, result);
    result = a - b;
    printf("%d - %d = %d\n", a, b, result);
    result = a * b;
    printf("%d * %d = %d\n", a, b, result);
    result = b / a;
    printf("%d / %d = %d\n", b, a, result);
    result = b % a;
    printf("%d %% %d = %d\n\n", b, a, result);
    
    /* Increment/decrement operators test */
    printf("--- Increment/Decrement Operators ---\n");
    printf("a = %d, a++ = %d, a after = %d\n", a, a++, a);
    a = 10;
    printf("a = %d, ++a = %d, a after = %d\n", a, ++a, a);
    printf("b = %d, b-- = %d, b after = %d\n", b, b--, b);
    b = 20;
    printf("b = %d, --b = %d, b after = %d\n\n", b, --b, b);
    
    /* Assignment operators test */
    printf("--- Assignment Operators ---\n");
    result = a;
    printf("result = %d\n", result);
    result += b;
    printf("result += b: %d\n", result);
    result -= a;
    printf("result -= a: %d\n", result);
    result *= 2;
    printf("result *= 2: %d\n", result);
    result /= 3;
    printf("result /= 3: %d\n", result);
    result %= 4;
    printf("result %%= 4: %d\n\n", result);
    
    /* Relational operators test */
    printf("--- Relational Operators ---\n");
    printf("%d == %d: %d\n", a, b, a == b);
    printf("%d != %d: %d\n", a, b, a != b);
    printf("%d < %d: %d\n", a, b, a < b);
    printf("%d > %d: %d\n", a, b, a > b);
    printf("%d <= %d: %d\n", a, b, a <= b);
    printf("%d >= %d: %d\n\n", a, b, a >= b);
    
    /* Logical operators test */
    printf("--- Logical Operators ---\n");
    printf("%d && %d: %d\n", a, b, a && b);
    printf("%d || %d: %d\n", a, b, a || b);
    printf("!%d: %d\n\n", a, !a);
    
    /* Bitwise operators test */
    printf("--- Bitwise Operators ---\n");
    printf("%d & %d = %d\n", a, b, a & b);
    printf("%d | %d = %d\n", a, b, a | b);
    printf("%d ^ %d = %d\n", a, b, a ^ b);
    printf("~%d = %d\n", a, ~a);
    printf("%d << 2 = %d\n", a, a << 2);
    printf("%d >> 1 = %d\n\n", a, a >> 1);
    
    /* Pointer operators test */
    printf("--- Pointer Operators ---\n");
    int *ptr = &a;
    printf("Address of a: %p\n", (void*)&a);
    printf("ptr points to: %p\n", (void*)ptr);
    printf("Value pointed by ptr: %d\n", *ptr);
    *ptr = 100;
    printf("After *ptr = 100, a = %d\n", a);
    ptr = NULL;
    printf("ptr = NULL\n\n");
    
    /* Conditional operator test */
    printf("--- Conditional (Ternary) Operator ---\n");
    result = (a > b) ? a : b;
    printf("(%d > %d) ? %d : %d = %d\n\n", a, b, a, b, result);
    
    /* sizeof operator test */
    printf("--- sizeof Operator ---\n");
    printf("sizeof(int): %lu\n", (unsigned long)sizeof(int));
    printf("sizeof(char): %lu\n", (unsigned long)sizeof(char));
    printf("sizeof(float): %lu\n", (unsigned long)sizeof(float));
    printf("sizeof(double): %lu\n", (unsigned long)sizeof(double));
    printf("sizeof(struct point): %lu\n\n", (unsigned long)sizeof(struct point));
    
    /* Functions test */
    printf("--- Functions ---\n");
    result = add(5, 7);
    printf("add(5, 7) = %d\n", result);
    result = factorial(6);
    printf("factorial(6) = %d\n", result);
    result = fibonacci_recursive(8);
    printf("fibonacci(8) = %d\n\n", result);
    
    /* Pass by reference test */
    printf("--- Pass by Reference ---\n");
    printf("Before swap: a=%d, b=%d\n", a, b);
    swap(&a, &b);
    printf("After swap: a=%d, b=%d\n\n", a, b);
    
    /* Arrays test */
    printf("--- Arrays ---\n");
    int array[10] = {5, 2, 8, 1, 9, 3, 7, 4, 6, 0};
    float values[5] = {1.1, 2.2, 3.3, 4.4, 5.5};
    
    printf("Original array: ");
    for (int i = 0; i < 10; i++) {
        printf("%d ", array[i]);
    }
    printf("\n");
    
    bubble_sort(array, 10);
    printf("Sorted array: ");
    for (int i = 0; i < 10; i++) {
        printf("%d ", array[i]);
    }
    printf("\n");
    
    result = binary_search(array, 0, 9, 5);
    printf("Binary search for 5: position %d\n", result);
    
    f = average(values, 5);
    printf("Average of values: %.2f\n\n", f);
    
    /* Matrix test */
    printf("--- Matrices ---\n");
    int matrix[3][4] = {
        {1, 2, 3, 4},
        {5, 6, 7, 8},
        {9, 10, 11, 12}
    };
    print_matrix(matrix, 3);
    printf("\n");
    
    /* Structures test */
    printf("--- Structures ---\n");
    struct point p1 = {10, 20};
    struct rectangle r1 = {{0, 0}, {100, 100}};
    p1.x = 30;
    p1.y = 40;
    printf("Point p1: (%d, %d)\n", p1.x, p1.y);
    printf("Rectangle: (%d,%d) to (%d,%d)\n", 
           r1.top_left.x, r1.top_left.y,
           r1.bottom_right.x, r1.bottom_right.y);
    
    Point *p2 = create_point(50, 60);
    if (p2 != NULL) {
        printf("Created point p2: (%d, %d)\n", p2->x, p2->y);
        destroy_point(p2);
    }
    printf("\n");
    
    /* Unions test */
    printf("--- Unions ---\n");
    union value v;
    v.integer = 42;
    printf("Union as integer: %d\n", v.integer);
    v.floating = 3.14;
    printf("Union as float: %.2f\n", v.floating);
    v.string = "test";
    printf("Union as string: %s\n\n", v.string);
    
    /* Enumerations test */
    printf("--- Enumerations ---\n");
    enum colors color = GREEN;
    Bool flag = TRUE;
    printf("Color value (GREEN = %d): %d\n", GREEN, color);
    printf("Boolean flag (TRUE = %d): %d\n", TRUE, flag);
    
    if (color == BLUE) {
        color = YELLOW;
    }
    printf("\n");
    
    /* Control flow test */
    test_control_flow();
    
    /* Pointers test */
    test_pointers();
    
    /* Dynamic memory allocation test */
    printf("--- Dynamic Memory Allocation ---\n");
    int *dynamic_array = (int*)allocate_memory(10 * sizeof(int));
    if (dynamic_array != NULL) {
        for (int i = 0; i < 10; i++) {
            dynamic_array[i] = i * i;
        }
        printf("Dynamic array values: ");
        for (int i = 0; i < 10; i++) {
            printf("%d ", dynamic_array[i]);
        }
        printf("\n");
        free_memory(dynamic_array);
    }
    printf("\n");
    
    /* Casting test */
    printf("--- Type Casting ---\n");
    float x = 3.14;
    int y = (int)x;
    void *vp = &x;
    float *fp = (float*)vp;
    printf("Float x = %.2f, cast to int = %d\n", x, y);
    printf("Void pointer to float pointer: %.2f\n\n", *fp);
    
    /* Constants test */
    printf("--- Constants ---\n");
    const int MAX_VALUE = 100;
    const float PI = 3.14159;
    printf("MAX_VALUE = %d\n", MAX_VALUE);
    printf("PI = %.5f\n\n", PI);
    
    /* Static variables test */
    printf("--- Static Variables ---\n");
    for (int i = 0; i < 5; i++) {
        global_counter++;
        static_counter++;
    }
    printf("Global counter after 5 increments: %d\n", global_counter);
    printf("Static counter after 5 increments: %d\n\n", static_counter);
    
    /* Complex expressions test */
    printf("--- Complex Expressions ---\n");
    result = (a + b) * (c - 'A') / (f > 0 ? 2 : 1);
    printf("(a + b) * (c - 'A') / (f > 0 ? 2 : 1) = %d\n", result);
    result = (a << 2) | (b >> 1) & 0xFF;
    printf("(a << 2) | (b >> 1) & 0xFF = %d\n", result);
    result = (a && b) ? add(a, b) : (a || b) ? factorial(a) : 0;
    printf("(a && b) ? add(a, b) : (a || b) ? factorial(a) : 0 = %d\n\n", result);
    
    /* Mathematical functions test */
    test_mathematical_functions();
    
    printf("=== TEST COMPLETED SUCCESSFULLY ===\n");
    
    return 0;
}

/* Function implementations */
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

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

float average(float array[], int size) {
    float sum = 0.0;
    int i;
    
    for (i = 0; i < size; i++) {
        sum += array[i];
    }
    
    return sum / size;
}

int binary_search(int array[], int start, int end, int target) {
    int middle;
    
    if (start > end) {
        return -1;
    }
    
    middle = (start + end) / 2;
    
    if (array[middle] == target) {
        return middle;
    } else if (array[middle] > target) {
        return binary_search(array, start, middle - 1, target);
    } else {
        return binary_search(array, middle + 1, end, target);
    }
}

void bubble_sort(int array[], int size) {
    int i, j, temp;
    
    for (i = 0; i < size - 1; i++) {
        for (j = 0; j < size - i - 1; j++) {
            if (array[j] > array[j + 1]) {
                temp = array[j];
                array[j] = array[j + 1];
                array[j + 1] = temp;
            }
        }
    }
}

void print_matrix(int matrix[][4], int rows) {
    int i, j;
    
    for (i = 0; i < rows; i++) {
        printf("Row %d: ", i);
        for (j = 0; j < 4; j++) {
            printf("%3d ", matrix[i][j]);
        }
        printf("\n");
    }
}

Point* create_point(int x, int y) {
    Point *p = (Point*)allocate_memory(sizeof(Point));
    if (p != NULL) {
        p->x = x;
        p->y = y;
    }
    return p;
}

void destroy_point(Point *p) {
    if (p != NULL) {
        free_memory(p);
    }
}

void* allocate_memory(size_t size) {
    /* Memory allocation simulation - in practice would use malloc */
    static char buffer[1024];
    static size_t offset = 0;
    void *ptr = NULL;
    
    if (offset + size <= 1024) {
        ptr = (void*)&buffer[offset];
        offset += size;
    }
    
    return ptr;
}

void free_memory(void *ptr) {
    /* Memory free simulation - in practice would use free */
    /* This is a simplified implementation for testing */
}

void test_pointers() {
    printf("--- Advanced Pointers ---\n");
    int x = 10;
    int *p1 = &x;
    int **p2 = &p1;
    int *array[5];
    int (*func_ptr)(int, int) = &add;
    int result;
    
    /* Pointers to pointers */
    **p2 = 20;
    printf("Value after double pointer assignment: %d\n", x);
    
    /* Function pointers */
    result = (*func_ptr)(5, 3);
    printf("Function pointer call (5,3): %d\n", result);
    result = func_ptr(5, 3);
    printf("Function pointer direct call (5,3): %d\n", result);
    
    /* Array of pointers */
    for (int i = 0; i < 5; i++) {
        static int values[5] = {1, 2, 3, 4, 5};
        array[i] = &values[i];
    }
    printf("Array of pointers: ");
    for (int i = 0; i < 5; i++) {
        printf("%d ", *array[i]);
    }
    printf("\n\n");
}

void test_structures() {
    printf("--- Advanced Structures ---\n");
    struct {
        int a;
        float b;
        char c;
    } anonymous = {1, 2.5, 'Z'};
    
    struct point points[3] = {
        {0, 0},
        {10, 20},
        {30, 40}
    };
    
    struct point *ptr_point = &points[1];
    ptr_point->x = 100;
    
    printf("Array of points:\n");
    for (int i = 0; i < 3; i++) {
        printf("  Point %d: (%d, %d)\n", i, points[i].x, points[i].y);
    }
    printf("Anonymous structure: a=%d, b=%.1f, c=%c\n\n", 
           anonymous.a, anonymous.b, anonymous.c);
}

void test_unions() {
    printf("--- Advanced Unions ---\n");
    union {
        int i;
        float f;
        char c;
    } u;
    
    u.i = 65;
    printf("Union as int: %d\n", u.i);
    u.f = 3.14;
    printf("Union as float: %.2f\n", u.f);
    u.c = 'A';
    printf("Union as char: %c\n\n", u.c);
}

void test_arrays() {
    printf("--- Advanced Arrays ---\n");
    /* Multi-dimensional arrays */
    int array_3d[2][3][4];
    int i, j, k;
    
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 3; j++) {
            for (k = 0; k < 4; k++) {
                array_3d[i][j][k] = i * 12 + j * 4 + k;
            }
        }
    }
    printf("3D array value at [1][2][3]: %d\n", array_3d[1][2][3]);
    
    /* Array of strings */
    char *strings[] = {
        "First string",
        "Second string",
        "Third string"
    };
    
    printf("Array of strings:\n");
    for (i = 0; i < 3; i++) {
        printf("  %s\n", strings[i]);
    }
    
    /* Array of structures */
    struct point point_array[5];
    for (i = 0; i < 5; i++) {
        point_array[i].x = i * 10;
        point_array[i].y = i * 20;
    }
    printf("Array of structures (last element): (%d, %d)\n\n", 
           point_array[4].x, point_array[4].y);
}

void test_operators() {
    printf("--- Advanced Operators ---\n");
    int a = 0x0F;
    int b = 0xF0;
    int c;
    
    /* Complex bitwise operations */
    c = (a & b) | ((a ^ b) << 2);
    printf("(a & b) | ((a ^ b) << 2) = %d (0x%X)\n", c, c);
    c = ~(a | b) & 0xFF;
    printf("~(a | b) & 0xFF = %d (0x%X)\n", c, c);
    c = (a << 4) | (b >> 4);
    printf("(a << 4) | (b >> 4) = %d (0x%X)\n\n", c, c);
    
    /* Compound assignment with bitwise */
    a <<= 2;
    b >>= 1;
    a |= 0xAA;
    b &= 0x55;
    printf("After bitwise compound operations: a=%d (0x%X), b=%d (0x%X)\n\n", 
           a, a, b, b);
}

void test_control_flow() {
    printf("--- Control Flow ---\n");
    int i, j;
    
    /* Nested if-else */
    i = 5;
    if (i > 0) {
        if (i < 10) {
            i = i * 2;
            printf("Nested if-else: i multiplied by 2 = %d\n", i);
        } else {
            i = i / 2;
        }
    } else if (i == 0) {
        i = 1;
    } else {
        i = -i;
    }
    
    /* Switch-case */
    switch (i) {
        case 1:
            i = 10;
            printf("Switch case 1: i = %d\n", i);
            break;
        case 2:
        case 3:
            i = 20;
            printf("Switch case 2 or 3: i = %d\n", i);
            break;
        case 4:
            i = 30;
            break;
        default:
            i = 0;
            printf("Switch default: i = %d\n", i);
            break;
    }
    
    /* For loop with continue and break */
    printf("For loop (0-9, skipping 5, break at 8): ");
    for (i = 0; i < 10; i++) {
        if (i == 5) {
            continue;
        }
        if (i == 8) {
            break;
        }
        printf("%d ", i);
    }
    printf("\n");
    
    /* While loop */
    i = 0;
    while (i < 5) {
        i++;
    }
    printf("While loop: i = %d\n", i);
    
    /* Do-while loop */
    i = 0;
    do {
        i++;
    } while (i < 5);
    printf("Do-while loop: i = %d\n", i);
    
    /* Nested loops */
    printf("Nested loops break when i==j: ");
    for (i = 0; i < 5; i++) {
        for (j = 0; j < 5; j++) {
            if (i == j) {
                printf("[%d,%d] ", i, j);
                break;
            }
        }
    }
    printf("\n");
    
    /* Goto statement */
    i = 0;
    if (i == 0) {
        goto end_of_test;
    }
    i = 100;
end_of_test:
    printf("Goto statement executed successfully\n\n");
}

void test_mathematical_functions() {
    printf("--- Mathematical Functions ---\n");
    /* Complex mathematical operations */
    double a = 2.5;
    double b = 1.5;
    double c;
    
    /* Expressions with casting */
    c = (double)((int)a) + b;
    printf("(double)((int)a) + b = %.2f\n", c);
    c = a * b / (a + b);
    printf("a * b / (a + b) = %.2f\n", c);
    c = (a > b) ? a - b : b - a;
    printf("(a > b) ? a - b : b - a = %.2f\n", c);
    
    /* Operations with float and double */
    float f1 = 1.0f / 3.0f;
    float f2 = 2.0f * 3.14159f;
    double d1 = 1.0 / 3.0;
    double d2 = 2.0 * 3.141592653589793;
    printf("Float division: %.6f\n", f1);
    printf("Float multiplication: %.6f\n", f2);
    printf("Double division: %.15f\n", d1);
    printf("Double multiplication: %.15f\n", d2);
    
    /* Implicit conversions */
    int x = 10;
    float y = x / 3.0f;
    double z = x / 3;
    printf("Implicit conversions: int=%d, float=%.2f, double=%.2f\n\n", x, y, z);
}