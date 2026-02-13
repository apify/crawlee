import { beforeEach } from 'vitest';

beforeEach(async () => {
    // Dynamic import is needed here to break a circular dependency:
    // vitest.setup -> service_locator -> local_event_manager -> event_manager -> service_locator
    const { serviceLocator } = await import('../packages/core/src/service_locator.js');
    serviceLocator.reset();
});
