import _ from 'underscore';
import chaiAsPromised from 'chai-as-promised';
// import * as utils from '../build/utils';
import Apify from '../build/index';

chai.use(chaiAsPromised);

const { social } = Apify.utils;

describe('utils.social', () => {
    describe('emailsFromText()', () => {
        const testEmailsFromText = (text, phones) => {
            expect(social.emailsFromText(text)).to.eql(phones);
        };

        test('works with arg with no emails or invalid', () => {
            expect(social.emailsFromText()).to.eql([]);
            testEmailsFromText('', []);
            testEmailsFromText(null, []);
            testEmailsFromText(undefined, []);
            testEmailsFromText({}, []);
            testEmailsFromText('         ', []);
            testEmailsFromText('  \n\n\r\t\n   ', []);
        });

        test('extracts emails correctly', () => {
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

    describe('emailsFromUrls()', () => {
        test('throws on invalid arg', () => {
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

        test('extracts emails correctly', () => {
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

    describe('phonesFromText()', () => {
        const testPhonesFromText = (text, phones) => {
            expect(social.phonesFromText(text)).to.eql(phones);
        };

        test('works with arg with no phones or invalid', () => {
            expect(social.phonesFromText()).to.eql([]);

            testPhonesFromText('', []);
            testPhonesFromText(null, []);
            testPhonesFromText(undefined, []);
            testPhonesFromText({}, []);
            testPhonesFromText('         ', []);
            testPhonesFromText('  \n\n\r\t\n   ', []);
        });

        test('extracts phones correctly', () => {
            testPhonesFromText(`
                +420775123456 +420775123456
                
                +420 775 123 456
                            
                775123456 775123456   \n\n        
                00420775123456
                1234567 1234567890
                +44 7911 123456
            `, [
                '+420775123456',
                '+420775123456',
                '+420 775 123 456',
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

        test('skips invalid phones', () => {
            testPhonesFromText(`
                2018-10-11  123
                456789  345
                1 2 3 4 5 6 7 8
            `, []);
        });
    });

    describe('phonesFromUrls()', () => {
        test('throws on invalid arg', () => {
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

        test('extracts phones correctly', () => {
            expect(social.phonesFromUrls([])).to.eql([]);
            expect(social.phonesFromUrls([1, 2, {}, 'fwef', null, undefined])).to.eql([]);

            expect(social.phonesFromUrls([
                'tel:12345678',
                'tel:/22345678', //
                'tel://32345678',
                'PHONE:42345678', //
                'phone:/52345678',
                'phone://62345678',
                'telephone:72345678',
                'telephone:/82345678',
                'telephone://92345678',
                'callto:97345678',
                'CALLTO:/+98345678',
                'callto://9992345678',
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
                '97345678',
                '+98345678',
                '9992345678',
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

    describe('parseHandlesFromHtml()', () => {
        const EMPTY_RESULT = {
            emails: [],
            phones: [],
            phonesUncertain: [],
            linkedIns: [],
            twitters: [],
            instagrams: [],
            facebooks: [],
        };

        test('handles invalid arg', () => {
            expect(social.parseHandlesFromHtml()).to.eql(EMPTY_RESULT);
            expect(social.parseHandlesFromHtml(undefined)).to.eql(EMPTY_RESULT);
            expect(social.parseHandlesFromHtml(null)).to.eql(EMPTY_RESULT);
            expect(social.parseHandlesFromHtml({})).to.eql(EMPTY_RESULT);
            expect(social.parseHandlesFromHtml(1234)).to.eql(EMPTY_RESULT);
        });

        test('works', () => {
            expect(social.parseHandlesFromHtml('')).to.eql(EMPTY_RESULT);
            expect(social.parseHandlesFromHtml('         ')).to.eql(EMPTY_RESULT);

            expect(social.parseHandlesFromHtml(`
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
                        
                        https://www.linkedin.com/in/bobnewman
                        https://www.linkedin.com/in/alicenewman/
                        https://www.linkedin.com/in/alicenewman/ duplicate
                        http://www.linkedin.com/in/nohttps/
                        https://cz.linkedin.com/in/somecountry
                        https://www.linkedin.com/in/carl-newman/ignored-sub-link
                        https://www.linkedin.com/in/first-last-123456a
                        <a href="https://www.linkedin.com/in/jancurn">Profile</a>
                        <a href="https://www.linkedin.com/in/carl-newman-5555555a/detail/recent-activity/">Sub-link</a>
                        
                        https://www.instagram.com/old_prague/
                        https://www.instagram.com/old_prague/ duplicate
                        instagram.com/old_prague                    
                        https://www.instagram.com/newyorkarea/                    
                        <a href="https://www.instagram.com/york">link</a>
                        <a href="https://www.instagram.com/york2/something">sub-link</a>
                        
                        <a href="twitter.com/betasomething">link</a>
                        https://www.twitter.com/apify
                        https://www.twitter.com/apify duplicate                    
                        <a href="twitter.com/cblabla/sub-dir/">link</a>
                        
                        <a href="facebook.com/carl.username123/sub-dir/">link</a>                    
                        https://www.facebook.com/bob.username123/
                        https://www.facebook.com/bob.username123/ duplicate
                        http://www.facebook.com/alice.username123
                        <a href="https://www.facebook.com/profile.php?id=1155802082&xxx=5">link x</a>
                        <a href="fb.com/dada5678?query=1">link</a>
                        
                    </body>
                </html>
            `)).to.eql({
                emails: ['alice@example.com', 'bob@example.com', 'carl@example.com', 'david@example.com'],
                phones: ['+42077533333'],
                phonesUncertain: ['+4207751111111', '+420775222222'],
                linkedIns: [
                    'http://www.linkedin.com/in/nohttps/',
                    'https://cz.linkedin.com/in/somecountry',
                    'https://www.linkedin.com/in/alicenewman/',
                    'https://www.linkedin.com/in/bobnewman',
                    'https://www.linkedin.com/in/carl-newman-5555555a/',
                    'https://www.linkedin.com/in/carl-newman/',
                    'https://www.linkedin.com/in/first-last-123456a',
                    'https://www.linkedin.com/in/jancurn',
                ],
                instagrams: [
                    'https://www.instagram.com/newyorkarea/',
                    'https://www.instagram.com/old_prague/',
                    'https://www.instagram.com/york',
                    'https://www.instagram.com/york2/',
                    'instagram.com/old_prague',
                ],
                twitters: [
                    'https://www.twitter.com/apify',
                    'twitter.com/betasomething',
                    'twitter.com/cblabla/',
                ],
                facebooks: [
                    'facebook.com/carl.username123/',
                    'fb.com/dada5678',
                    'http://www.facebook.com/alice.username123',
                    'https://www.facebook.com/bob.username123/',
                    'https://www.facebook.com/profile.php?id=1155802082',
                ],
            });
        });

        test('data is set correctly', () => {
            const data = {};
            social.parseHandlesFromHtml(`
                <html>
                    <head>
                        <title>Bla</title> 
                    </head>
                    <body>
                        Body content
                    </body>
                </html>
            `, data);

            expect(data.$('body').text().trim()).to.eql('Body content');
            expect(data.text.trim()).to.eql('Body content');
        });
    });

    describe('EMAIL_REGEX', () => {
        test('works', () => {
            expect(_.isRegExp(social.EMAIL_REGEX)).to.eql(true);
            expect(_.isRegExp(social.EMAIL_REGEX_GLOBAL)).to.eql(true);

            expect(social.EMAIL_REGEX.flags).to.eql('i');
            expect(social.EMAIL_REGEX_GLOBAL.flags).to.eql('gi');

            expect(social.EMAIL_REGEX.test('bob@example.com')).to.eql(true);
            expect(social.EMAIL_REGEX.test('ALICE@EXAMPLE.COM')).to.eql(true);

            expect(social.EMAIL_REGEX.test('bob+something@example.co.uk')).to.eql(true);
            expect(social.EMAIL_REGEX.test('really.long.email.address@really.long.domain.name.travel')).to.eql(true);
            expect(social.EMAIL_REGEX.test('really-long-email-address@really.long.domain.name.travel')).to.eql(true);
            expect(social.EMAIL_REGEX.test('really_long_email_address@really.long.domain.name.travel')).to.eql(true);

            expect(social.EMAIL_REGEX.test('a alice@example.com')).to.eql(false);
            expect(social.EMAIL_REGEX.test('bob@example.com alice@example.com')).to.eql(false);
            expect(social.EMAIL_REGEX.test('')).to.eql(false);
            expect(social.EMAIL_REGEX.test('dummy')).to.eql(false);

            expect(social.EMAIL_REGEX_GLOBAL.test('bob@example.com')).to.eql(true);
            expect('bob@example.com alice@example.com'.match(social.EMAIL_REGEX_GLOBAL))
                .to.eql(['bob@example.com', 'alice@example.com']);

            expect(''.match(social.EMAIL_REGEX_GLOBAL)).to.eql(null);
            expect(' dummy '.match(social.EMAIL_REGEX_GLOBAL)).to.eql(null);
        });
    });

    describe('LINKEDIN_REGEX', () => {
        test('works', () => {
            expect(_.isRegExp(social.LINKEDIN_REGEX)).to.eql(true);
            expect(_.isRegExp(social.LINKEDIN_REGEX_GLOBAL)).to.eql(true);

            expect(social.LINKEDIN_REGEX.flags).to.eql('i');
            expect(social.LINKEDIN_REGEX_GLOBAL.flags).to.eql('gi');

            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/bobnewman')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/bobnewman/')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('http://www.linkedin.com/in/bobnewman')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('http://ie.linkedin.com/in/bobnewman')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('https://linkedin.com/in/bobnewman')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/carl-newman')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/first-last-123456a')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/first_last_1%23456a')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('HTTPS://WWW.LINKEDIN.COM/IN/CARL-NEWMAN')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('www.linkedin.com/in/bobnewman')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('linkedin.com/in/bobnewman')).to.eql(true);

            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/alan-turing')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('en.linkedin.com/in/alan-turing')).to.eql(true);
            expect(social.LINKEDIN_REGEX.test('linkedin.com/in/alan-turing')).to.eql(true);

            // Test there is just on matching group for the username
            expect('https://www.linkedin.com/in/bobnewman/'.match(social.LINKEDIN_REGEX)[1]).to.eql('bobnewman');
            expect('http://www.linkedin.com/in/bobnewman'.match(social.LINKEDIN_REGEX)[1]).to.eql('bobnewman');
            expect('www.linkedin.com/in/bobnewman/'.match(social.LINKEDIN_REGEX)[1]).to.eql('bobnewman');
            expect('linkedin.com/in/bobnewman'.match(social.LINKEDIN_REGEX)[1]).to.eql('bobnewman');

            expect(social.LINKEDIN_REGEX.test('')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('dummy')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('a https://www.linkedin.com/in/bobnewman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('https://linkedin.com/in/bobnewman/sub-page')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('xhttps://www.linkedin.com/in/carl-newman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('0https://www.linkedin.com/in/carl-newman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('_https://www.linkedin.com/in/carl-newman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('xlinkedin.com/in/bobnewman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('_linkedin.com/in/bobnewman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('0linkedin.com/in/bobnewman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/bobnewman/?param=bla')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('://linkedin.com/in/bobnewman')).to.eql(false);
            expect(social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/bob https://www.linkedin.com/in/alice')).to.eql(false);

            expect(social.LINKEDIN_REGEX_GLOBAL.test('https://www.linkedin.com/in/bobnewman')).to.eql(true);
            expect(`
                https://www.linkedin.com/in/bobnewman 
                "http://ie.linkedin.com/in/alicenewman"
                https://www.linkedin.com/in/someverylongnamesomeverylongnamesomeverylongnamesomeverylongnamesomeverylongnamesomeverylongname
                linkedin.com/in/carlnewman
                `.match(social.LINKEDIN_REGEX_GLOBAL))
                .to.eql([
                    'https://www.linkedin.com/in/bobnewman',
                    'http://ie.linkedin.com/in/alicenewman',
                    'linkedin.com/in/carlnewman',
                ]);
            expect(`
                -https://www.linkedin.com/in/bobnewman/sub-dir
                :http://ie.linkedin.com/in/alicenewman?param=1
                xlinkedin.com/in/carlnewman
                alinkedin.com/in/carlnewman
                _linkedin.com/in/carlnewman
                `.match(social.LINKEDIN_REGEX_GLOBAL))
                .to.eql([
                    'https://www.linkedin.com/in/bobnewman/',
                    'http://ie.linkedin.com/in/alicenewman',
                ]);
            expect(''.match(social.LINKEDIN_REGEX_GLOBAL)).to.eql(null);
        });
    });

    describe('INSTAGRAM_REGEX', () => {
        test('works', () => {
            expect(_.isRegExp(social.INSTAGRAM_REGEX)).to.eql(true);
            expect(_.isRegExp(social.INSTAGRAM_REGEX_GLOBAL)).to.eql(true);

            expect(social.INSTAGRAM_REGEX.flags).to.eql('i');
            expect(social.INSTAGRAM_REGEX_GLOBAL.flags).to.eql('gi');

            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('http://www.instagram.com/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('https://instagram.com/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('HTTPS://INSTAGR.AM/OLD_PRAGUE/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('http://instagr.am/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagr.am/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('www.instagram.com/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('instagram.com/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('www.instagr.am/old_prague/')).to.eql(true);
            expect(social.INSTAGRAM_REGEX.test('instagr.am/old_prague/')).to.eql(true);

            // Test there is just on matching group for the username
            expect('https://www.instagram.com/old_prague/'.match(social.INSTAGRAM_REGEX)[1]).to.eql('old_prague');
            expect('http://www.instagram.com/old_prague/'.match(social.INSTAGRAM_REGEX)[1]).to.eql('old_prague');
            expect('www.instagram.com/old_prague'.match(social.INSTAGRAM_REGEX)[1]).to.eql('old_prague');
            expect('instagram.com/old_prague'.match(social.INSTAGRAM_REGEX)[1]).to.eql('old_prague');

            expect(social.INSTAGRAM_REGEX.test('')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('dummy')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('a https://www.instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/a')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague/sub-page')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('xhttps://www.instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('0https://www.instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('_https://www.instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('xinstagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('_instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('0instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague/?param=bla')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('://www.instagram.com/old_prague')).to.eql(false);
            expect(social.INSTAGRAM_REGEX.test('http://www.instagram.com/old_prague http://www.instagram.com/old_brno')).to.eql(false);

            expect(social.INSTAGRAM_REGEX_GLOBAL.test('https://www.instagram.com/old_prague')).to.eql(true);
            expect(`
                    https://www.instagram.com/old_prague
                    https://www.instagram.com/someverylongusernamethatisnotgood 
                    "instagram.com/old_brno"
                    http://instagr.am/old_plzen
                    `.match(social.INSTAGRAM_REGEX_GLOBAL))
                .to.eql([
                    'https://www.instagram.com/old_prague',
                    'instagram.com/old_brno',
                    'http://instagr.am/old_plzen',
                ]);
            expect(`
                    -https://www.instagram.com/old_prague/sub-dir
                    instagr.am/old_plzen?param=1
                    xinstagram.com/old_brno
                    ainstagram.com/old_brno
                    _instagram.com/old_brno
                    `.match(social.INSTAGRAM_REGEX_GLOBAL))
                .to.eql([
                    'https://www.instagram.com/old_prague/',
                    'instagr.am/old_plzen',
                ]);
            expect(''.match(social.INSTAGRAM_REGEX_GLOBAL)).to.eql(null);
        });
    });

    describe('TWITTER_REGEX', () => {
        test('works', () => {
            expect(_.isRegExp(social.TWITTER_REGEX)).to.eql(true);
            expect(_.isRegExp(social.TWITTER_REGEX_GLOBAL)).to.eql(true);

            expect(social.TWITTER_REGEX.flags).to.eql('i');
            expect(social.TWITTER_REGEX_GLOBAL.flags).to.eql('gi');

            expect(social.TWITTER_REGEX.test('https://www.twitter.com/apify')).to.eql(true);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/apify/')).to.eql(true);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/aa_bb_123')).to.eql(true);
            expect(social.TWITTER_REGEX.test('http://www.twitter.com/apify')).to.eql(true);
            expect(social.TWITTER_REGEX.test('https://twitter.com/apify')).to.eql(true);
            expect(social.TWITTER_REGEX.test('http://twitter.com/apify')).to.eql(true);
            expect(social.TWITTER_REGEX.test('www.twitter.com/apify')).to.eql(true);
            expect(social.TWITTER_REGEX.test('twitter.com/apify')).to.eql(true);

            // Test there is just on matching group for the username
            expect('https://www.twitter.com/apify/'.match(social.TWITTER_REGEX)[1]).to.eql('apify');
            expect('http://www.twitter.com/apify'.match(social.TWITTER_REGEX)[1]).to.eql('apify');
            expect('www.twitter.com/apify'.match(social.TWITTER_REGEX)[1]).to.eql('apify');
            expect('twitter.com/apify'.match(social.TWITTER_REGEX)[1]).to.eql('apify');

            expect(social.TWITTER_REGEX.test('')).to.eql(false);
            expect(social.TWITTER_REGEX.test('dummy')).to.eql(false);
            expect(social.TWITTER_REGEX.test('a https://www.twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/apify/sub-page')).to.eql(false);
            expect(social.TWITTER_REGEX.test('xhttps://www.twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('0https://www.twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('_https://www.twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('xtwitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('_twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('0twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/apify?param=bla')).to.eql(false);
            expect(social.TWITTER_REGEX.test('://www.twitter.com/apify')).to.eql(false);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/apify https://www.twitter.com/jack')).to.eql(false);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/oauth')).to.eql(false);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/account')).to.eql(false);
            expect(social.TWITTER_REGEX.test('https://www.twitter.com/privacy/')).to.eql(false);

            expect(social.TWITTER_REGEX_GLOBAL.test('https://www.twitter.com/apify')).to.eql(true);
            expect(`
                    https://www.twitter.com/apify
                    www.twitter.com/jack/sub-dir
                    www.twitter.com/invalidverylongtwitterhandlenotgood
                    twitter.com/bob123?param=1
                    `.match(social.TWITTER_REGEX_GLOBAL))
                .to.eql([
                    'https://www.twitter.com/apify',
                    'www.twitter.com/jack/',
                    'twitter.com/bob123',
                ]);
            expect(`
                    -https://www.twitter.com/apify
                    twitter.com/jack
                    twitter.com/carl123
                    xtwitter.com/bob
                    atwitter.com/bob
                    _twitter.com/bob
                    `.match(social.TWITTER_REGEX_GLOBAL))
                .to.eql([
                    'https://www.twitter.com/apify',
                    'twitter.com/jack',
                    'twitter.com/carl123',
                ]);
            expect(''.match(social.TWITTER_REGEX_GLOBAL)).to.eql(null);
        });
    });

    describe('FACEBOOK_REGEX', () => {
        test('works', () => {
            expect(_.isRegExp(social.FACEBOOK_REGEX)).to.eql(true);
            expect(_.isRegExp(social.FACEBOOK_REGEX_GLOBAL)).to.eql(true);

            expect(social.FACEBOOK_REGEX.flags).to.eql('i');
            expect(social.FACEBOOK_REGEX_GLOBAL.flags).to.eql('gi');

            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/someusername')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/someusername/')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('http://www.facebook.com/some.username123')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('www.facebook.com/someusername')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('facebook.com/someusername')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('https://www.fb.com/someusername')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('https://www.fb.com/someusername/')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('http://www.fb.com/some.username123')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('www.fb.com/someusername')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('fb.com/someusername')).to.eql(true);

            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/profile.php?id=1155802082')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('http://www.facebook.com/profile.php?id=1155802082')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('www.facebook.com/profile.php?id=1155802082')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('facebook.com/profile.php?id=1155802082')).to.eql(true);
            expect(social.FACEBOOK_REGEX.test('fb.com/profile.php?id=1155802082')).to.eql(true);

            // Test there is just on matching group for the username
            expect('https://www.facebook.com/someusername/'.match(social.FACEBOOK_REGEX)[1]).to.eql('someusername');
            expect('https://www.facebook.com/someusername'.match(social.FACEBOOK_REGEX)[1]).to.eql('someusername');
            expect('https://www.facebook.com/profile.php?id=1155802082'.match(social.FACEBOOK_REGEX)[1]).to.eql('profile.php?id=1155802082');
            expect('fb.com/someusername'.match(social.FACEBOOK_REGEX)[1]).to.eql('someusername');

            expect(social.FACEBOOK_REGEX.test('')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('dummy')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('a https://www.facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/a')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/someusername/sub-page')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('http://www.facebook.com/profile.php')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('xhttps://www.facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('0https://www.facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('_https://www.facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('xfacebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('_facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('0facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/someusername?param=bla')).to.eql(false);

            expect(social.FACEBOOK_REGEX.test('://www.facebook.com/someusername')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/someusername https://www.facebook.com/jack')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/groups')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/events')).to.eql(false);
            expect(social.FACEBOOK_REGEX.test('https://www.facebook.com/policies/')).to.eql(false);

            expect(social.FACEBOOK_REGEX_GLOBAL.test('https://www.facebook.com/someusername')).to.eql(true);
            expect(`
                    https://www.facebook.com/someusername?param=123
                    www.facebook.com/another123/sub-dir
                    https://www.facebook.com/waytoolongusernamewaytoolongusernamewaytoolongusernamewaytoolongusernamewaytoolongusername
                    fb.com/bob123
                    `.match(social.FACEBOOK_REGEX_GLOBAL))
                .to.eql([
                    'https://www.facebook.com/someusername',
                    'www.facebook.com/another123/',
                    'fb.com/bob123',
                ]);
            expect(`
                    -https://www.facebook.com/someusername/
                    facebook.com/jack4567
                    fb.com/carl123
                    xfacebook.com/bob
                    afacebook.com/bob
                    _facebook.com/bob
                    `.match(social.FACEBOOK_REGEX_GLOBAL))
                .to.eql([
                    'https://www.facebook.com/someusername/',
                    'facebook.com/jack4567',
                    'fb.com/carl123',
                ]);
            expect(''.match(social.FACEBOOK_REGEX_GLOBAL)).to.eql(null);
        });
    });
});
