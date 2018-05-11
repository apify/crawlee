import { expect } from 'chai';
import Apify from '../build/index';

describe('Apify.PseudoUrl', () => {
    it('should work', () => {
        const purl = new Apify.PseudoUrl('http://www.example.com/pages/[(\\w|-)*]'); // eslint-disable-line

        expect(purl.matches('http://www.example.com/pages/')).to.be.eql(true);
        expect(purl.matches('http://www.example.com/pages/my-awesome-page')).to.be.eql(true);
        expect(purl.matches('http://www.example.com/pages/not@working')).to.be.eql(false);
    });
});
