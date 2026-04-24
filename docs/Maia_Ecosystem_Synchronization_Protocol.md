# Maia Ecosystem Synchronization Protocol

This protocol is mandatory whenever MaiaCC changes, regardless of change size.

## Mandatory Order Across Repositories

1. MaiaCC
2. MaiaWASM
3. MaiaC
4. MaiaCpp
5. MaiaJS

## Step 1: MaiaCC

1. Regenerate parser artifacts.
2. Run full test suite.
3. Commit and push.

## Step 2: MaiaWASM (This Repository)

1. Pull the MaiaCC submodule.
2. Regenerate parser artifacts.
3. Run all tests.
4. Commit and push.

## Step 3: MaiaC

1. Pull MaiaCC and MaiaWASM submodules.
2. Regenerate parser artifacts.
3. Run all tests.
4. Compile test.c and validate output.
5. Commit and push.

## Step 4: MaiaCpp

1. Pull MaiaCC, MaiaWASM, and MaiaC submodules.
2. Regenerate parser artifacts.
3. Run all tests.
4. Commit and push.

## Step 5: MaiaJS

1. Pull MaiaCC, MaiaWASM, MaiaC, and MaiaCpp submodules.
2. For MaiaJS parser changes, edit EBNF and regenerate parser.
3. Run MaiaJS parser/compiler tests.
