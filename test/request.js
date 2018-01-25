import { expect } from 'chai';
import Apify from '../build/index';

describe('Apify.Request', () => {
    it('should not accept invalid values', () => {
        expect(() => new Apify.Request({ url: 1 })).to.throw();
        expect(() => new Apify.Request({ url: 'xxx' })).to.not.throw();
    });
});
