import { expect } from 'chai';
import { computeUniqueKey } from '../build/request';
import Apify from '../build/index';

describe('Apify.Request', () => {
    it('should not accept invalid values', () => {
        expect(() => new Apify.Request({ url: 1 })).to.throw();
        expect(() => new Apify.Request({ url: 'xxx' })).to.not.throw();
    });

    it('should create unique based on url', () => {
        const url = 'https://user:pass@website.com/a/vb/c /d?q=1&q=kjnjkn$lkn#lkmlkml';
        const normalizedUrl = computeUniqueKey(url);
        const request = new Apify.Request({ url });

        expect(request.uniqueKey).to.be.eql(normalizedUrl);
        expect(normalizedUrl).to.not.eql(url);
    });

    it('should should allow to push error messages', () => {
        const request = new Apify.Request({ url: 'http://example.com' });

        expect(request.errorMessages).to.be.eql(null);

        // Make a circular, unstringifiable object.
        const circularObj = { prop: 1 };
        circularObj.obj = circularObj;

        const arr = [1, 2, 3];
        const arrJson = JSON.stringify(arr, null, 2);

        const obj = { one: 1, two: 'two' };
        const objJson = JSON.stringify(obj, null, 2);

        request.pushErrorMessage(undefined);
        request.pushErrorMessage(false);
        request.pushErrorMessage(5);
        request.pushErrorMessage(() => 2);
        request.pushErrorMessage('bar');
        request.pushErrorMessage(Symbol('A Symbol'));
        request.pushErrorMessage(null);
        request.pushErrorMessage(new Error('foo'));
        request.pushErrorMessage({ message: 'A message.' });
        request.pushErrorMessage([1, 2, 3]);
        request.pushErrorMessage(obj);
        request.pushErrorMessage(circularObj);

        expect(request.errorMessages).to.be.eql([
            'Received: "undefined" of type: "undefined" instead of a proper message.',
            'Received: "false" of type: "boolean" instead of a proper message.',
            'Received: "5" of type: "number" instead of a proper message.',
            'Received: "() => 2" of type: "function" instead of a proper message.',
            'bar',
            'Symbol(A Symbol)',
            'Received: "null" instead of a proper message.',
            'foo',
            'A message.',
            arrJson,
            objJson,
            'Received an Object that is not stringifiable to JSON and has the following keys: prop; obj',
        ]);
    });

    it('should should allow to have a GET request with payload', () => {
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo' })).to.throw();
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo', method: 'POST' })).to.not.throw();
    });
});
