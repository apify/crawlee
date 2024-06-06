import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

// TODO: Finish generalizing or specializing this module.

/**
 * To turn your web pages into graph objects, you need to add basic metadata to your page. We've based the initial version
 * of the protocol on RDFa which means that you'll place additional <meta> tags in the <head> of your web page. The four
 * required properties for every page are:
 *
 * - `og:url` - The canonical URL of your object that will be used as its permanent ID in the graph, e.g., "https://www.imdb.com/title/tt0117500/".
 * - `og:title` - The title of your object as it should appear within the graph, e.g., "The Rock".
 * - `og:type` - The type of your object, e.g., "video.movie". Depending on the type you specify, other properties may also be required.
 * - `og:image` - An image URL which should represent your object within the graph.
 * 
 * See more at https://ogp.me/. Turtle specification available at https://ogp.me/ns/ogp.me.ttl.
 */
export interface OpenGraphMetadata {
    /**
     * `og:url` - The canonical URL of your object that will be used as its permanent ID in the graph, e.g., "https://www.imdb.com/title/tt0117500/".
     */
    url?: string;
    /**
     * `og:type` - The type of your object, e.g., "video.movie". Depending on the type you specify, other properties may also be required.
     */
    type?: string;
    /**
     * `og:title` - The title of your object as it should appear within the graph, e.g., "The Rock".
     */
    title?: string;
    /**
     * `og:locale` - The locale these tags are marked up in. Of the format language_TERRITORY. Default is en_US.
     */
    locale?: string;
    /**
     * `og:locale:alternate` - An array of other locales this page is available in.
     **/
    localeAlternate?: string[];
    /**
     * `og:image` - An image URL which should represent your object within the graph.
     */
    image?: OpenGraphImageMetadataUnion;
    /**
     * `og:video` - A URL to a video file that complements this object.
     **/
    video?: OpenGraphVideoMetadataUnion;
    /** 
     * `og:audio` - A URL to an audio file to accompany this object.
     **/
    audio?: OpenGraphAudioMetadataUnion;
    /**
     * `og:description` - A one to two sentence description of your object.
     **/
    description?: string;
    /**
     * `og:site_name` - If your object is part of a larger web site, the name which should be displayed for the overall site. e.g., "IMDb".
     **/
    siteName?: string;
    /**
     * `og:determiner` - The word that appears before this object's title in a sentence. An enum of (a, an, the, "", auto). If auto is chosen, the
     * consumer of your data should chose between "a" or "an". Default is "" (blank).
     **/
    determiner?: string;
}

/**
 * The `og:image` or `OpenGraphMetadata::image` property can be any of the following:
 *
 * 1. String: An image URL which should represent your object within the graph.
 * 2. Array of Strings: If a tag can have multiple values, just put multiple versions of the same `<meta>` tag on your page. The first tag (from top
 *    to bottom) is given preference during conflicts.
 * 3. OpenGraphImageMetadata: The `OpenGraphImageMetadata` class has some optional structured properties.
 * 4. Array of OpenGraphImageMetadatas: Put structured properties after you declare their root tag. Whenever another root element is parsed, that structured
 *    property is considered to be done and another one is started.
 * 5. Array of Strings or OpenGraphImageMetadatas: Some images may be specified without any properties, including the `og:image:url` property.
 */
export type OpenGraphImageMetadataUnion =
    | OpenGraphImageMetadata
    | string
    | [OpenGraphImageMetadata]
    | [string]
    | [OpenGraphImageMetadata | string];

/**
 * The `OpenGraphImageMetadata` class has some optional structured properties.
 */
export interface OpenGraphImageMetadata {
    /**
     * `og:image` - An image URL which should represent your object within the graph.
     */
    url?: string;
    /**
     * `og:image:secure_url` - An alternate url to use if the webpage requires HTTPS.
     */
    secureUrl?: string;
    /**
     * `og:image:type` - A MIME type for this image.
     */
    type?: string;
    /**
     * `og:image:width` - The number of pixels wide.
     */
    width?: number;
    /**
     * `og:image:height` - The number of pixels high.
     */
    height?: number;
    /**
     * `og:image:alt` - A description of what is in the image (not a caption). If the page specifies an og:image it should specify `og:image:alt`.
     */
    alt?: string;
}

