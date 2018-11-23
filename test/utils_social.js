import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
// import * as utils from '../build/utils';
import Apify from '../build/index';

chai.use(chaiAsPromised);

const { social } = Apify.utils;

/* global process, describe, it */

describe('utils.social.emailsFromText()', () => {
    it('works with args with no emails or invalid', () => {
        expect(social.emailsFromText('')).to.eql([]);
        expect(social.emailsFromText(null)).to.eql([]);
        expect(social.emailsFromText()).to.eql([]);
        expect(social.emailsFromText(undefined)).to.eql([]);
        expect(social.emailsFromText({})).to.eql([]);
        expect(social.emailsFromText('         ')).to.eql([]);
        expect(social.emailsFromText('  \n\n\r\t\n   ')).to.eql([]);
    });

    it('extracts emails correctly', () => {
        expect(social.emailsFromText(' info@example.com ')).to.eql(['info@example.com']);

        expect(social.emailsFromText(`
            info@example.com
            john.bob.dole@some-domain.co.uk `))
            .to.eql([
                'info@example.com',
                'john.bob.dole@some-domain.co.uk',
            ]);

        expect(social.emailsFromText(`
            this'is'also'valid'email@EXAMPLE.travel
            easy-address@some-domain.co.uk \n\n
             easy-address@some-domain.co.uk  
              not @ an.email.com
              @also.not.an.email
              `))
            .to.eql([
                'this\'is\'also\'valid\'email@EXAMPLE.travel',
                'easy-address@some-domain.co.uk',
                'easy-address@some-domain.co.uk',
            ]);

        expect(social.emailsFromText(' some.super.long.email.address@some.super.long.domain.name.co.br '))
            .to.eql(['some.super.long.email.address@some.super.long.domain.name.co.br']);
    });
});


describe('utils.social.emailsFromUrls()', () => {
    it('throws on invalid arg', () => {
        expect(() => {
            social.emailsFromUrls();
        }).to.throw(/must be an array/);

        expect(() => {
            social.emailsFromUrls({});
        }).to.throw(/must be an array/);

        expect(() => {
            social.emailsFromUrls('fwefwef');
        }).to.throw(/must be an array/);

        expect(() => {
            social.emailsFromUrls(12345);
        }).to.throw(/must be an array/);
    });

    it('extracts emails correctly', () => {
        expect(social.emailsFromUrls([])).to.eql([]);
        expect(social.emailsFromUrls([1, 2, {}, 'fwef', null, undefined])).to.eql([]);

        expect(social.emailsFromUrls([
            'mailto:info@example.com',
        ])).to.eql([
            'info@example.com',
        ]);

        expect(social.emailsFromUrls([
            'http://www.example.com',
            'mailto:info@example.com',
            'mailto:info@example.com',
            'email.without.mailto.prefix@example.com',
            '',
            '\n\n\n',
        ])).to.eql([
            'info@example.com',
            'info@example.com',
        ]);

        expect(social.emailsFromUrls([
            'http://www.example.com',
            'mailto:info@example.com',
            'mailto:info@example.com',
            'email.without.mailto.prefix@example.com',
            '',
            '\n\n\n',
        ])).to.eql([
            'info@example.com',
            'info@example.com',
        ]);
    });
});
