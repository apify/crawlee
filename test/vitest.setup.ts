import { beforeEach } from 'vitest';

beforeEach(async () => {
    const { globalServiceLocator } = await import('../packages/core/src/service_locator.js');
    // Reset the *global* locator explicitly rather than going through the `serviceLocator` proxy:
    // the proxy resolves to whatever locator is active, so inside an `aroundEach`-scoped locator
    // the reset would wipe services the test suite deliberately installed.
    globalServiceLocator.reset();
});