/**
 * The `og:video` or `OpenGraphMetadata::video` property can be any of the following:
 *
 * 1. String: A URL to a video file that complements this object.
 * 2. Array of Strings: If a tag can have multiple values, just put multiple versions of the same `<meta>` tag on your page. The first tag (from top
 *    to bottom) is given preference during conflicts.
 * 3. OpenGraphVideoMetadata: The `OpenGraphVideoMetadata` class has some optional structured properties.
 * 4. Array of OpenGraphVideoMetadatas: Put structured properties after you declare their root tag. Whenever another root element is parsed, that structured
 *    property is considered to be done and another one is started.
 * 5. Array of Strings or OpenGraphVideoMetadatas: Some images may be specified without any properties, including the `og:video:url` property.
*/
export type OpenGraphVideoMetadataUnion =
| OpenGraphVideoMetadata
| string
| [OpenGraphVideoMetadata]
| [string]
| [OpenGraphVideoMetadata | string];

/**
 * The `OpenGraphVideoMetadata` class has some optional structured properties.
 */
export interface OpenGraphVideoMetadata {
    /**
     * `og:video` - A relevant video URL for your object.
     */
    url?: string;
    /**
     * `og:video:secure_url` - A relevant, secure video URL for your object.
     */
    secureUrl?: string;
    /**
     * `og:video:type` - The mime type of a video e.g., "application/x-shockwave-flash".
     */
    type?: string;
    /**
     * `og:video:width` - The width of a video.
     */
    width?: number;
    /**
     * `og:video:height` - The height of a video.
     */
    height?: number;
}

/**
 * The `og:audio` or `OpenGraphMetadata::audio` property can be any of the following:
 *
 * 1. String: A URL to a audio file that complements this object.
 * 2. Array of Strings: If a tag can have multiple values, just put multiple versions of the same `<meta>` tag on your page. The first tag (from top
 *    to bottom) is given preference during conflicts.
 * 3. OpenGraphAudioMetadata: The `OpenGraphAudioMetadata` class has some optional structured properties.
 * 4. Array of OpenGraphAudioMetadatas: Put structured properties after you declare their root tag. Whenever another root element is parsed, that structured
 *    property is considered to be done and another one is started.
 * 5. Array of Strings or OpenGraphAudioMetadatas: Some images may be specified without any properties, including the `og:audio:url` property.
*/
export type OpenGraphAudioMetadataUnion =
| OpenGraphAudioMetadata
| string
| [OpenGraphAudioMetadata]
| [string]
| [OpenGraphAudioMetadata | string];

/**
 * The `OpenGraphAudioMetadata` class has some optional structured properties.
 */
export interface OpenGraphAudioMetadata {
    /**
     * `og:video` - A relevant audio URL for your object.
     */
    url?: string;
    /**
     * `og:video:secure_url` - A relevant, secure audio URL for your object.
     */
    secureUrl?: string;
    /**
     * `og:video:type` - The mime type of an audio file e.g., "application/mp3".
     */
    type?: string;
    /**
     * `og:video:width` - The width of a video.
     */
    width?: number;
    /**
     * `og:video:height` - The height of a video.
     */
    height?: number;
}

export interface OpenGraphProperty {
    name: string;
    outputName: string;
    children: OpenGraphProperty[];
    // This may be useful in figuring out whether or not to treat it like an array (or an array of dictionaries)
    // cardinality?: Number;
}

export type OpenGraphResult = string | string[] | Dictionary<string | Dictionary>;

export type OpenGraphMetadataUnion = OpenGraphMetadata;

/**
 * This will read the first `<meta>` tag whose `property` attribute matches the value in the `propertyName` argument.
 * Per the protocol, the first tag (from top to bottom) is given preference during conflicts.
 * @param $ A `CheerioAPI` object.
 * @param propertyName The property name to find the first content value of.
 * @returns A string unless there isn't any, then undefined.
 */
function parseFirstOpenGraphMetaTagContentStringMatching($: CheerioAPI, propertyName: string): string | undefined {
    const cssSelector = `meta[property="${propertyName}"]`;
    const queryResult = $(cssSelector);
    if (queryResult.length > 0) {
        const content = queryResult.attr('content');
        return content;
    }
    return undefined;
}

/**
 * This will read all `<meta>` tag whose `property` attribute matches the value in the `propertyName` argument.
 * Per the protocol, the first tag (from top to bottom) is given preference during conflicts.
 * @param $ A `CheerioAPI` object.
 * @param propertyName The property name to find the all content values of.
 * @returns An array of strings unless there are none, then undefined.
 */
function parseAllOpenGraphMetaTagContentStringsMatching($: CheerioAPI, propertyName: string): string[] | undefined {
    const cssSelector = `meta[property="${propertyName}"]`;
    let queryResult = $(cssSelector);
    if (queryResult.length > 0) {
        const returns: string[] = [];
        do {
            const property = queryResult.attr('property');
            const content = queryResult.attr('content');
            if (property === propertyName && content && content?.toString()) {
                returns.push(content.toString());
            }
            queryResult = queryResult.next();
        }
        while (queryResult.length > 0);
        return returns;
    }
    return undefined;
}


