import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

export interface OpenGraphProperty {
    name: string;
    outputName: string;
    children: OpenGraphProperty[];
};

type OpenGraphResult = string | string[] | Dictionary<string | Dictionary>;

/**
 * To be used with the spread operator. Ensures that the item is defined, and is not empty.
 *
 * @param key The key for the item to have in the object
 * @param item The item to assign to the key.
 * @returns Either an empty object or an object with the content provided.
 */
const optionalSpread = (key: string, item: any) => (item !== undefined && !!Object.values(item)?.length ? { [key]: item } : {});

const OPEN_GRAPH_PROPERTIES: OpenGraphProperty[] = [
    {
        name: 'og:title',
        outputName: 'title',
        children: [],
    },
    {
        name: 'og:type',
        outputName: 'type',
        children: [],
    },
    {
        name: 'og:image',
        outputName: 'image',
        children: [
            {
                name: 'og:image:url',
                outputName: 'url',
                children: [],
            },
            {
                name: 'og:image:secure_url',
                outputName: 'secureUrl',
                children: [],
            },
            {
                name: 'og:image:type',
                outputName: 'type',
                children: [],
            },
            {
                name: 'og:image:width',
                outputName: 'width',
                children: [],
            },
            {
                name: 'og:image:height',
                outputName: 'height',
                children: [],
            },
            {
                name: 'og:image:alt',
                outputName: 'alt',
                children: [],
            },
        ],
    },
    {
        name: 'og:url',
        outputName: 'url',
        children: [],
    },
    {
        name: 'og:audio',
        outputName: 'audio',
        children: [
            {
                name: 'og:audio:url',
                outputName: 'url',
                children: [],
            },
            {
                name: 'og:audio:secure_url',
                outputName: 'secureUrl',
                children: [],
            },
            {
                name: 'og:audio:type',
                outputName: 'type',
                children: [],
            },
        ],
    },
    {
        name: 'og:description',
        outputName: 'description',
        children: [],
    },
    {
        name: 'og:determiner',
        outputName: 'determiner',
        children: [],
    },
    {
        name: 'og:locale',
        outputName: 'locale',
        children: [
            {
                name: 'og:locale:alternate',
                outputName: 'alternate',
                children: [],
            },
        ],
    },
    {
        name: 'og:site_name',
        outputName: 'siteName',
        children: [],
    },
    {
        name: 'og:video',
        outputName: 'video',
        children: [
            {
                name: 'og:video:url',
                outputName: 'url',
                children: [],
            },
            {
                name: 'og:video:secure_url',
                outputName: 'secureUrl',
                children: [],
            },
            {
                name: 'og:video:type',
                outputName: 'type',
                children: [],
            },
            {
                name: 'og:video:width',
                outputName: 'width',
                children: [],
            },
            {
                name: 'og:video:height',
                outputName: 'height',
                children: [],
            },
            {
                name: 'og:video:alt',
                outputName: 'alt',
                children: [],
            },
        ],
    },
    // The properties below aren't prefixed with "og".
    // Part of the reason the properties have been hardcoded is because not all OpenGraph properties start with "og".
    // Especially the newer ones that extend "og:type".
    {
        name: 'video',
        outputName: 'videoInfo',
        children: [
            {
                name: 'video:actor',
                outputName: 'actor',
                children: [
                    {
                        name: 'video:actor:role',
                        outputName: 'role',
                        children: [],
                    },
                ],
            },
            {
                name: 'video:director',
                outputName: 'director',
                children: [],
            },
            {
                name: 'video:writer',
                outputName: 'writer',
                children: [],
            },
            {
                name: 'video:duration',
                outputName: 'duration',
                children: [],
            },
            {
                name: 'video:release_date',
                outputName: 'releaseDate',
                children: [],
            },
            {
                name: 'video:tag',
                outputName: 'tag',
                children: [],
            },
            {
                name: 'video:series',
                outputName: 'series',
                children: [],
            },
        ],
    },
    {
        name: 'music',
        outputName: 'musicInfo',
        children: [
            {
                name: 'music:duration',
                outputName: 'duration',
                children: [],
            },
            {
                name: 'music:album',
                outputName: 'album',
                children: [
                    {
                        name: 'music:album:disc',
                        outputName: 'disc',
                        children: [],
                    },
                    {
                        name: 'music:album:track',
                        outputName: 'track',
                        children: [],
                    },
                ],
            },
            {
                name: 'music:musician',
                outputName: 'musician',
                children: [],
            },
            {
                name: 'music:song',
                outputName: 'song',
                children: [
                    {
                        name: 'music:song:disc',
                        outputName: 'disc',
                        children: [],
                    },
                    {
                        name: 'music:song:track',
                        outputName: 'track',
                        children: [],
                    },
                ],
            },
            {
                name: 'music:release_date',
                outputName: 'releaseDate',
                children: [],
            },
            {
                name: 'music:creator',
                outputName: 'creator',
                children: [],
            },
        ],
    },
    {
        name: 'article',
        outputName: 'articleInfo',
        children: [
            {
                name: 'music:published_time',
                outputName: 'publishedTime',
                children: [],
            },
            {
                name: 'music:modified_time',
                outputName: 'modifiedTime',
                children: [],
            },
            {
                name: 'music:expiration_time',
                outputName: 'expirationTime',
                children: [],
            },
            {
                name: 'music:author',
                outputName: 'author',
                children: [],
            },
            {
                name: 'music:section',
                outputName: 'section',
                children: [],
            },
            {
                name: 'music:tag',
                outputName: 'tag',
                children: [],
            },
        ],
    },
    {
        name: 'book',
        outputName: 'bookInfo',
        children: [
            {
                name: 'book:author',
                outputName: 'author',
                children: [],
            },
            {
                name: 'book:isbn',
                outputName: 'isbn',
                children: [],
            },
            {
                name: 'book:release_date',
                outputName: 'releaseDate',
                children: [],
            },
            {
                name: 'book:tag',
                outputName: 'tag',
                children: [],
            },
        ],
    },
    {
        name: 'profile',
        outputName: 'profileInfo',
        children: [
            {
                name: 'profile:first_name',
                outputName: 'firstName',
                children: [],
            },
            {
                name: 'profile:last_name',
                outputName: 'lastName',
                children: [],
            },
            {
                name: 'profile:username',
                outputName: 'username',
                children: [],
            },
            {
                name: 'profile:gender',
                outputName: 'gender',
                children: [],
            },
        ],
    },
];

