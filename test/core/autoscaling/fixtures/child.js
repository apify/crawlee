// Dummy script for testing ps-tree.ts. The lifetime only has to outlast the "children are
// visible" poll in psTree.test.ts, which then waits for these to exit on their own.
setTimeout(() => {}, 1500);