function parseOpenGraphImageMetaTags($: CheerioAPI, ogLabel: string): OpenGraphImageMetadataUnion | undefined {
    const cssSelector = `meta[property="${ogLabel}"]`;
    let queryResult = $(cssSelector);
    const result: OpenGraphImageMetadataUnion | [] = [];
    if (queryResult.length > 0) {
        // let's track the most recent root element
        let mostRecentLabelRoot: string | OpenGraphImageMetadata | undefined;

        do {
            // re-read the property, it does match everything starting with og:image
            const property = queryResult.attr('property');
            const content = queryResult.attr('content');

            // this is a new image root tag with a url value
            if (property === ogLabel) {
                // if there was a previous image root tag, add it to the result
                if (mostRecentLabelRoot) {
                    result.push(mostRecentLabelRoot as never);
                }
                mostRecentLabelRoot = content;
            }
            // this is an image metadata tag
            else {
                // convert any image root tags with only a url value into structures with a url field
                if (typeof mostRecentLabelRoot === 'string') {
                    mostRecentLabelRoot = { url: mostRecentLabelRoot };
                } else if (typeof mostRecentLabelRoot === 'undefined') {
                    mostRecentLabelRoot = {};
                }
                // read further image metadata
                switch (property) {
                    case `${ogLabel}:secure_url`:
                        mostRecentLabelRoot = { secureUrl: content, ...(mostRecentLabelRoot as OpenGraphImageMetadata) };
                        break;
                    case `${ogLabel}:type`:
                        mostRecentLabelRoot = { type: content, ...(mostRecentLabelRoot as OpenGraphImageMetadata) };
                        break;
                    case `${ogLabel}:width`:
                        mostRecentLabelRoot = {
                            width: parseFloat(content?.replaceAll(/[\D\.]/g, '') || '') || undefined,
                            ...(mostRecentLabelRoot as OpenGraphImageMetadata),
                        };
                        break;
                    case `${ogLabel}:height`:
                        mostRecentLabelRoot = {
                            height: parseFloat(content?.replaceAll(/[\D\.]/g, '') || '') || undefined,
                            ...(mostRecentLabelRoot as OpenGraphImageMetadata),
                        };
                        break;
                    case `${ogLabel}:alt`:
                        mostRecentLabelRoot = { alt: content, ...(mostRecentLabelRoot as OpenGraphImageMetadata) };
                        break;
                    default:
                        break;
                }
            }

            // read the next result
            queryResult = queryResult.next();

            // loop until there are no more results
        } while (queryResult.length > 0);

        // if there was a previous image root tag, add it to the result
        if (mostRecentLabelRoot) {
            result.push(mostRecentLabelRoot as never);
        }
    }
    return result.length ? (result as OpenGraphImageMetadataUnion) : undefined;
}

function parseOpenGraphVideoMetaTags($: CheerioAPI, ogLabel: string): OpenGraphVideoMetadataUnion | undefined {
    const cssSelector = `meta[property="${ogLabel}"]`;
    let queryResult = $(cssSelector);
    const result: OpenGraphVideoMetadataUnion | [] = [];
    if (queryResult.length > 0) {
        // let's track the most recent root element
        let mostRecentLabelRoot: string | OpenGraphVideoMetadata | undefined;

        do {
            // re-read the property, it does match everything starting with og:image
            const property = queryResult.attr('property');
            const content = queryResult.attr('content');

            // this is a new image root tag with a url value
            if (property === ogLabel) {
                // if there was a previous image root tag, add it to the result
                if (mostRecentLabelRoot) {
                    result.push(mostRecentLabelRoot as never);
                }
                mostRecentLabelRoot = content;
            }
            // this is an video metadata tag
            else {
                // convert any video root tags with only a url value into structures with a url field
                if (typeof mostRecentLabelRoot === 'string') {
                    mostRecentLabelRoot = { url: mostRecentLabelRoot };
                } else if (typeof mostRecentLabelRoot === 'undefined') {
                    mostRecentLabelRoot = {};
                }
                // read further video metadata
                switch (property) {
                    case `${ogLabel}:secure_url`:
                        mostRecentLabelRoot = { secureUrl: content, ...(mostRecentLabelRoot as OpenGraphVideoMetadata) };
                        break;
                    case `${ogLabel}:type`:
                        mostRecentLabelRoot = { type: content, ...(mostRecentLabelRoot as OpenGraphVideoMetadata) };
                        break;
                    case `${ogLabel}:width`:
                        mostRecentLabelRoot = {
                            width: parseFloat(content?.replaceAll(/[\D\.]/g, '') || '') || undefined,
                            ...(mostRecentLabelRoot as OpenGraphVideoMetadata),
                        };
                        break;
                    case `${ogLabel}:height`:
                        mostRecentLabelRoot = {
                            height: parseFloat(content?.replaceAll(/[\D\.]/g, '') || '') || undefined,
                            ...(mostRecentLabelRoot as OpenGraphVideoMetadata),
                        };
                        break;
                    default:
                        break;
                }
            }

            // read the next result
            queryResult = queryResult.next();

            // loop until there are no more results
        } while (queryResult.length > 0);

        // if there was a previous image root tag, add it to the result
        if (mostRecentLabelRoot) {
            result.push(mostRecentLabelRoot as never);
        }
    }
    return result.length ? (result as OpenGraphVideoMetadataUnion) : undefined;
}

