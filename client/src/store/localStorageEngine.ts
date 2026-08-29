import type { WebStorage } from "redux-persist/lib/types";

/**
 * Hand-rolled replacement for `redux-persist/lib/storage`.
 * That package is CJS and Vite's ESM interop occasionally resolves its
 * default export to the module namespace object instead of the actual
 * engine, causing `storage.getItem is not a function` at persistStore time.
 * This does exactly what that package does, with no import ambiguity.
 */
const localStorageEngine: WebStorage = {
  getItem(key: string) {
    return Promise.resolve(window.localStorage.getItem(key));
  },
  setItem(key: string, value: string) {
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

export default localStorageEngine;
