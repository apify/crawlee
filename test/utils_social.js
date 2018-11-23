import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
// import * as utils from '../build/utils';
import Apify from '../build/index';

chai.use(chaiAsPromised);

const { social } = Apify.utils;

/* global process, describe, it */

describe('utils.social.emailsFromText()', () => {
    const testEmailsFromText = (text, phones) => {
        expect(social.emailsFromText(text)).to.eql(phones);
    };

    it('works with arg with no emails or invalid', () => {
        expect(social.emailsFromText()).to.eql([]);
        testEmailsFromText('', []);
        testEmailsFromText(null, []);
        testEmailsFromText(undefined, []);
        testEmailsFromText({}, []);
        testEmailsFromText('         ', []);
        testEmailsFromText('  \n\n\r\t\n   ', []);
    });

    it('extracts emails correctly', () => {
        testEmailsFromText(' info@example.com ', ['info@example.com']);

        testEmailsFromText(`
            info@example.com
            info+something@example.NET
            john.bob.dole@some-domain.co.uk
        `, [
            'info@example.com',
            'info+something@example.NET',
            'john.bob.dole@some-domain.co.uk',
        ]);

        testEmailsFromText(`
            this'is'also'valid'email@EXAMPLE.travel
            easy-address@some-domain.co.uk \n\n
             easy-address@some-domain.co.uk  
              not @ an.email.com
              @also.not.an.email
              `, [
            'this\'is\'also\'valid\'email@EXAMPLE.travel',
            'easy-address@some-domain.co.uk',
            'easy-address@some-domain.co.uk',
        ]);

        testEmailsFromText(' some.super.long.email.address@some.super.long.domain.name.co.br ',
            ['some.super.long.email.address@some.super.long.domain.name.co.br']);
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


describe('utils.social.phonesFromText()', () => {
    const testPhonesFromText = (text, phones) => {
        expect(social.phonesFromText(text)).to.eql(phones);
    };

    it('works with arg with no phones or invalid', () => {
        expect(social.phonesFromText()).to.eql([]);

        testPhonesFromText('', []);
        testPhonesFromText(null, []);
        testPhonesFromText(undefined, []);
        testPhonesFromText({}, []);
        testPhonesFromText('         ', []);
        testPhonesFromText('  \n\n\r\t\n   ', []);
    });

    it('extracts phones correctly', () => {
        testPhonesFromText(`
            +420775123456 +420775123456
            775123456 775123456   \n\n        
            00420775123456
            1234567 1234567890
            +44 7911 123456
        `, [
            '+420775123456',
            '+420775123456',
            '775123456',
            '775123456',
            '00420775123456',
            '1234567',
            '1234567890',
            '+44 7911 123456',
        ]);

        testPhonesFromText(`
            413-577-1234
            00413-577-1234
            981-413-777-8888
            413.233.2343  +413.233.2343  or 413 233 2343
            562-3113
            123456789  401 311 7898  123456789
        `, [
            '413-577-1234',
            '00413-577-1234',
            '981-413-777-8888',
            '413.233.2343',
            '+413.233.2343',
            '413 233 2343',
            '562-3113',
            '123456789',
            '401 311 7898',
            '123456789',
        ]);

        testPhonesFromText(`
            1 (413) 555-2378
            +1 (413) 555-2378
            1(413)555-2378
            001 (413) 555-2378  1 (413) 555 2378
            1(413)555-2378 or 1(413)555.2378 or 1 (413) 555-2378 or 1 (413) 555 2378 or (303) 494-2320
        `, [
            '1 (413) 555-2378',
            '+1 (413) 555-2378',
            '1(413)555-2378',
            '001 (413) 555-2378',
            '1 (413) 555 2378',
            '1(413)555-2378',
            '1(413)555.2378',
            '1 (413) 555-2378',
            '1 (413) 555 2378',
            '(303) 494-2320',
        ]);

        testPhonesFromText(`
            123-456-789
            123 456 789
              123.456.789
               123.456.789.123
               +123.456.789.123
        `, [
            '123-456-789',
            '123 456 789',
            '123.456.789',
            '123.456.789.123',
            '+123.456.789.123',
        ]);

        testPhonesFromText(`
           (000)000-0000
            (000)000 0000
            (000)000.0000
            (000) 000-0000
            (000) 000 0000
            (000) 000.0000
        `, [
            '(000)000-0000',
            '(000)000 0000',
            '(000)000.0000',
            '(000) 000-0000',
            '(000) 000 0000',
            '(000) 000.0000',
        ]);

        testPhonesFromText(`
           000-0000
            000 0000
            000.0000
            
            0000000
            0000000000
            (000)0000000
        `, [
            '000-0000',
            '000 0000',
            '000.0000',
            '0000000',
            '0000000000',
            '(000)0000000',
        ]);
    });

    it('skips invalid phones', () => {
        testPhonesFromText(`
            2018-10-11  123
            456789  345
            1 2 3 4 5 6 7 8
        `, []);
    });
});


describe('utils.social.phonesFromUrls()', () => {
    it('throws on invalid arg', () => {
        expect(() => {
            social.phonesFromUrls();
        }).to.throw(/must be an array/);

        expect(() => {
            social.phonesFromUrls({});
        }).to.throw(/must be an array/);

        expect(() => {
            social.phonesFromUrls('fwefwef');
        }).to.throw(/must be an array/);

        expect(() => {
            social.phonesFromUrls(12345);
        }).to.throw(/must be an array/);
    });

    it('extracts phones correctly', () => {
        expect(social.phonesFromUrls([])).to.eql([]);
        expect(social.phonesFromUrls([1, 2, {}, 'fwef', null, undefined])).to.eql([]);

        expect(social.phonesFromUrls([
            'tel:12345678',
            'tel:/12345678',
            'tel://12345678',
            'phone:12345678',
            'phone:/12345678',
            'phone://12345678',
            'telephone:12345678',
            'telephone:/12345678',
            'telephone://12345678',
        ])).to.eql([
            '12345678',
            '12345678',
            '12345678',
            '12345678',
            '12345678',
            '12345678',
            '12345678',
            '12345678',
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

