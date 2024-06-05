import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

// TODO: Finish generalizing or specializing this module.

/**
 * To turn your web pages into graph objects, you need to add basic metadata to your page. We've based the initial version
 * of the protocol on RDFa which means that you'll place additional <meta> tags in the <head> of your web page. The four
 * required properties for every page are:
 *
 * - `og:title` - The title of your object as it should appear within the graph, e.g., "The Rock".
 * - `og:type` - The type of your object, e.g., "video.movie". Depending on the type you specify, other properties may also be required.
 * - `og:image` - An image URL which should represent your object within the graph.
 * - `og:url` - The canonical URL of your object that will be used as its permanent ID in the graph, e.g., "https://www.imdb.com/title/tt0117500/".
 */
export interface OpenGraphBasicMetadata {
    /**
     * `og:title` - The title of your object as it should appear within the graph, e.g., "The Rock".
     */
    title?: string;
    /**
     * `og:type` - The type of your object, e.g., "video.movie". Depending on the type you specify, other properties may also be required.
     */
    type?: string;
    /**
     * `og:image` - An image URL which should represent your object within the graph.
     */
    image?: OpenGraphImageMetadataUnion;
    /**
     * `og:url` - The canonical URL of your object that will be used as its permanent ID in the graph, e.g., "https://www.imdb.com/title/tt0117500/".
     */
    url?: string;
}

/**
 * The `og:image` or `OpenGraphBasicMetadata::image` property can be any of the following:
 *
 * 1. String: An image URL which should represent your object within the graph.
 * 2. Array of Strings: If a tag can have multiple values, just put multiple versions of the same `<meta>` tag on your page. The first tag (from top
 *    to bottom) is given preference during conflicts.
 * 3. OpenGraphImageMetadata: The `OpenGraphImageMetadata` class has some optional structured properties.
 * 4. Array of OpenGraphImageMetadatas: Put structured properties after you declare their root tag. Whenever another root element is parsed, that structured
 *    property is considered to be done and another one is started.
 * 5. Array of Strings or OpenGraphImageMetadatas: Some images may be specified without any properties, including the `og:image:url` property, which
 *    can be inferred from the
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
     * Identical to `OpenGraphBasicMetadata::image`.
     */
    url?: string;
    /**
     * An alternate url to use if the webpage requires HTTPS.
     */
    secureUrl?: string;
    /**
     * A MIME type for this image.
     */
    type?: string;
    /**
     * The number of pixels wide.
     */
    width?: number;
    /**
     * The number of pixels high.
     */
    height?: number;
    /**
     * A description of what is in the image (not a caption). If the page specifies an og:image it should specify `og:image:alt`.
     */
    alt?: string;
}

export interface OpenGraphProperty {
    name: string;
    outputName: string;
    children: OpenGraphProperty[];
    // This may be useful in figuring out whether or not to treat it like an array (or an array of dictionaries)
    // cardinality?: Number;
}

export type OpenGraphResult = string | string[] | Dictionary<string | Dictionary>;

export type OpenGraphMetadataUnion = OpenGraphBasicMetadata;

/**
 * This will read the first `<meta>` tag whose `property` attribute matches the value in the `propertyName` argument.
 * Per the protocol, the first tag (from top to bottom) is given preference during conflicts.
 * @param $ A `CheerioAPI` object.
 * @param propertyName
 */
function parseFirstOpenGraphMetaTagContentString($: CheerioAPI, propertyName: string): string | undefined {
    const cssSelector = `meta[property="${propertyName}"]`;
    const result = $(cssSelector);
    if (result.length > 0) {
        return result.attr('content');
    }
    return undefined;
}

function parseOpenGraphImageMetaTags($: CheerioAPI): OpenGraphImageMetadataUnion | undefined {
    const cssSelector = `meta[property="og:image"]`;
    let queryResult = $(cssSelector);
    const result: OpenGraphImageMetadataUnion | [] = [];
    if (queryResult.length > 0) {
        // let's track the most recent root element
        let mostRecentImage: string | OpenGraphImageMetadata | undefined;

        do {
            // re-read the property, it does match everything starting with og:image
            const property = queryResult.attr('property');
            const content = queryResult.attr('content');

            // this is a new image root tag with a url value
            if (property === 'og:image') {
                // if there was a previous image root tag, add it to the result
                if (mostRecentImage) {
                    result.push(mostRecentImage as never);
                }
                mostRecentImage = content;
            }
            // this is an image metadata tag
            else {
                // convert any image root tags with only a url value into structures with a url field
                if (typeof mostRecentImage === 'string') {
                    mostRecentImage = { url: mostRecentImage };
                } else if (typeof mostRecentImage === 'undefined') {
                    mostRecentImage = {};
                }
                // read further image metadata
                switch (property) {
                    case 'og:image:url':
                        mostRecentImage = { url: content, ...(mostRecentImage as OpenGraphImageMetadata) };
                        break;
                    case 'og:image:secure_url':
                        mostRecentImage = { secureUrl: content, ...(mostRecentImage as OpenGraphImageMetadata) };
                        break;
                    case 'og:image:type':
                        mostRecentImage = { type: content, ...(mostRecentImage as OpenGraphImageMetadata) };
                        break;
                    case 'og:image:width':
                        mostRecentImage = {
                            width: parseFloat(content?.replaceAll(/[\D]/g, '') || '') || undefined,
                            ...(mostRecentImage as OpenGraphImageMetadata),
                        };
                        break;
                    case 'og:image:height':
                        mostRecentImage = {
                            height: parseFloat(content?.replaceAll(/[\D]/g, '') || '') || undefined,
                            ...(mostRecentImage as OpenGraphImageMetadata),
                        };
                        break;
                    case 'og:image:alt':
                        mostRecentImage = { alt: content, ...(mostRecentImage as OpenGraphImageMetadata) };
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
        if (mostRecentImage) {
            result.push(mostRecentImage as never);
        }
    }
    return result.length ? (result as OpenGraphImageMetadataUnion) : undefined;
}

function parseOpenGraphBasicMetadata($: CheerioAPI): OpenGraphBasicMetadata {
    return {
        image: parseOpenGraphImageMetaTags($),
        title: parseFirstOpenGraphMetaTagContentString($, 'og:title'),
        type: parseFirstOpenGraphMetaTagContentString($, 'og:type'),
        url: parseFirstOpenGraphMetaTagContentString($, 'og:url'),
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

    // Parse basic metadata
    const basicMetaData: OpenGraphBasicMetadata = parseOpenGraphBasicMetadata($);
    ogrDict = Object.assign(ogrDict, basicMetaData);

    // // Assemble open graph properties to search for
    // let props = [...(additionalProperties || []), ...OPEN_GRAPH_PROPERTIES];

    // Determine cardinality of each element
    // props = props.map((prop) => {
    // });
    ogrDict = Object.assign(
        ogrDict,
        [...(additionalProperties || []), ...OPEN_GRAPH_PROPERTIES].reduce(
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
