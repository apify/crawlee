import { ErrorTracker } from '../src/internals/error_tracker';

describe('ErrorTracker', () => {
    test('processing a non-error error should not crash', () => {
        const errorTracker = new ErrorTracker();
        // @ts-expect-error tracking non-error errors
        expect(() => errorTracker.add('foo')).not.toThrow();
    });
});
