// Test setup: polyfill browser IndexedDB in Node tests
// Using fake-indexeddb to provide `indexedDB` / `IDBKeyRange` etc.
import 'fake-indexeddb/auto';

// Optionally set a small global timer tolerance or other test utils here
// e.g., (globalThis as any).TEST_START_TIME = Date.now();
