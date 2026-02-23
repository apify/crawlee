import { beforeEach } from 'vitest';

import { serviceLocator } from '../packages/core/src/service_locator.js';

beforeEach(() => {
    serviceLocator.reset();
});
