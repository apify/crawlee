import { CrawlingRequest } from '@crawlee/basic';

describe('CrawlingRequest#pushErrorMessage', () => {
    test.each([null, undefined])('falls back to the error message when the stack is %s', (stack) => {
        const error = new Error('response stream failed');
        Object.defineProperty(error, 'stack', { value: stack });
        const request = new CrawlingRequest({ url: 'https://example.com' });

        request.pushErrorMessage(error);

        expect(request.errorMessages).toEqual(['response stream failed']);
    });
});