function parseOpenGraphAudioMetaTags($: CheerioAPI, ogLabel: string): OpenGraphAudioMetadataUnion | undefined {
    const cssSelector = `meta[property="${ogLabel}"]`;
    let queryResult = $(cssSelector);
    const result: OpenGraphAudioMetadataUnion | [] = [];
    if (queryResult.length > 0) {
        // let's track the most recent root element
        let mostRecentLabelRoot: string | OpenGraphAudioMetadata | undefined;

        do {
            // re-read the property, it does match everything starting with og:image
            const property = queryResult.attr('property');
            const content = queryResult.attr('content');

            // this is a new image root tag with a url value
            if (property === ogLabel) {
                // if there was a previous image root tag, add it to the result
                if (mostRecentLabelRoot) {
                    result.push(mostRecentLabelRoot as never);
                }
                mostRecentLabelRoot = content;
            }
            // this is an audio metadata tag
            else {
                // convert any video root tags with only a url value into structures with a url field
                if (typeof mostRecentLabelRoot === 'string') {
                    mostRecentLabelRoot = { url: mostRecentLabelRoot };
                } else if (typeof mostRecentLabelRoot === 'undefined') {
                    mostRecentLabelRoot = {};
                }
                // read further audio metadata
                switch (property) {
                    case `${ogLabel}:secure_url`:
                        mostRecentLabelRoot = { secureUrl: content, ...(mostRecentLabelRoot as OpenGraphVideoMetadata) };
                        break;
                    case `${ogLabel}:type`:
                        mostRecentLabelRoot = { type: content, ...(mostRecentLabelRoot as OpenGraphVideoMetadata) };
                        break;
                    case `${ogLabel}:width`:
                        mostRecentLabelRoot = {
                            width: parseFloat(content?.replaceAll(/[\D\.]/g, '') || '') || undefined,
                            ...(mostRecentLabelRoot as OpenGraphVideoMetadata),
                        };
                        break;
                    case `${ogLabel}:height`:
                        mostRecentLabelRoot = {
                            height: parseFloat(content?.replaceAll(/[\D\.]/g, '') || '') || undefined,
                            ...(mostRecentLabelRoot as OpenGraphVideoMetadata),
                        };
                        break;
                    default:
                        break;
                }
            }

            // read the next result
            queryResult = queryResult.next();

            // loop until there are no more results
        } while (queryResult.length > 0);

        // if there was a previous image root tag, add it to the result
        if (mostRecentLabelRoot) {
            result.push(mostRecentLabelRoot as never);
        }
    }
    return result.length ? (result as OpenGraphAudioMetadataUnion) : undefined;
}

function parseOpenGraphMetadata($: CheerioAPI): OpenGraphMetadata {
    return {
        url: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:url'),
        type: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:type'),
        title: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:title'),
        locale: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:locale'),
        localeAlternate: parseAllOpenGraphMetaTagContentStringsMatching($, 'og:locale:alternate'),
        image: parseOpenGraphImageMetaTags($, 'og:image'),
        video: parseOpenGraphVideoMetaTags($, 'og:video'),
        audio: parseOpenGraphAudioMetaTags($, 'og:audio'),
        description: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:description'),
        siteName: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:site_name'),
        determiner: parseFirstOpenGraphMetaTagContentStringMatching($, 'og:determiner'),
    };
}

/**
 * To be used with the spread operator. Ensures that the item is defined, and is not empty.
 *
 * @param key The key for the item to have in the object
 * @param item The item to assign to the key.
 * @returns Either an empty object or an object with the content provided.
 */