const makeOpenGraphSelector = (name: string) => `meta[property="${name}"]`;

const parseOpenGraphProperty = (property: OpenGraphProperty, $: CheerioAPI): string | string[] | OpenGraphResult => {
    // Some OpenGraph properties can be added multiple times, such as with video:actor. We must handle this case.
    const values = [...$(makeOpenGraphSelector(property.name))].map((elem) => $(elem).attr('content'));

    // If there is more than 1 item, keep it a an array. Otherwise, return just the first value.
    const content = values.length <= 1 ? (values[0] as string) : (values as string[]);

    // If the property has no children, just return its value immediately.
    if (!property.children.length) return content;

    // Otherwise, return an object with the values for the property, along with the values for its children.
    return {
        // We do this, because for example, there can be a value under og:image which should still be parsed,
        // but there can also be child properties such as og:image:url or og:image:size
        // "Value" is appended to the end of the property name to make it more clear, and to prevent things such
        // as `videoInfo.actor.actor` to grab the actor's name.
        ...optionalSpread(`${property.outputName}Value`, content),
        ...property.children.reduce((acc, curr) => {
            const parsed = parseOpenGraphProperty(curr, $);
            if (parsed === undefined) return acc;

            return {
                ...acc,
                ...optionalSpread(curr.outputName, parseOpenGraphProperty(curr, $)),
            };
        }, {} as Dictionary<string | Dictionary>),
    };
};

/**
 * Easily parse all OpenGraph properties from a page with just a `CheerioAPI` object.
 *
 * @param $ A `CheerioAPI` object, or a string of raw HTML.
 * @param additionalProperties Any potential additional `OpenGraphProperty` items you'd like to be scraped.
 * Currently existing properties are kept up to date.
 * @returns Scraped OpenGraph properties as an object.
 */
export function parseOpenGraph(raw: string, additionalProperties?: OpenGraphProperty[]): Dictionary<OpenGraphResult>;
export function parseOpenGraph($: CheerioAPI, additionalProperties?: OpenGraphProperty[]): Dictionary<OpenGraphResult>;
export function parseOpenGraph(item: CheerioAPI | string, additionalProperties?: OpenGraphProperty[]) {
    const $ = typeof item === 'string' ? load(item) : item;

    return [...(additionalProperties || []), ...OPEN_GRAPH_PROPERTIES].reduce((acc, curr) => {
        return {
            ...acc,
            ...optionalSpread(curr.outputName, parseOpenGraphProperty(curr, $)),
        };
    }, {} as Dictionary<OpenGraphResult>);
};
