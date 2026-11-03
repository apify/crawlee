import { beforeEach } from 'vitest';

beforeEach(async () => {
    const { serviceLocator } = await import('../packages/core/src/service-locator.js');
    serviceLocator.reset();
});
