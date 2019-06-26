import util from 'util';
import { expect } from 'chai';
import { normalizeUrl } from 'apify-shared/utilities';
import { hashPayload } from '../build/request';
import Apify from '../build/index';

describe('Apify.Request', () => {
    it('should not accept invalid values', () => {
        expect(() => new Apify.Request({ url: 1 })).to.throw();
        expect(() => new Apify.Request({ url: 'xxx' })).to.not.throw();
    });

    it('should create unique key based on url for GET requests', () => {
        const url = 'https://user:pass@website.com/a/vb/c /d?q=1&q=kjnjkn$lkn#lkmlkml';
        const normalizedUrl = normalizeUrl(url);
        const request = new Apify.Request({ url });

        expect(request.uniqueKey).to.be.eql(normalizedUrl);
        expect(request.uniqueKey).to.not.eql(request.url);
    });

    it('should create unique key based on url, method and payload for POST requests', () => {
        const url = 'https://user:pass@website.com/a/vb/c /d?q=1&q=kjnjkn$lkn#lkmlkml';
        const payload = JSON.stringify({ foo: 'bar' });
        const payloadHash = hashPayload(payload);
        const normalizedUrl = normalizeUrl(url);
        const request = new Apify.Request({ url, method: 'post', payload });

        const uniqueKey = `POST(${payloadHash}):${normalizedUrl}`;

        expect(request.uniqueKey).to.be.eql(uniqueKey);
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
        expect(new Apify.Request(data)).to.include(data);

        data.handledAt = (new Date()).toISOString();
        expect((new Apify.Request(data)).handledAt).to.be.a('date');
    });

    it('should allow to push error messages', () => {
        const request = new Apify.Request({ url: 'http://example.com' });

        expect(request.errorMessages).to.be.eql(null);

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

        expect(request.errorMessages).to.be.eql([
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
        expect(last).to.include('error message.');
        expect(last).to.include(' at ');
        expect(last).to.include(__filename.split(/[\\/]/g).pop());
    });

    it('should not allow to have a GET request with payload', () => {
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo' })).to.throw();
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo', method: 'POST' })).to.not.throw();
    });
});
