import { AsyncLocalStorage } from 'async_hooks';

import type { Awaitable } from '../typedefs';

const storage = new AsyncLocalStorage<{ checkFunction: () => void }>();

/**
 * Invoke a storage access checker function defined using {@link withCheckedStorageAccess} higher up in the call stack.
 */
export const checkStorageAccess = () => storage.getStore()?.checkFunction();

/**
 * Define a storage access checker function that should be used by calls to {@link checkStorageAccess} in the callbacks.
 *
 * @param checkFunction The check function that should be invoked by {@link checkStorageAccess} calls
 * @param callback The code that should be invoked with the `checkFunction` setting
 */
export const withCheckedStorageAccess = async <T>(checkFunction: () => void, callback: () => Awaitable<T>) =>
    storage.run({ checkFunction }, callback);
