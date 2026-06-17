import { parseOpenGraph, OpenGraphMetadata } from '@crawlee/utils';
import { load } from 'cheerio';

describe('parseOpenGraph', () => {
    const case1 = load(`<meta property="og:title" content="Under Pressure"/>
    <meta property="og:type" content="music.song"/>`);

    const case2 = load(`<meta property="video:actor" content="foo"/>
    <meta property="video:actor" content="bar"/>
    <meta property="video:actor" content="baz"/>`);

    const case3 = load(`<meta property="og:locale" content="test"/>
    <meta property="og:locale:alternate" content="foo"/>
    <meta property="og:locale:alternate" content="bar"/>`);

    const case4 = load(`<meta property="music:song:disc" content="hello"/>
    <meta property="music:song:track" content="world"/>`);

    const case5 = load(`<meta property="og:custom:test" content="hello"/>`);

    const case6 = `<meta property="og:title" content="My Website"/>
    <meta property="og:type" content="website"/>`;

    const case7 = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <!-- Example taken from https://ogp.me/ -->
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
        <meta property="og:title" content="The Rock" />
        <meta property="og:type" content="video.movie" />
        <meta property="og:url" content="https://www.imdb.com/title/tt0117500/" />
        <meta property="og:image" content="https://ia.media-imdb.com/images/rock.jpg" />
        <meta property="og:image" content="https://example.com/rock2.jpg" />
        <meta property="og:image:width" content="300" />
        <meta property="og:image:height" content="300" />
        <meta property="og:image" content="https://example.com/rock3.jpg" />
        <meta property="og:image:height" content="1000" />
    </head>
    <body>
        <!-- Not important for this test. -->
    </body>
    </html>`;

    const case8 = `<!-- Example taken from https://ogp.me/ -->
        <meta property="og:title" content="The Rock" />
        <meta property="og:type" content="video.movie" />
        <meta property="og:url" content="https://www.imdb.com/title/tt0117500/" />
        <meta property="og:video" content="https://www.youtube.com/watch?v=jGVJx5mOtL8" />
        <meta property="og:video" content="https://www.youtube.com/watch?v=a3qcNyjj9ZQ" />
        <meta property="og:video:width" content="1920" />
        <meta property="og:video:height" content="1080" />
        <meta property="og:video" content="https://www.youtube.com/watch?v=313n0wga2xo" />
        <meta property="og:video:height" content="1080" />`;

    const case9 = `
        <!-- deprecated properties -->
        <meta property="og:geo:lat" content="50.081534" />
        <meta property="og:geo:long" content="14.426464" />
    `;

    it('Should scrape properties', () => {
        expect(parseOpenGraph(case1)).toEqual({
            title: 'Under Pressure',
            type: 'music.song',
        });
    });

    it('Should return a property as an array if there are multiple attributes under the same property name', () => {
        const parsed = parseOpenGraph(case2) as {
            videoInfo: { actor: { actorValue: string[] } };
        };

        expect(parsed).toHaveProperty('videoInfo');
        expect(parsed.videoInfo.actor.actorValue).toContain('foo');
        expect(parsed.videoInfo.actor.actorValue).toContain('bar');
        expect(parsed.videoInfo.actor.actorValue).toContain('baz');

        const parsed2 = parseOpenGraph(case3) as OpenGraphMetadata;

        expect(parsed2).toHaveProperty('locale');
        expect(parsed2.locale).toContain('test');
        expect(parsed2).toHaveProperty('localeAlternate');
        expect(parsed2.localeAlternate).toContain('foo');
        expect(parsed2.localeAlternate).toContain('bar');
    });

    it('Should parse properties regardless of how deeply they are nested', () => {
        expect(parseOpenGraph(case4)).toEqual({
            musicInfo: { song: { disc: 'hello', track: 'world' } },
        });
    });

    it('Should accept additional OpenGraphProperties', () => {
        const parsed = parseOpenGraph(case5, [
            {
                name: 'og:custom',
                outputName: 'custom',
                children: [
                    {
                        name: 'og:custom:test',
                        outputName: 'test',
                        children: [],
                    },
                ],
            },
        ]);

        expect(parsed).toEqual({ custom: { test: 'hello' } });
    });

    it('Should accept strings as a substitute for CheerioAPI objects', () => {
        expect(parseOpenGraph(case6)).toEqual({
            title: 'My Website',
            type: 'website',
        });
    });

    it('Should parse arrays of images with props', () => {
        const parsed = parseOpenGraph(case7);

        expect(parsed).toEqual({
            title: 'The Rock',
            type: 'video.movie',
            url: 'https://www.imdb.com/title/tt0117500/',
            image: [
                // Either this:
                'https://ia.media-imdb.com/images/rock.jpg',
                // Or this:
                // {
                //     url: 'https://ia.media-imdb.com/images/rock.jpg',
                // },
                {
                    url: 'https://example.com/rock2.jpg',
                    width: 300,
                    height: 300,
                },
                {
                    url: 'https://example.com/rock3.jpg',
                    height: 1000,
                },
            ],
        });
    });

    it('Should parse arrays of videos with props', () => {
        const parsed = parseOpenGraph(case8);

        expect(parsed).toEqual({
            title: 'The Rock',
            type: 'video.movie',
            url: 'https://www.imdb.com/title/tt0117500/',
            video: [
                // Either this:
                'https://www.youtube.com/watch?v=jGVJx5mOtL8',
                // Or this:
                // {
                //     url: 'https://www.youtube.com/watch?v=jGVJx5mOtL8',
                // },
                {
                    url: 'https://www.youtube.com/watch?v=a3qcNyjj9ZQ',
                    width: 1920,
                    height: 1080,
                },
                {
                    url: 'https://www.youtube.com/watch?v=313n0wga2xo',
                    height: 1080,
                },
            ],
        });
    });

    it('Should parse deprecated geo:lat and geo:long', () => {
        const parsed = parseOpenGraph(case9);

        expect(parsed).toEqual({
            geo: {
                latitude: 50.081534,
                longitude: 14.426464,
            },
        });
    });
});
