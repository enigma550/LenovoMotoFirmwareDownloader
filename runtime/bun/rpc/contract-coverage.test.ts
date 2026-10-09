import { describe, expect, mock, test } from 'bun:test';

// The handler graph imports electrobun's Updater/BrowserWindow, whose module
// init expects a packaged runtime (version.json). Mock it away for the test.
const mockedBrowserWindow = class {
  ignored() {
    return true;
  }
};
const mockedUpdater = {
  checkForUpdate: async () => ({
    version: '',
    hash: '',
    updateAvailable: false,
    updateReady: false,
    error: '',
  }),
  downloadUpdate: async () => {},
  getLocallocalInfo: async () => ({}),
  appDataFolder: async () => '/tmp',
};

mock.module('electrobun/bun', () => ({
  ['BrowserWindow']: mockedBrowserWindow,
  ['Updater']: mockedUpdater,
}));

const { createRequestHandlers } = await import('./create-request-handlers.ts');
const { BUN_RPC_METHOD_NAMES } = await import('../../shared/desktop-rpc/schema-method-names.ts');

describe('RPC contract coverage', () => {
  test('every schema method has exactly one registered handler and vice versa', () => {
    const handlers = createRequestHandlers({
      sendDownloadProgress: () => {},
      sendUpdateProgress: () => {},
    });

    const registered = Object.keys(handlers)
      .filter((key) => typeof handlers[key] === 'function')
      .sort();
    const declared = [...BUN_RPC_METHOD_NAMES].sort();

    expect(registered).toEqual(declared);
  });

  test('declared method list has no duplicates', () => {
    const unique = new Set(BUN_RPC_METHOD_NAMES);
    expect(unique.size).toBe(BUN_RPC_METHOD_NAMES.length);
  });
});
