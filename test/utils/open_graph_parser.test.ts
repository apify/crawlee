import { parseOpenGraph } from '@crawlee/utils';
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

        const parsed2 = parseOpenGraph(case3) as {
            locale: { localeValue: string; alternate: string[] };
        };

        expect(parsed2).toHaveProperty('locale');
        expect(parsed2.locale.alternate).toContain('foo');
        expect(parsed2.locale.alternate).toContain('bar');
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
});
