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

        request.pushErrorMessage(new Error('foo'));
        request.pushErrorMessage('bar');

        expect(request.errorMessages).to.be.eql(['foo', 'bar']);
    });

    it('should should allow to have a GET request with payload', () => {
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo' })).to.throw();
        expect(() => new Apify.Request({ url: 'http://example.com', payload: 'foo', method: 'POST' })).to.not.throw();
    });
});
