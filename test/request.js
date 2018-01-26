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
});
