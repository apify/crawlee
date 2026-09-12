import { Request } from '../../packages/core/src/request.js';

describe('Request#pushErrorMessage', () => {
    test.each([null, undefined])('falls back to the error message when the stack is %s', (stack) => {
        const error = new Error('response stream failed');
        Object.defineProperty(error, 'stack', { value: stack });
        const request = new Request({ url: 'https://example.com' });

        request.pushErrorMessage(error);

        expect(request.errorMessages).toEqual(['response stream failed']);
    });
});
