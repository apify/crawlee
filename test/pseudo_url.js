import { expect } from 'chai';
import Apify from '../build/index';

describe('Apify.PseudoUrl', () => {
    it('matches() should work', () => {
        let purl = new Apify.PseudoUrl('http://www.example.com/PAGES/[(\\w|-)*]'); // eslint-disable-line

        expect(purl.matches('http://www.example.com/PAGES/')).to.be.eql(true);
        expect(purl.matches('http://www.example.com/pages/my-awesome-page')).to.be.eql(true);
        expect(purl.matches('http://www.example.com/PAGES/not@working')).to.be.eql(false);

        purl = new Apify.PseudoUrl(/example\.com\/pages/);

        expect(purl.matches('http://www.example.com/PAGES/')).to.be.eql(false);
        expect(purl.matches('http://www.example.com/pages/my-awesome-page')).to.be.eql(true);
        expect(purl.matches('http://www.example.com/pages/not@working')).to.be.eql(true);
    });

    it('createRequest() should work', () => {
        const purl = new Apify.PseudoUrl('something', { method: 'POST', userData: { foo: 'bar' } });
        const request = purl.createRequest('http://example.com');

        expect(request).to.be.an.instanceof(Apify.Request);
        expect(request.url).to.be.eql('http://example.com');
        expect(request.method).to.be.eql('POST');
        expect(request.userData).to.be.eql({ foo: 'bar' });
    });
});