const optionalSpread = (key: string, item: any) =>
    item !== undefined && !!Object.values(item)?.length ? { [key]: item } : {};

const OPEN_GRAPH_PROPERTIES: OpenGraphProperty[] = [
    // disabled these for now:
    // {
    //     name: 'og:title',
    //     outputName: 'title',
    //     children: [],
    // },
    // {
    //     name: 'og:type',
    //     outputName: 'type',
    //     children: [],
    // },
    // {
    //     name: 'og:image',
    //     outputName: 'image',
    //     children: [
    //         {
    //             name: 'og:image:url',
    //             outputName: 'url',
    //             children: [],
    //         },
    //         {
    //             name: 'og:image:secure_url',
    //             outputName: 'secureUrl',
    //             children: [],
    //         },
    //         {
    //             name: 'og:image:type',
    //             outputName: 'type',
    //             children: [],
    //         },
    //         {
    //             name: 'og:image:width',
    //             outputName: 'width',
    //             children: [],
    //         },
    //         {
    //             name: 'og:image:height',
    //             outputName: 'height',
    //             children: [],
    //         },
    //         {
    //             name: 'og:image:alt',
    //             outputName: 'alt',
    //             children: [],
    //         },
    //     ],
    // },
    // {
    //     name: 'og:url',
    //     outputName: 'url',
    //     children: [],
    // },
    // {
    //     name: 'og:audio',
    //     outputName: 'audio',
    //     children: [
    //         {
    //             name: 'og:audio:url',
    //             outputName: 'url',
    //             children: [],
    //         },
    //         {
    //             name: 'og:audio:secure_url',
    //             outputName: 'secureUrl',
    //             children: [],
    //         },
    //         {
    //             name: 'og:audio:type',
    //             outputName: 'type',
    //             children: [],
    //         },
    //     ],
    // },
    // {
    //     name: 'og:description',
    //     outputName: 'description',
    //     children: [],
    // },
    // {
    //     name: 'og:determiner',
    //     outputName: 'determiner',
    //     children: [],
    // },
    // {
    //     name: 'og:locale',
    //     outputName: 'locale',
    //     children: [
    //         {
    //             name: 'og:locale:alternate',
    //             outputName: 'alternate',
    //             children: [],
    //         },
    //     ],
    // },
    // {
    //     name: 'og:site_name',
    //     outputName: 'siteName',
    //     children: [],
    // },
    // {
    //     name: 'og:video',
    //     outputName: 'video',
    //     children: [
    //         {
    //             name: 'og:video:url',
    //             outputName: 'url',
    //             children: [],
    //         },
    //         {
    //             name: 'og:video:secure_url',
    //             outputName: 'secureUrl',
    //             children: [],
    //         },
    //         {
    //             name: 'og:video:type',
    //             outputName: 'type',
    //             children: [],
    //         },
    //         {
    //             name: 'og:video:width',
    //             outputName: 'width',
    //             children: [],
    //         },
    //         {
    //             name: 'og:video:height',
    //             outputName: 'height',
    //             children: [],
    //         },
    //         {
    //             name: 'og:video:alt',
    //             outputName: 'alt',
    //             children: [],
    //         },
    //     ],
    // },
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
        //TODO: Include other deprecated properties such as geo:lat, geo:long, vcard:street-address, foaf:phone, isbn, upc, etc.
        //As seen at https://ogp.me/ns/ogp.me.ttl.
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
        ...property.children.reduce(
            (acc, curr) => {
                const parsed = parseOpenGraphProperty(curr, $);
                if (parsed === undefined) return acc;

                return {
                    ...acc,
                    ...optionalSpread(curr.outputName, parseOpenGraphProperty(curr, $)),
                };
            },
            {} as Dictionary<string | Dictionary>,
        ),
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

    let ogrDict: Dictionary<OpenGraphResult> = {};

    // Parse metadata
    const basicMetaData: OpenGraphMetadata = parseOpenGraphMetadata($);
    ogrDict = Object.assign(ogrDict, basicMetaData);

    // // Assemble open graph properties to search for
    let props = [...(additionalProperties || []), ...OPEN_GRAPH_PROPERTIES];

    // Determine cardinality of each element
    // props = props.map((prop) => {
    // });
    ogrDict = Object.assign(
        ogrDict,
        props.reduce(
            (acc, curr) => {
                return {
                    ...acc,
                    ...optionalSpread(curr.outputName, parseOpenGraphProperty(curr, $)),
                };
            },
            {} as Dictionary<OpenGraphResult>,
        ),
    );
    return ogrDict;
}
