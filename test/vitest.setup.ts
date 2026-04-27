import { beforeEach } from 'vitest';

beforeEach(async () => {
    const { serviceLocator } = await import('../packages/core/src/service_locator.js');
    serviceLocator.reset();
});
