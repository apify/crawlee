import util from 'util';
import { normalizeUrl } from 'apify-shared/utilities';
import { hashPayload } from '../build/request';
import Apify from '../build/index';

describe('Apify.Request', () => {
    it('should not accept invalid values', () => {
        expect(() => new Apify.Request({ url: 1 })).toThrowError();
        expect(() => new Apify.Request({ url: 'xxx' })).not.toThrowError();
    });

    it('should create unique key based on url for GET requests', () => {
        const url = 'https://user:pass@website.com/a/vb/c /d?q=1&q=kjnjkn$lkn#lkmlkml';
        const normalizedUrl = normalizeUrl(url);
        const request = new Apify.Request({ url });

        expect(request.uniqueKey).toEqual(normalizedUrl);
        expect(request.uniqueKey).not.toEqual(request.url);
    });

    it('should create unique key based on url, method and payload for POST requests', () => {
        const url = 'https://user:pass@website.com/a/vb/c /d?q=1&q=kjnjkn$lkn#lkmlkml';
        const payload = JSON.stringify({ foo: 'bar' });
        const payloadHash = hashPayload(payload);
        const normalizedUrl = normalizeUrl(url);
        const request = new Apify.Request({ url, method: 'post', payload, useExtendedUniqueKey: true });

        const uniqueKey = `POST(${payloadHash}):${normalizedUrl}`;

        expect(request.uniqueKey).toEqual(uniqueKey);
    });

    it('works', () => {
        const data = {
            id: '123',
            url: 'http://www.example.com',
            uniqueKey: 'uniq',
            method: 'POST',
            payload: 'Some payload',
            noRetry: true,
            retryCount: 1,
            errorMessages: [
                'Something bad',
            ],
            headers: {
                Test: 'Bla',
            },
            userData: {
                yo: 123,
            },
            handledAt: new Date(),
        };
        expect(new Apify.Request(data)).toEqual(expect.arrayContaining([data]));

        data.handledAt = (new Date()).toISOString();
        expect((new Apify.Request(data)).handledAt).toBeInstanceOf(Date);
    });

    it('should allow to push error messages', () => {
        const request = new Apify.Request({ url: 'http://example.com' });

        expect(request.errorMessages).toBe(null);

        // Make a circular, unstringifiable object.
        const circularObj = { prop: 1 };
        circularObj.obj = circularObj;
        const circularObjInspect = util.inspect(circularObj);

        const obj = { one: 1, two: 'two' };
        const objInspect = util.inspect(obj);

        const toStr = {
            toString() {
                return 'toString';
            },
        };

        request.pushErrorMessage(undefined);
        request.pushErrorMessage(false);
        request.pushErrorMessage(5);
        request.pushErrorMessage(() => 2);
        request.pushErrorMessage('bar');
        request.pushErrorMessage(Symbol('A Symbol'));
        request.pushErrorMessage(null);
        request.pushErrorMessage(new Error('foo'), { omitStack: true });
        request.pushErrorMessage({ message: 'A message.' });
        request.pushErrorMessage([1, 2, 3]);
        request.pushErrorMessage(obj);
        request.pushErrorMessage(toStr);
        request.pushErrorMessage(circularObj);

        expect(request.errorMessages).toEqual([
            'undefined',
            'false',
            '5',
            '() => 2',
            'bar',
            'Symbol(A Symbol)',
            'null',
            'foo',
            'A message.',
            '1,2,3',
            objInspect,
            'toString',
            circularObjInspect,
        ]);

        request.pushErrorMessage(new Error('error message.'));
        const last = request.errorMessages.pop();
        expect(last).toEqual(expect.arrayContaining(['error message.']));
        expect(last).toEqual(expect.arrayContaining([' at ']));
        expect(last).toEqual(expect.arrayContaining([__filename.split(/[\\/]/g).pop()]));
    });

    it('should not allow to have a GET request with payload', () => {
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo' })).toThrowError();
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo', method: 'POST' })).not.toThrowError();
    });
});
