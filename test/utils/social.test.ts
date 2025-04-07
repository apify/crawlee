import { social } from '@crawlee/utils';

const {
    EMAIL_REGEX,
    EMAIL_REGEX_GLOBAL,
    FACEBOOK_REGEX,
    FACEBOOK_REGEX_GLOBAL,
    INSTAGRAM_REGEX,
    INSTAGRAM_REGEX_GLOBAL,
    LINKEDIN_REGEX,
    LINKEDIN_REGEX_GLOBAL,
    TWITTER_REGEX,
    TWITTER_REGEX_GLOBAL,
    YOUTUBE_REGEX,
    YOUTUBE_REGEX_GLOBAL,
    TIKTOK_REGEX,
    TIKTOK_REGEX_GLOBAL,
    PINTEREST_REGEX,
    PINTEREST_REGEX_GLOBAL,
    DISCORD_REGEX,
    DISCORD_REGEX_GLOBAL,
    emailsFromText,
    emailsFromUrls,
    parseHandlesFromHtml,
    phonesFromText,
    phonesFromUrls,
} = social;

describe('utils.social', () => {
    describe('emailsFromText()', () => {
        const testEmailsFromText = (text: string, phones: string[]) => {
            expect(emailsFromText(text)).toEqual(phones);
        };

        test('works with arg with no emails or invalid', () => {
            // @ts-expect-error invalid input type
            expect(emailsFromText()).toEqual([]);
            testEmailsFromText('', []);
            // @ts-expect-error invalid input type
            testEmailsFromText(null, []);
            // @ts-expect-error invalid input type
            testEmailsFromText(undefined, []);
            // @ts-expect-error invalid input type
            testEmailsFromText({}, []);
            testEmailsFromText('         ', []);
            testEmailsFromText('  \n\n\r\t\n   ', []);
        });

        test('extracts emails correctly', () => {
            testEmailsFromText(' info@example.com ', ['info@example.com']);

            testEmailsFromText(
                `
                info@example.com
                info+something@example.NET
                john.bob.dole@some-domain.co.uk
            `,
                ['info@example.com', 'info+something@example.NET', 'john.bob.dole@some-domain.co.uk'],
            );

            testEmailsFromText(
                `
                this'is'also'valid'email@EXAMPLE.travel
                easy-address@some-domain.co.uk \n\n
                 easy-address@some-domain.co.uk
                  not @ an.email.com
                  @also.not.an.email
                  `,
                [
                    "this'is'also'valid'email@EXAMPLE.travel",
                    'easy-address@some-domain.co.uk',
                    'easy-address@some-domain.co.uk',
                ],
            );

            testEmailsFromText(' some.super.long.email.address@some.super.long.domain.name.co.br ', [
                'some.super.long.email.address@some.super.long.domain.name.co.br',
            ]);
        });
    });

    describe('emailsFromUrls()', () => {
        test('throws on invalid arg', () => {
            expect(() => {
                // @ts-expect-error invalid input type
                emailsFromUrls();
            }).toThrowError(/must be an array/);

            expect(() => {
                // @ts-expect-error invalid input type
                emailsFromUrls({});
            }).toThrowError(/must be an array/);

            expect(() => {
                // @ts-expect-error invalid input type
                emailsFromUrls('fwefwef');
            }).toThrowError(/must be an array/);

            expect(() => {
                // @ts-expect-error invalid input type
                emailsFromUrls(12345);
            }).toThrowError(/must be an array/);
        });

        test('extracts emails correctly', () => {
            expect(emailsFromUrls([])).toEqual([]);
            // @ts-expect-error invalid input type
            expect(emailsFromUrls([1, 2, {}, 'fwef', null, undefined])).toEqual([]);

            expect(emailsFromUrls(['mailto:info@example.com'])).toEqual(['info@example.com']);

            expect(
                emailsFromUrls([
                    'http://www.example.com',
                    'mailto:info@example.com',
                    'mailto:info@example.com',
                    'email.without.mailto.prefix@example.com',
                    '',
                    '\n\n\n',
                ]),
            ).toEqual(['info@example.com', 'info@example.com']);

            expect(
                emailsFromUrls([
                    'http://www.example.com',
                    'mailto:info@example.com',
                    'mailto:info@example.com',
                    'email.without.mailto.prefix@example.com',
                    '',
                    '\n\n\n',
                ]),
            ).toEqual(['info@example.com', 'info@example.com']);
        });
    });

    describe('phonesFromText()', () => {
        const testPhonesFromText = (text: string, phones: string[]) => {
            expect(phonesFromText(text)).toEqual(phones);
        };

        test('works with arg with no phones or invalid', () => {
            // @ts-expect-error invalid input type
            expect(phonesFromText()).toEqual([]);

            testPhonesFromText('', []);
            // @ts-expect-error invalid input type
            testPhonesFromText(null, []);
            // @ts-expect-error invalid input type
            testPhonesFromText(undefined, []);
            // @ts-expect-error
            testPhonesFromText({}, []);
            testPhonesFromText('         ', []);
            testPhonesFromText('  \n\n\r\t\n   ', []);
        });

        test('extracts phones correctly', () => {
            testPhonesFromText(
                `
                +420775123456 +420775123456

                +420 775 123 456

                775123456 775123456   \n\n
                00420775123456
                1234567 1234567890
                +44 7911 123456
            `,
                [
                    '+420775123456',
                    '+420775123456',
                    '+420 775 123 456',
                    '775123456',
                    '775123456',
                    '00420775123456',
                    '1234567',
                    '1234567890',
                    '+44 7911 123456',
                ],
            );

            testPhonesFromText(
                `
                413-577-1234
                00413-577-1234
                981-413-777-8888
                413.233.2343  +413.233.2343  or 413 233 2343
                562-3113
                123456789  401 311 7898  123456789
            `,
                [
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
                ],
            );

            testPhonesFromText(
                `
                1 (413) 555-2378
                +1 (413) 555-2378
                1(413)555-2378
                001 (413) 555-2378  1 (413) 555 2378
                1(413)555-2378 or 1(413)555.2378 or 1 (413) 555-2378 or 1 (413) 555 2378 or (303) 494-2320
            `,
                [
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
                ],
            );

            testPhonesFromText(
                `
                123-456-789
                123 456 789
                  123.456.789
                   123.456.789.123
                   +123.456.789.123
            `,
                ['123-456-789', '123 456 789', '123.456.789', '123.456.789.123', '+123.456.789.123'],
            );

            testPhonesFromText(
                `
               (000)000-0000
                (000)000 0000
                (000)000.0000
                (000) 000-0000
                (000) 000 0000
                (000) 000.0000
            `,
                [
                    '(000)000-0000',
                    '(000)000 0000',
                    '(000)000.0000',
                    '(000) 000-0000',
                    '(000) 000 0000',
                    '(000) 000.0000',
                ],
            );

            testPhonesFromText(
                `
               000-0000
                000 0000
                000.0000

                0000000
                0000000000
                (000)0000000
            `,
                ['000-0000', '000 0000', '000.0000', '0000000', '0000000000', '(000)0000000'],
            );
        });

        test('skips invalid phones', () => {
            testPhonesFromText(
                `
                2018-10-11  123
                456789  345
                1 2 3 4 5 6 7 8
            `,
                [],
            );
        });
    });

    describe('phonesFromUrls()', () => {
        test('throws on invalid arg', () => {
            expect(() => {
                // @ts-expect-error invalid input type
                phonesFromUrls();
            }).toThrowError(/must be an array/);

            expect(() => {
                // @ts-expect-error invalid input type
                phonesFromUrls({});
            }).toThrowError(/must be an array/);

            expect(() => {
                // @ts-expect-error invalid input type
                phonesFromUrls('fwefwef');
            }).toThrowError(/must be an array/);

            expect(() => {
                // @ts-expect-error invalid input type
                phonesFromUrls(12345);
            }).toThrowError(/must be an array/);
        });

        test('extracts phones correctly', () => {
            expect(phonesFromUrls([])).toEqual([]);
            // @ts-expect-error invalid input type
            expect(phonesFromUrls([1, 2, {}, 'fwef', null, undefined])).toEqual([]);

            expect(
                phonesFromUrls([
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
                ]),
            ).toEqual([
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

            expect(
                phonesFromUrls([
                    'https://www.example.com',
                    'ftp://www.example.com',
                    '1234567',
                    '+42055555567',
                    'tel://+42012345678',
                    'tel://+420.123.456',
                    'http://www.example.com',
                ]),
            ).toEqual(['+42012345678', '+420.123.456']);
        });
    });

    describe('parseHandlesFromHtml()', () => {
        const EMPTY_RESULT: social.SocialHandles = {
            emails: [],
            phones: [],
            phonesUncertain: [],
            linkedIns: [],
            twitters: [],
            instagrams: [],
            facebooks: [],
            youtubes: [],
            tiktoks: [],
            pinterests: [],
            discords: [],
        };

        test('handles invalid arg', () => {
            // @ts-expect-error invalid input type
            expect(parseHandlesFromHtml()).toEqual(EMPTY_RESULT);
            // @ts-expect-error invalid input type
            expect(parseHandlesFromHtml(undefined)).toEqual(EMPTY_RESULT);
            // @ts-expect-error invalid input type
            expect(parseHandlesFromHtml(null)).toEqual(EMPTY_RESULT);
            // @ts-expect-error invalid input type
            expect(parseHandlesFromHtml({})).toEqual(EMPTY_RESULT);
            // @ts-expect-error invalid input type
            expect(parseHandlesFromHtml(1234)).toEqual(EMPTY_RESULT);
        });

        test('works', () => {
            expect(parseHandlesFromHtml('')).toEqual(EMPTY_RESULT);
            expect(parseHandlesFromHtml('         ')).toEqual(EMPTY_RESULT);
            const html =
                'use the data in this [YouTube Video](https://www.youtube.com/watch?v=BsidLZKdYWQ).\\n\\n## Sample result\\n' +
                'use the data in this [YouTube Video](https://www.youtube.com/watch?v=BsidLZKd123).\\\\n\\\\n## Sample result\\\\n';
            expect(parseHandlesFromHtml(html)).toMatchObject({
                youtubes: [
                    'https://www.youtube.com/watch?v=BsidLZKd123',
                    'https://www.youtube.com/watch?v=BsidLZKdYWQ',
                ],
            });

            expect(
                parseHandlesFromHtml(`
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
                        <a href="www.linkedin.com/company/delegatus">Company</a>

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
                        <a href="x.com/apify">link</a>
                        <a href="x.com/cblabla/sub-dir/">link</a>

                        <a href="facebook.com/carl.username123/sub-dir/">link</a>
                        https://www.facebook.com/bob.username123/
                        https://www.facebook.com/bob.username123/ duplicate
                        http://www.facebook.com/alice.username123
                        <a href="https://www.facebook.com/profile.php?id=1155802082&xxx=5">link x</a>
                        <a href="https://youtu.be/kM7YfhfkiEE">Youtube</a>
                        <a href="https://youtube.com/@channel">Youtube Channel</a>
                        <a href="fb.com/dada5678?query=1">link</a>
                        <a href="https://www.facebook.com/pages/category/category-name/page-name-and-ID/">link</a>
                        <a href="fb.com/pages/page-name/142434434>link</a>

                        https://www.tiktok.com/trending?shareId=1234567890123456789/
                        m.tiktok.com/v/1234567890123456789
                        <a href="https://tiktok.com/@jack1234">Profile</a>
                        <a href="https://www.tiktok.com/@username/video/1234567890123456789">Most popular video</a>
                        <a href="https://www.tiktok.com/embed/1234567890123456789/"Embed video</a>
                        m.tiktok.com/v/1234567890123456789 duplicate
                        <a href="https://www.pinterest.com/jack">Profile</a>
                        <a href="https://pinterest.com/pin/10084556789">Top pin</a>
                        <a href="https://uk.pinterest.com/user/board/">My board</a>
                        pinterest.com/my_username
                        <a href="https://pinterest.com/pin/10084556789">My favourite pin</a> duplicate
                        <a href="https://discord.com/invite/jyEM2PRvMU/">Join us on Discord</a>
                        <a href="discord.gg/discord-developers">Join our Discord community</a>
                    </body>
                </html>
            `),
            ).toEqual({
                discords: ['discord.gg/discord-developers', 'https://discord.com/invite/jyEM2PRvMU/'],
                emails: ['alice@example.com', 'bob@example.com', 'carl@example.com', 'david@example.com'],
                phones: ['+42077533333'],
                phonesUncertain: [
                    '+4207751111111',
                    '+420775222222',

                    // tiktok videos have purely numeric ids so this can't be avoided
                    '123456789012345',
                ],
                linkedIns: [
                    'http://www.linkedin.com/in/nohttps/',
                    'https://cz.linkedin.com/in/somecountry',
                    'https://www.linkedin.com/in/alicenewman/',
                    'https://www.linkedin.com/in/bobnewman',
                    'https://www.linkedin.com/in/carl-newman-5555555a/',
                    'https://www.linkedin.com/in/carl-newman/',
                    'https://www.linkedin.com/in/first-last-123456a',
                    'https://www.linkedin.com/in/jancurn',
                    'www.linkedin.com/company/delegatus',
                ],
                instagrams: [
                    'https://www.instagram.com/newyorkarea/',
                    'https://www.instagram.com/old_prague/',
                    'https://www.instagram.com/york',
                    'https://www.instagram.com/york2/',
                    'instagram.com/old_prague',
                ],
                pinterests: [
                    'https://pinterest.com/pin/10084556789',
                    'https://uk.pinterest.com/user/board/',
                    'https://www.pinterest.com/jack',
                    'pinterest.com/my_username',
                ],
                tiktoks: [
                    'https://tiktok.com/@jack1234',
                    'https://www.tiktok.com/@username/video/1234567890123456789',
                    'https://www.tiktok.com/embed/1234567890123456789/',
                    'https://www.tiktok.com/trending?shareId=1234567890123456789/',
                    'm.tiktok.com/v/1234567890123456789',
                ],
                twitters: [
                    'https://www.twitter.com/apify',
                    'twitter.com/betasomething',
                    'twitter.com/cblabla/',
                    'x.com/apify',
                    'x.com/cblabla/',
                ],
                facebooks: [
                    'facebook.com/carl.username123/',
                    'fb.com/dada5678',
                    'fb.com/pages/page-name/142434434',
                    'http://www.facebook.com/alice.username123',
                    'https://www.facebook.com/bob.username123/',
                    'https://www.facebook.com/pages/category/category-name/page-name-and-ID/',
                    'https://www.facebook.com/profile.php?id=1155802082',
                ],
                youtubes: ['https://youtu.be/kM7YfhfkiEE', 'https://youtube.com/@channel'],
            });
        });

        test('data is set correctly', () => {
            const data = {} as any;
            parseHandlesFromHtml(
                `
                <html>
                    <head>
                        <title>Bla</title>
                    </head>
                    <body>
                        Body content
                    </body>
                </html>
            `,
                data,
            );

            expect(data.$('body').text().trim()).toBe('Body content');
            expect(data.text.trim()).toBe('Body content');
        });
    });

    describe('EMAIL_REGEX', () => {
        test('works', () => {
            expect(EMAIL_REGEX).toBeInstanceOf(RegExp);
            expect(EMAIL_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(EMAIL_REGEX.flags).toBe('i');
            expect(EMAIL_REGEX_GLOBAL.flags).toBe('gi');

            expect(EMAIL_REGEX.test('bob@example.com')).toBe(true);
            expect(EMAIL_REGEX.test('ALICE@EXAMPLE.COM')).toBe(true);

            expect(EMAIL_REGEX.test('bob+something@example.co.uk')).toBe(true);
            expect(EMAIL_REGEX.test('really.long.email.address@really.long.domain.name.travel')).toBe(true);
            expect(EMAIL_REGEX.test('really-long-email-address@really.long.domain.name.travel')).toBe(true);
            expect(EMAIL_REGEX.test('really_long_email_address@really.long.domain.name.travel')).toBe(true);

            expect(EMAIL_REGEX.test('a alice@example.com')).toBe(false);
            expect(EMAIL_REGEX.test('bob@example.com alice@example.com')).toBe(false);
            expect(EMAIL_REGEX.test('')).toBe(false);
            expect(EMAIL_REGEX.test('dummy')).toBe(false);

            expect(EMAIL_REGEX_GLOBAL.test('bob@example.com')).toBe(true);
            expect('bob@example.com alice@example.com'.match(EMAIL_REGEX_GLOBAL)).toEqual([
                'bob@example.com',
                'alice@example.com',
            ]);

            expect(''.match(EMAIL_REGEX_GLOBAL)).toBe(null);
            expect(' dummy '.match(EMAIL_REGEX_GLOBAL)).toBe(null);
        });
    });

    describe('LINKEDIN_REGEX', () => {
        test('works', () => {
            expect(LINKEDIN_REGEX).toBeInstanceOf(RegExp);
            expect(LINKEDIN_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(LINKEDIN_REGEX.flags).toBe('i');
            expect(LINKEDIN_REGEX_GLOBAL.flags).toBe('gi');

            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/bobnewman')).toBe(true);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/bobnewman/')).toBe(true);
            expect(LINKEDIN_REGEX.test('http://www.linkedin.com/in/bobnewman')).toBe(true);
            expect(LINKEDIN_REGEX.test('http://ie.linkedin.com/in/bobnewman')).toBe(true);
            expect(LINKEDIN_REGEX.test('https://linkedin.com/in/bobnewman')).toBe(true);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/carl-newman')).toBe(true);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/first-last-123456a')).toBe(true);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/first_last_1%23456a')).toBe(true);
            expect(LINKEDIN_REGEX.test('HTTPS://WWW.LINKEDIN.COM/IN/CARL-NEWMAN')).toBe(true);
            expect(LINKEDIN_REGEX.test('www.linkedin.com/in/bobnewman')).toBe(true);
            expect(LINKEDIN_REGEX.test('linkedin.com/in/bobnewman')).toBe(true);

            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/alan-turing')).toBe(true);
            expect(LINKEDIN_REGEX.test('en.linkedin.com/in/alan-turing')).toBe(true);
            expect(LINKEDIN_REGEX.test('linkedin.com/in/alan-turing')).toBe(true);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/company/delegatus')).toBe(true);

            // Test there is just on matching group for the username
            expect('https://www.linkedin.com/in/bobnewman/'.match(LINKEDIN_REGEX)![1]).toBe('bobnewman');
            expect('http://www.linkedin.com/in/bobnewman'.match(LINKEDIN_REGEX)![1]).toBe('bobnewman');
            expect('www.linkedin.com/in/bobnewman/'.match(LINKEDIN_REGEX)![1]).toBe('bobnewman');
            expect('linkedin.com/in/bobnewman'.match(LINKEDIN_REGEX)![1]).toBe('bobnewman');

            expect(LINKEDIN_REGEX.test('')).toBe(false);
            expect(LINKEDIN_REGEX.test('dummy')).toBe(false);
            expect(LINKEDIN_REGEX.test('a https://www.linkedin.com/in/bobnewman')).toBe(false);
            expect(LINKEDIN_REGEX.test('https://linkedin.com/in/bobnewman/sub-page')).toBe(false);
            expect(LINKEDIN_REGEX.test('xhttps://www.linkedin.com/in/carl-newman')).toBe(false);
            expect(LINKEDIN_REGEX.test('0https://www.linkedin.com/in/carl-newman')).toBe(false);
            expect(LINKEDIN_REGEX.test('_https://www.linkedin.com/in/carl-newman')).toBe(false);
            expect(LINKEDIN_REGEX.test('xlinkedin.com/in/bobnewman')).toBe(false);
            expect(LINKEDIN_REGEX.test('_linkedin.com/in/bobnewman')).toBe(false);
            expect(LINKEDIN_REGEX.test('0linkedin.com/in/bobnewman')).toBe(false);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/bobnewman/?param=bla')).toBe(false);
            expect(LINKEDIN_REGEX.test('://linkedin.com/in/bobnewman')).toBe(false);
            expect(LINKEDIN_REGEX.test('https://www.linkedin.com/in/bob https://www.linkedin.com/in/alice')).toBe(
                false,
            );

            expect(LINKEDIN_REGEX_GLOBAL.test('https://www.linkedin.com/in/bobnewman')).toBe(true);
            expect(
                `
                https://www.linkedin.com/in/bobnewman
                "http://ie.linkedin.com/in/alicenewman"
                https://www.linkedin.com/in/someverylongnamesomeverylongnamesomeverylongnamesomeverylongnamesomeverylongnamesomeverylongname
                linkedin.com/in/carlnewman
                `.match(LINKEDIN_REGEX_GLOBAL),
            ).toEqual([
                'https://www.linkedin.com/in/bobnewman',
                'http://ie.linkedin.com/in/alicenewman',
                'linkedin.com/in/carlnewman',
            ]);
            expect(
                `
                -https://www.linkedin.com/in/bobnewman/sub-dir
                :http://ie.linkedin.com/in/alicenewman?param=1
                xlinkedin.com/in/carlnewman
                alinkedin.com/in/carlnewman
                _linkedin.com/in/carlnewman
                `.match(LINKEDIN_REGEX_GLOBAL),
            ).toEqual(['https://www.linkedin.com/in/bobnewman/', 'http://ie.linkedin.com/in/alicenewman']);
            expect(''.match(LINKEDIN_REGEX_GLOBAL)).toBe(null);
        });
    });

    describe('INSTAGRAM_REGEX', () => {
        test('works', () => {
            expect(INSTAGRAM_REGEX).toBeInstanceOf(RegExp);
            expect(INSTAGRAM_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(INSTAGRAM_REGEX.flags).toBe('i');
            expect(INSTAGRAM_REGEX_GLOBAL.flags).toBe('gi');

            expect(INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague')).toBe(true);
            expect(INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('http://www.instagram.com/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('https://instagram.com/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('HTTPS://INSTAGR.AM/OLD_PRAGUE/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('http://instagr.am/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('https://www.instagr.am/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('www.instagram.com/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('instagram.com/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('www.instagr.am/old_prague/')).toBe(true);
            expect(INSTAGRAM_REGEX.test('instagr.am/old_prague/')).toBe(true);

            // Test there is just on matching group for the username
            expect('https://www.instagram.com/old_prague/'.match(INSTAGRAM_REGEX)![1]).toBe('old_prague');
            expect('http://www.instagram.com/old_prague/'.match(INSTAGRAM_REGEX)![1]).toBe('old_prague');
            expect('www.instagram.com/old_prague'.match(INSTAGRAM_REGEX)![1]).toBe('old_prague');
            expect('instagram.com/old_prague'.match(INSTAGRAM_REGEX)![1]).toBe('old_prague');

            expect(INSTAGRAM_REGEX.test('')).toBe(false);
            expect(INSTAGRAM_REGEX.test('dummy')).toBe(false);
            expect(INSTAGRAM_REGEX.test('a https://www.instagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('https://www.instagram.com/a')).toBe(false);
            expect(INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague/sub-page')).toBe(false);
            expect(INSTAGRAM_REGEX.test('xhttps://www.instagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('0https://www.instagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('_https://www.instagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('xinstagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('_instagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('0instagram.com/old_prague')).toBe(false);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/explore/')).toBe(false);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/_n/')).toBe(false);
            expect(social.INSTAGRAM_REGEX.test('https://www.instagram.com/_u/')).toBe(false);
            expect(INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague/?param=bla')).toBe(false);
            expect(INSTAGRAM_REGEX.test('://www.instagram.com/old_prague')).toBe(false);
            expect(INSTAGRAM_REGEX.test('http://www.instagram.com/old_prague http://www.instagram.com/old_brno')).toBe(
                false,
            );

            expect(INSTAGRAM_REGEX_GLOBAL.test('https://www.instagram.com/old_prague')).toBe(true);
            expect(
                `
                    https://www.instagram.com/old_prague
                    https://www.instagram.com/someverylongusernamethatisnotgood
                    "instagram.com/old_brno"
                    http://instagr.am/old_plzen
                    `.match(INSTAGRAM_REGEX_GLOBAL),
            ).toEqual([
                'https://www.instagram.com/old_prague',
                'instagram.com/old_brno',
                'http://instagr.am/old_plzen',
            ]);
            expect(
                `
                    -https://www.instagram.com/old_prague/sub-dir
                    instagr.am/old_plzen?param=1
                    xinstagram.com/old_brno
                    ainstagram.com/old_brno
                    _instagram.com/old_brno
                    `.match(INSTAGRAM_REGEX_GLOBAL),
            ).toEqual(['https://www.instagram.com/old_prague/', 'instagr.am/old_plzen']);
            expect(''.match(INSTAGRAM_REGEX_GLOBAL)).toBe(null);
        });
    });

    describe('TWITTER_REGEX', () => {
        test('works', () => {
            expect(TWITTER_REGEX).toBeInstanceOf(RegExp);
            expect(TWITTER_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(TWITTER_REGEX.flags).toBe('i');
            expect(TWITTER_REGEX_GLOBAL.flags).toBe('gi');

            expect(TWITTER_REGEX.test('https://www.twitter.com/apify')).toBe(true);
            expect(TWITTER_REGEX.test('https://www.twitter.com/apify/')).toBe(true);
            expect(TWITTER_REGEX.test('https://www.twitter.com/aa_bb_123')).toBe(true);
            expect(TWITTER_REGEX.test('http://www.twitter.com/apify')).toBe(true);
            expect(TWITTER_REGEX.test('https://twitter.com/apify')).toBe(true);
            expect(TWITTER_REGEX.test('http://twitter.com/apify')).toBe(true);
            expect(TWITTER_REGEX.test('www.twitter.com/apify')).toBe(true);
            expect(TWITTER_REGEX.test('twitter.com/apify')).toBe(true);

            expect(TWITTER_REGEX.test('https://www.x.com/apify')).toBe(true);
            expect(TWITTER_REGEX.test('https://www.x.com/@apify')).toBe(true);
            expect(TWITTER_REGEX.test('https://www.x.com/aa_bb_123')).toBe(true);
            expect(TWITTER_REGEX.test('x.com/apify')).toBe(true);

            // Test there is just on matching group for the username
            expect('https://www.twitter.com/apify/'.match(TWITTER_REGEX)![1]).toBe('apify');
            expect('http://www.twitter.com/apify'.match(TWITTER_REGEX)![1]).toBe('apify');
            expect('www.twitter.com/apify'.match(TWITTER_REGEX)![1]).toBe('apify');
            expect('twitter.com/apify'.match(TWITTER_REGEX)![1]).toBe('apify');

            expect('https://www.x.com/apify/'.match(TWITTER_REGEX)![1]).toBe('apify');
            expect('http://www.x.com/@apify'.match(TWITTER_REGEX)![1]).toBe('apify');

            expect(TWITTER_REGEX.test('')).toBe(false);
            expect(TWITTER_REGEX.test('dummy')).toBe(false);
            expect(TWITTER_REGEX.test('a https://www.twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('https://www.twitter.com/apify/sub-page')).toBe(false);
            expect(TWITTER_REGEX.test('xhttps://www.twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('0https://www.twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('_https://www.twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('xtwitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('_twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('0twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('https://www.twitter.com/apify?param=bla')).toBe(false);
            expect(TWITTER_REGEX.test('://www.twitter.com/apify')).toBe(false);
            expect(TWITTER_REGEX.test('https://www.twitter.com/apify https://www.twitter.com/jack')).toBe(false);
            expect(TWITTER_REGEX.test('https://www.twitter.com/oauth')).toBe(false);
            expect(TWITTER_REGEX.test('https://www.twitter.com/account')).toBe(false);
            expect(TWITTER_REGEX.test('https://www.twitter.com/privacy/')).toBe(false);

            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/i/flow/login')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://business.x.com/en')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/privacy')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://help.x.com/en/using-x/download-the-x-app')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://careers.x.com/en')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://developer.x.com/en')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/i/directory/profiles')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/settings/account/personalization')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/explore')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/i/premium_sign_up')).toBe(false);
            expect(TWITTER_REGEX_GLOBAL.test('https://x.com/compose/post')).toBe(false);

            expect(TWITTER_REGEX_GLOBAL.test('https://www.twitter.com/apify')).toBe(true);
            expect(
                `
                    https://www.twitter.com/apify
                    www.twitter.com/jack/sub-dir
                    www.twitter.com/invalidverylongtwitterhandlenotgood
                    twitter.com/bob123?param=1
                    www.x.com/apify/sub-dir
                    `.match(TWITTER_REGEX_GLOBAL),
            ).toEqual([
                'https://www.twitter.com/apify',
                'www.twitter.com/jack/',
                'twitter.com/bob123',
                'www.x.com/apify/',
            ]);
            expect(
                `
                    -https://www.twitter.com/apify
                    twitter.com/jack
                    twitter.com/carl123
                    xtwitter.com/bob
                    atwitter.com/bob
                    _twitter.com/bob
                    `.match(TWITTER_REGEX_GLOBAL),
            ).toEqual(['https://www.twitter.com/apify', 'twitter.com/jack', 'twitter.com/carl123']);
            expect(''.match(TWITTER_REGEX_GLOBAL)).toBe(null);
        });
    });

    describe('FACEBOOK_REGEX', () => {
        test('works', () => {
            expect(FACEBOOK_REGEX).toBeInstanceOf(RegExp);
            expect(FACEBOOK_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(FACEBOOK_REGEX.flags).toBe('i');
            expect(FACEBOOK_REGEX_GLOBAL.flags).toBe('gi');

            expect(FACEBOOK_REGEX.test('https://www.facebook.com/someusername')).toBe(true);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/someusername/')).toBe(true);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/some-username-1234')).toBe(true);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/some-username-1234/')).toBe(true);
            expect(FACEBOOK_REGEX.test('http://www.facebook.com/some.username123')).toBe(true);
            expect(FACEBOOK_REGEX.test('www.facebook.com/someusername')).toBe(true);
            expect(FACEBOOK_REGEX.test('facebook.com/someusername')).toBe(true);
            expect(FACEBOOK_REGEX.test('https://www.fb.com/someusername')).toBe(true);
            expect(FACEBOOK_REGEX.test('https://www.fb.com/someusername/')).toBe(true);
            expect(FACEBOOK_REGEX.test('http://www.fb.com/some.username123')).toBe(true);
            expect(FACEBOOK_REGEX.test('www.fb.com/someusername')).toBe(true);
            expect(FACEBOOK_REGEX.test('fb.com/someusername')).toBe(true);

            expect(FACEBOOK_REGEX.test('https://www.facebook.com/profile.php?id=1155802082')).toBe(true);
            expect(FACEBOOK_REGEX.test('http://www.facebook.com/profile.php?id=1155802082')).toBe(true);
            expect(FACEBOOK_REGEX.test('www.facebook.com/profile.php?id=1155802082')).toBe(true);
            expect(FACEBOOK_REGEX.test('facebook.com/profile.php?id=1155802082')).toBe(true);
            expect(FACEBOOK_REGEX.test('fb.com/profile.php?id=1155802082')).toBe(true);

            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pageName')).toBe(true);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/KinEssor-Groupe-Conseil/208264345877578')).toBe(
                true,
            );
            expect(
                FACEBOOK_REGEX.test(
                    'https://www.facebook.com/pages/category/Lawyer---Law-Firm/Delegatus-services-juridiques-inc-131011223614905/',
                ),
            ).toBe(true);

            // Test there is just on matching group for the username
            expect('https://www.facebook.com/someusername/'.match(FACEBOOK_REGEX)![1]).toBe('someusername');
            expect('https://www.facebook.com/someusername'.match(FACEBOOK_REGEX)![1]).toBe('someusername');
            expect('https://www.facebook.com/profile.php?id=1155802082'.match(FACEBOOK_REGEX)![1]).toBe(
                'profile.php?id=1155802082',
            );
            expect('fb.com/someusername'.match(FACEBOOK_REGEX)![1]).toBe('someusername');
            expect('facebook.com/pages/KinEssor-Groupe-Conseil/208264345877578'.match(FACEBOOK_REGEX)![1]).toBe(
                'pages/KinEssor-Groupe-Conseil/208264345877578',
            );

            expect(FACEBOOK_REGEX.test('')).toBe(false);
            expect(FACEBOOK_REGEX.test('dummy')).toBe(false);
            expect(FACEBOOK_REGEX.test('a https://www.facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/a')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/someusername/sub-page')).toBe(false);
            expect(FACEBOOK_REGEX.test('http://www.facebook.com/profile.php')).toBe(false);
            expect(FACEBOOK_REGEX.test('xhttps://www.facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('0https://www.facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('_https://www.facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('xfacebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('_facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('0facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/someusername?param=bla')).toBe(false);

            expect(FACEBOOK_REGEX.test('://www.facebook.com/someusername')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/someusername https://www.facebook.com/jack')).toBe(
                false,
            );
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/groups')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/events')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/policies/')).toBe(false);

            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/?category=liked&ref=bookmarks')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/merge')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/search')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/create')).toBe(false);
            expect(FACEBOOK_REGEX.test('https://www.facebook.com/pages/createCustomWebsiteName')).toBe(true);

            expect(FACEBOOK_REGEX_GLOBAL.test('https://www.facebook.com/someusername')).toBe(true);
            expect(
                `
                    https://www.facebook.com/someusername?param=123
                    www.facebook.com/another123/sub-dir
                    www.facebook.com/pages/
                    facebook.com/pages/some-page
                    https://www.facebook.com/waytoolongusernamewaytoolongusernamewaytoolongusernamewaytoolongusernamewaytoolongusername
                    fb.com/bob123
                    `.match(FACEBOOK_REGEX_GLOBAL),
            ).toEqual([
                'https://www.facebook.com/someusername',
                'www.facebook.com/another123/',
                'facebook.com/pages/some-page',
                'fb.com/bob123',
            ]);
            expect(
                `
                    -https://www.facebook.com/someusername/
                    facebook.com/jack4567
                    fb.com/carl123
                    xfacebook.com/bob
                    afacebook.com/bob
                    _facebook.com/bob
                    `.match(FACEBOOK_REGEX_GLOBAL),
            ).toEqual(['https://www.facebook.com/someusername/', 'facebook.com/jack4567', 'fb.com/carl123']);
            expect(''.match(FACEBOOK_REGEX_GLOBAL)).toBe(null);
        });
    });
    describe('YOUTUBE_REGEX', () => {
        it('works', () => {
            expect(YOUTUBE_REGEX).toBeInstanceOf(RegExp);
            expect(YOUTUBE_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(YOUTUBE_REGEX.flags).toBe('i');
            expect(YOUTUBE_REGEX_GLOBAL.flags).toBe('gi');

            expect(''.match(social.YOUTUBE_REGEX_GLOBAL)).toBe(null);
            expect(' dummy '.match(social.YOUTUBE_REGEX_GLOBAL)).toBe(null);

            expect(YOUTUBE_REGEX.test('https://www.youtube.com/watch?v=kM7YfhfkiEE')).toBe(true);
            expect(YOUTUBE_REGEX.test('https://youtu.be/kM7YfhfkiEE')).toBe(true);
            expect(YOUTUBE_REGEX.test('https://www.youtube.com/c/TrapNation')).toBe(true);
            expect(YOUTUBE_REGEX.test('https://www.youtube.com/channel/UCklie6BM0fhFvzWYqQVoCTA')).toBe(true);
            expect(YOUTUBE_REGEX.test('https://www.youtube.com/user/pewdiepie')).toBe(true);
            expect(YOUTUBE_REGEX.test('https://www.youtube.com/linkinpark')).toBe(true);

            expect(YOUTUBE_REGEX.test('https://www.youtube.com/@LinkinPark')).toBe(true);
            expect(YOUTUBE_REGEX.test('https://www.youtube.com/c/@TrapNation')).toBe(true);

            expect(YOUTUBE_REGEX.test('https://www.youtube.com/user/@PewDiePie')).toBe(false);
            expect(YOUTUBE_REGEX.test('https://www.youtube.com/channel/@TrapNation')).toBe(false);
            expect(YOUTUBE_REGEX.test('https://youtu.be/@kM7YfhfkiEE')).toBe(false);

            expect(YOUTUBE_REGEX.test('://www.youtube.com/c/TrapNation')).toBe(false);
            expect(YOUTUBE_REGEX.test('https://youtu.be/kM7YfhfkiEE https://www.youtube.com/user/pewdiepie')).toBe(
                false,
            );
            expect(YOUTUBE_REGEX.test('xyoutu.be/kM7YfhfkiEE')).toBe(false);
            expect(YOUTUBE_REGEX.test('-https://www.youtube.com/user/pewdiepie')).toBe(false);

            // Test there is just on matching group for the channel, video or username
            expect('https://www.youtube.com/watch?v=kM7YfhfkiEE'.match(social.YOUTUBE_REGEX)![1]).toBe('kM7YfhfkiEE');
            expect('https://youtu.be/kM7YfhfkiEE'.match(social.YOUTUBE_REGEX)![1]).toBe('kM7YfhfkiEE');
            expect('https://www.youtube.com/c/TrapNation'.match(social.YOUTUBE_REGEX)![1]).toBe('TrapNation');
            expect('https://www.youtube.com/channel/UCklie6BM0fhFvzWYqQVoCTA'.match(social.YOUTUBE_REGEX)![1]).toBe(
                'UCklie6BM0fhFvzWYqQVoCTA',
            );
            expect('https://www.youtube.com/user/pewdiepie'.match(social.YOUTUBE_REGEX)![1]).toBe('pewdiepie');

            expect(
                `
                    https://www.youtube.com/apify/
                    -https://www.youtube.com/someusername/
                    youtube.com/jack4567
                    https://www.youtube.com/watch?v=kM7YfhfkiEE
                    byoutube.com/bob
                    ayoutube.com/bob
                    _youtube.com/bob
                    www.youtube.com/c/TrapNation
                    https://www.youtube.com/channel/UCklie6BM0fhFvzWYqQVoCTA
                    youtube.com/user/pewdiepie
                    www.youtube.com/@LinkinPark
                    youtube.com/linkinpark
                    `.match(YOUTUBE_REGEX_GLOBAL),
            ).toEqual([
                'https://www.youtube.com/apify',
                'https://www.youtube.com/someusername',
                'youtube.com/jack4567',
                'https://www.youtube.com/watch?v=kM7YfhfkiEE',
                'www.youtube.com/c/TrapNation',
                'https://www.youtube.com/channel/UCklie6BM0fhFvzWYqQVoCTA',
                'youtube.com/user/pewdiepie',
                'www.youtube.com/@LinkinPark',
                'youtube.com/linkinpark',
            ]);
        });
    });
    describe('TIKTOK_REGEX', () => {
        it('works', () => {
            expect(TIKTOK_REGEX).toBeInstanceOf(RegExp);
            expect(TIKTOK_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(TIKTOK_REGEX.flags).toBe('i');
            expect(TIKTOK_REGEX_GLOBAL.flags).toBe('gi');

            expect(''.match(TIKTOK_REGEX_GLOBAL)).toBe(null);
            expect(' dummy '.match(TIKTOK_REGEX_GLOBAL)).toBe(null);

            expect(TIKTOK_REGEX.test('https://www.tiktok.com/trending?shareId=123456789')).toBe(true);
            expect(TIKTOK_REGEX.test('https://www.tiktok.com/embed/123456789')).toBe(true);
            expect(TIKTOK_REGEX.test('https://m.tiktok.com/v/123456789')).toBe(true);
            expect(TIKTOK_REGEX.test('https://www.tiktok.com/@user')).toBe(true);
            expect(TIKTOK_REGEX.test('https://www.tiktok.com/@user/video/123456789')).toBe(true);

            expect(TIKTOK_REGEX.test('_https://www.tiktok.com/trending?shareId=123456789')).toBe(false);
            expect(TIKTOK_REGEX.test('xtiktok.com/embed/123456789/')).toBe(false);
            expect(TIKTOK_REGEX.test('_pinterest.com/someusername')).toBe(false);
            expect(TIKTOK_REGEX.test('0https://www.tiktok.com/trending?shareId=123456789')).toBe(false);

            // Test there is just one matching group for video id or username
            expect('https://www.tiktok.com/trending?shareId=123456789'.match(TIKTOK_REGEX)![1]).toBe(
                'trending?shareId=123456789',
            );
            expect('www.tiktok.com/embed/123456789/'.match(TIKTOK_REGEX)![1]).toBe('embed/123456789');
            expect('tiktok.com/@jack'.match(TIKTOK_REGEX)![1]).toBe('@jack');
            expect('https://www.tiktok.com/@username/video/123456789'.match(TIKTOK_REGEX)![1]).toBe(
                '@username/video/123456789',
            );

            expect(
                `
                    https://www.tiktok.com/trending?shareId=123456789
                    www.tiktok.com/embed/123456789/
                    m.tiktok.com/v/123456789
                    tiktok.com/@user
                    https://www.tiktok.com/@username/video/123456789
                    -https://www.tiktok.com/@username/video/82347868
                    atiktok.com/embed/123456789/
                    _tiktok.com/embed/123456789/
                    www.tiktok.com/embed/nonNumericVideoId
                    https://www.tiktok.com/@jack1234/invalidSubpath/
                    https://www.tiktok.com/trending?shareId=1234567898904582904537057328079034789063454432789054378
                    https://www.tiktok.com/@userWithLongVideoName/video/123456789890458290453705732807903478904327890543654645365478
                    `.match(TIKTOK_REGEX_GLOBAL),
            ).toEqual([
                'https://www.tiktok.com/trending?shareId=123456789',
                'www.tiktok.com/embed/123456789/',
                'm.tiktok.com/v/123456789',
                'tiktok.com/@user',
                'https://www.tiktok.com/@username/video/123456789',
                'https://www.tiktok.com/@username/video/82347868',
                'https://www.tiktok.com/@jack1234/',
                'https://www.tiktok.com/@userWithLongVideoName/',
            ]);
        });
    });

    describe('PINTEREST_REGEX', () => {
        it('works', () => {
            expect(PINTEREST_REGEX).toBeInstanceOf(RegExp);
            expect(PINTEREST_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(PINTEREST_REGEX.flags).toBe('i');
            expect(PINTEREST_REGEX_GLOBAL.flags).toBe('gi');

            expect(''.match(PINTEREST_REGEX_GLOBAL)).toBe(null);
            expect(' dummy '.match(PINTEREST_REGEX_GLOBAL)).toBe(null);

            expect(PINTEREST_REGEX.test('https://pinterest.com/pin/123456789')).toBe(true);
            expect(PINTEREST_REGEX.test('https://www.pinterest.cz/pin/123456789')).toBe(true);
            expect(PINTEREST_REGEX.test('https://www.pinterest.com/user')).toBe(true);
            expect(PINTEREST_REGEX.test('https://www.pinterest.co.uk/user')).toBe(true);
            expect(PINTEREST_REGEX.test('pinterest.com/user_name.gold')).toBe(true);
            expect(PINTEREST_REGEX.test('https://cz.pinterest.com/user/board')).toBe(true);

            expect(PINTEREST_REGEX.test('_https://pinterest.com/pin/123456789')).toBe(false);
            expect(PINTEREST_REGEX.test('xpinterest.com/user_name.gold')).toBe(false);
            expect(PINTEREST_REGEX.test('_pinterest.com/someusername')).toBe(false);
            expect(PINTEREST_REGEX.test('0pinterest.com/someusername')).toBe(false);

            // Test there is just on matching group for the pin, board or username
            expect('https://pinterest.com/pin/123456789'.match(PINTEREST_REGEX)![1]).toBe('pin/123456789');
            expect('https://www.pinterest.com/username'.match(PINTEREST_REGEX)![1]).toBe('username');
            expect('pinterest.com/user_name.gold'.match(PINTEREST_REGEX)![1]).toBe('user_name.gold');
            expect('https://cz.pinterest.com/username/board'.match(PINTEREST_REGEX)![1]).toBe('username/board');

            expect(
                `
                    https://pinterest.com/pin/123456789
                    -https://pinterest.com/pin/10084556789/
                    https://www.pinterest.cz/pin/123456789
                    https://www.pinterest.com/user
                    https://uk.pinterest.com/user
                    https://www.pinterest.co.uk/user
                    pinterest.com/user_name.gold
                    https://cz.pinterest.com/user/board
                    https://www.pinterest.cz/pin/nonNumericPinId
                    `.match(PINTEREST_REGEX_GLOBAL),
            ).toEqual([
                'https://pinterest.com/pin/123456789',
                'https://pinterest.com/pin/10084556789/',
                'https://www.pinterest.cz/pin/123456789',
                'https://www.pinterest.com/user',
                'https://uk.pinterest.com/user',
                'https://www.pinterest.co.uk/user',
                'pinterest.com/user_name.gold',
                'https://cz.pinterest.com/user/board',
            ]);
        });
    });

    describe('DISCORD_REGEX', () => {
        it('works', () => {
            expect(DISCORD_REGEX).toBeInstanceOf(RegExp);
            expect(DISCORD_REGEX_GLOBAL).toBeInstanceOf(RegExp);

            expect(DISCORD_REGEX.flags).toBe('i');
            expect(DISCORD_REGEX_GLOBAL.flags).toBe('gi');

            expect(''.match(DISCORD_REGEX_GLOBAL)).toBe(null);
            expect(' dummy '.match(DISCORD_REGEX_GLOBAL)).toBe(null);

            expect(DISCORD_REGEX.test('https://discord.gg/discord-developers')).toBe(true);
            expect(DISCORD_REGEX.test('https://discord.com/invite/jyEM2PRvMU')).toBe(true);
            expect(DISCORD_REGEX.test('https://discordapp.com/channels/231496023303957476')).toBe(true);
            expect(DISCORD_REGEX.test('https://discord.com/channels/231496023303957476/2332823543826404586')).toBe(
                true,
            );
            expect(DISCORD_REGEX.test('https://ptb.discord.com/channels/231496023303957476/2332823543826404586')).toBe(
                true,
            );
            expect(DISCORD_REGEX.test('ptb.discord.com/invite/jyEM2PRvMU')).toBe(true);
            expect(DISCORD_REGEX.test('canary.discord.com/invite/jyEM2PRvMU')).toBe(true);

            expect(DISCORD_REGEX.test('https://discord.com/channels/nonNumbericChannelId')).toBe(false);
            expect(DISCORD_REGEX.test('9discord.gg/discord-developers')).toBe(false);
            expect(DISCORD_REGEX.test('-discordapp.com/channels/231496023303957476/')).toBe(false);

            // Test there is just on matching group for the channel or invite (matches discord.* / discordapp.* prefix as well as they differ)
            expect('https://discord.gg/discord-developers'.match(DISCORD_REGEX)![1]).toBe(
                'discord.gg/discord-developers',
            );
            expect('https://discord.com/invite/jyEM2PRvMU'.match(DISCORD_REGEX)![1]).toBe(
                'discord.com/invite/jyEM2PRvMU',
            );
            expect('https://discordapp.com/channels/231496023303957476'.match(DISCORD_REGEX)![1]).toBe(
                'discordapp.com/channels/231496023303957476',
            );
            expect('https://discord.com/channels/231496023303957476/2332823543826404586'.match(DISCORD_REGEX)![1]).toBe(
                'discord.com/channels/231496023303957476/2332823543826404586',
            );

            expect(
                `
                    https://discord.gg/discord-developers/
                    https://discord.com/invite/jyEM2PRvMU
                    -https://discordapp.com/channels/231496023303957476/
                    https://discord.com/channels/231496023303957476/2332823543826404586
                    discord.gg/discord-developers
                    https://discordapp.com/channels/nonNumbericChannelId
                    `.match(DISCORD_REGEX_GLOBAL),
            ).toEqual([
                'https://discord.gg/discord-developers/',
                'https://discord.com/invite/jyEM2PRvMU',
                'https://discordapp.com/channels/231496023303957476/',
                'https://discord.com/channels/231496023303957476/2332823543826404586',
                'discord.gg/discord-developers',
            ]);
        });
    });
});
