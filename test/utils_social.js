import _ from 'underscore';
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
            'tel:/22345678', //
            'tel://32345678',
            'phone:42345678', //
            'phone:/52345678',
            'phone://62345678',
            'telephone:72345678',
            'telephone:/82345678',
            'telephone://92345678',
        ])).to.eql([
            '12345678',
            '22345678',
            '32345678',
            '42345678',
            '52345678',
            '62345678',
            '72345678',
            '82345678',
            '92345678',
        ]);

        expect(social.phonesFromUrls([
            'https://www.example.com',
            'ftp://www.example.com',
            '1234567',
            '+42055555567',
            'tel://+42012345678',
            'tel://+420.123.456',
            'http://www.example.com',
        ])).to.eql([
            '+42012345678',
            '+420.123.456',
        ]);
    });
});

describe('utils.social.handlesFromHtml()', () => {
    const EMPTY_RESULT = {
        emails: [],
        phones: [],
        linkedIns: [],
        instagrams: [],
        twitters: [],
    };

    it('handles invalid arg', () => {
        expect(social.handlesFromHtml()).to.eql(EMPTY_RESULT);
        expect(social.handlesFromHtml(undefined)).to.eql(EMPTY_RESULT);
        expect(social.handlesFromHtml(null)).to.eql(EMPTY_RESULT);
        expect(social.handlesFromHtml({})).to.eql(EMPTY_RESULT);
        expect(social.handlesFromHtml(1234)).to.eql(EMPTY_RESULT);
    });

    it('works', () => {
        expect(social.handlesFromHtml('')).to.eql(EMPTY_RESULT);
        expect(social.handlesFromHtml('         ')).to.eql(EMPTY_RESULT);

        expect(social.handlesFromHtml(`
            <html>
                <head>
                    <title>Bla</title> 
                </head>
                <a>
                    <p>bob@example.com</p>     
                    bob@example.com testing skipping duplicates  xxx@blabla                  
                    <p>carl&#64;example.com</p>
                    <a href="mailto:alice@example.com"></a>
                    <a href="mailto:david&#64;example.com"></a>    
   
                    <a href="skip.this.one@gmail.com"></a>  
                    <img src="http://somewhere.com/ skip.this.one.too@gmail.com " />
                    <a href="http://somewhere.com/ skip.this.one.too@gmail.com "></a>
                    
                    &#43;420775222222  
                    +4207751111111
                    +4207751111111  test duplicate
                    1 2 3 4 5 6 7 8 9 0
                    <a href="skip.this.one: +42099999999"></a>
                    <a href="tel://+42077533333"></a>
                    
                    https://www.linkedin.com/in/bobnewman/
                    https://www.linkedin.com/in/alicenewman/
                    https://www.linkedin.com/in/alicenewman/ duplicate
                    http://www.linkedin.com/in/nohttps/
                    https://cz.linkedin.com/in/somecountry
                    https://www.linkedin.com/in/carl-newman/ignored-sub-link
                    https://www.linkedin.com/in/first-last-123456a
                    <a href="https://www.linkedin.com/in/jancurn">Profile</a>
                    <a href="https://www.linkedin.com/in/carl-newman-5555555a/detail/recent-activity/">Sub-link</a>
                    
                    https://www.instagram.com/old_prague/
                    https://www.instagram.com/old_prague
                    
                    https://www.instagram.com/newyorkarea/
                    
                    <a href="https://www.instagram.com/york">link</a>
                    
                </body>
            </html>
        `)).to.eql({
            emails: ['alice@example.com', 'bob@example.com', 'carl@example.com', 'david@example.com'],
            phones: ['+4207751111111', '+420775222222', '+42077533333'],
            linkedIns: [
                'http://www.linkedin.com/in/nohttps',
                'https://cz.linkedin.com/in/somecountry',
                'https://www.linkedin.com/in/alicenewman',
                'https://www.linkedin.com/in/bobnewman',
                'https://www.linkedin.com/in/carl-newman',
                'https://www.linkedin.com/in/carl-newman-5555555a',
                'https://www.linkedin.com/in/first-last-123456a',
                'https://www.linkedin.com/in/jancurn',
            ],
            instagrams: [
                'https://www.instagram.com/newyorkarea',
                'https://www.instagram.com/old_prague',
                'https://www.instagram.com/york',
            ],
            twitters: [],
        });
    });
});

describe('utils.social REGEXPES', () => {
    it('exist', () => {
        expect(_.isRegExp(social.EMAIL_REGEX)).to.eql(true);
        expect(_.isRegExp(social.EMAIL_REGEX_GLOBAL)).to.eql(true);

        expect(_.isRegExp(social.LINKEDIN_URL_REGEX)).to.eql(true);
        expect(_.isRegExp(social.LINKEDIN_URL_REGEX_GLOBAL)).to.eql(true);

        expect(_.isRegExp(social.INSTAGRAM_URL_REGEX)).to.eql(true);
        expect(_.isRegExp(social.INSTAGRAM_URL_REGEX_GLOBAL)).to.eql(true);

        expect(_.isRegExp(social.TWITTER_URL_REGEX)).to.eql(true);
        expect(_.isRegExp(social.TWITTER_URL_REGEX_GLOBAL)).to.eql(true);
    });
});
