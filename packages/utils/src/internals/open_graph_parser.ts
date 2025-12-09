import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

// TODO: Finish specializing this module, removing generalization as you go.

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
    localeAlternate?: string[]; // because you can't subclass a string
    /**
     * `og:image` - An image URL which should represent your object within the graph.
     */
    image?: OpenGraphImageMetadata | string | OpenGraphImageMetadata[] | string[] | [OpenGraphImageMetadata | string];
    /**
     * `og:video` - A URL to a video file that complements this object.
     **/
    video?: OpenGraphVideoMetadata | string | OpenGraphVideoMetadata[] | string[] | [OpenGraphVideoMetadata | string];
    /**
     * `og:audio` - A URL to an audio file to accompany this object.
     **/
    audio?: OpenGraphAudioMetadata | string | OpenGraphAudioMetadata[] | string[] | [OpenGraphAudioMetadata | string];
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
    /**
     * @deprecated `og:geo` - The latitude and longitude of a resource.
     */
    geo?: OpenGraphGeoMetadata;
}

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
 * The `OpenGraphAudioMetadata` class has some optional structured properties.
 */
export interface OpenGraphAudioMetadata {
    /**
     * `og:audio` - A relevant audio URL for your object.
     */
    url?: string;
    /**
     * `og:audio:secure_url` - A relevant, secure audio URL for your object.
     */
    secureUrl?: string;
    /**
     * `og:audio:type` - The mime type of an audio file e.g., "application/mp3".
     */
    type?: string;
    /**
     * @deprecated `og:audio:A title for some audio.
     */
    title?: string;
    /**
     * @deprecated An artist of some audio.
     */
    artist?: string;
    /**
     * @deprecated An album to which some audio belongs.
     */
    album?: string;
}

/**
 * @deprecated The `OpenGraphGeoMetadata` class stores the latitude and longitude for a resource.
 */
export interface OpenGraphGeoMetadata {
    /**
     * @deprecated `og:geo:lat` - The latitude of the resource e.g., the latitude of a company.
     */
    latitude?: number;
    /**
     * @deprecated `og:geo:long` - The longitude of the resource e.g., the longitude of a company.
     */
    longitude?: number;
}

export interface OpenGraphProperty {
    name: string;
    outputName: string;
    children: OpenGraphProperty[];
    // This may be useful in figuring out whether or not to treat it like an array (or an array of dictionaries)
    // cardinality?: Number;
}

export type OpenGraphResult = string | number | string[] | Dictionary<string | number | Dictionary>;

/**
 * An OpenGraphParseHandler is triggered during parsing when the label and contents are read from the META tags.
 * You can use a custom handler, or if you don't specify one it will by default copy the content read from the tag
 * as a string. You may use a custom type.
 */
export type OpenGraphParseHandler<R> = <R>(content: string) => R;

/**
 * This is the default behavior for parsing the data. It copies the content to the return value.
 * @param _label Unused in this implementation, the label for the Open Graph property.
 * @param content The value for the Open Graph property.
 * @returns The string value of the Open Graph content property.
 */
export function parseString(content: string): string {
    // Copy the content to the return value.
    return content;
}

/**
 * This reads a number from content and returns the number.
 * @param _label Unused in this implementation, the label for the Open Graph property.
 * @param content The value for the Open Graph property.
 * @returns The string value of the Open Graph content property.
 */
export function parseNumber(content: string): number | undefined {
    // Copy the content to the return value.
    return content.length > 0 ? parseFloat(content.replaceAll(/[^\d\.]/g, '') || '') : undefined;
}

/**
 * This will read the first `<meta>` tag whose `property` attribute matches the value in the `propertyName` argument.
 * Per the protocol, the first tag (from top to bottom) is given preference during conflicts.
 * @param $ A `CheerioAPI` object.
 * @param propertyName The property name to find the first content value of.
 * @param onPropertyFound An optional function which provides an action for when data is located how to parse it. If omitted, performs a default copy.
 * @returns A generic content (defaults to string type) unless there isn't any, then undefined.
 */
export function parseFirstOpenGraphMetaTagContentMatching($: CheerioAPI, propertyName: string): string | undefined;
export function parseFirstOpenGraphMetaTagContentMatching<R>(
    $: CheerioAPI,
    propertyName: string,
    onPropertyFound?: OpenGraphParseHandler<R>,
): R | undefined {
    if (typeof onPropertyFound !== 'function') {
        onPropertyFound = parseString as OpenGraphParseHandler<R>;
    }
    const cssSelector = `meta[property="${propertyName}"]`;
    let queryResult = $(cssSelector);
    if (queryResult.length > 0) {
        const property = queryResult.attr('property');
        const content = queryResult.attr('content');
        do {
            if (property === propertyName && content && content?.toString() && onPropertyFound) {
                // return the first property found that matches the search label exactly
                return onPropertyFound<R>(content!);
            }
            queryResult = queryResult.next();
        } while (queryResult.length > 0);
    }
    return undefined;
}

/**
 * This will read all `<meta>` tag whose `property` attribute matches the value in the `propertyName` argument.
 * Per the protocol, the first tag (from top to bottom) is given preference during conflicts.
 * @param $ A `CheerioAPI` object.
 * @param propertyName The property name to find the all content values of.
 * @param onPropertyFound An optional function which provides an action for when data is located how to parse it. If omitted, performs a default copy.
 * @returns An array of contents unless there are none, then undefined.
 */
export function parseAllOpenGraphMetaTagContentsMatching($: CheerioAPI, propertyName: string): string[] | undefined;
export function parseAllOpenGraphMetaTagContentsMatching<R>(
    $: CheerioAPI,
    propertyName: string,
    onPropertyFound?: OpenGraphParseHandler<R>,
): R[] | undefined {
    if (typeof onPropertyFound !== 'function') {
        onPropertyFound = parseString as OpenGraphParseHandler<R>;
    }
    const cssSelector = `meta[property="${propertyName}"]`;
    let queryResult = $(cssSelector);
    if (queryResult.length > 0) {
        const returns: R[] = [];
        do {
            const property = queryResult.attr('property');
            const content = queryResult.attr('content');
            if (property === propertyName && content && content?.toString()) {
                returns.push(onPropertyFound<R>(content!));
            }
            queryResult = queryResult.next();
        } while (queryResult.length > 0);
        return returns;
    }
    return undefined;
}

/**
 * One or more Open Graph structured object attributes along with parsers.
 */
export interface StructuredObjectAttributeParserConfiguration<R> {
    ogPropertyName: string;
    mapPropertyName: string;
    onStructuredPropertyFound?: OpenGraphParseHandler<R>;
}

/**
 *
 * @param $ A `CheerioAPI` object.
 * @param propertyName The property name to find the all content values of.
 * @param defaultObjectPropertyName
 * @param onTopLevelPropertyFound An optional function which provides an action for when data is located how to parse it. If omitted, performs a default copy.
 * @param attributeHandlers
 * @returns
 */
export function parseOpenGraphStructuredObjectMatching<R1, R2 extends Dictionary<any>>(
    $: CheerioAPI,
    propertyName: string,
    defaultObjectPropertyName?: string,
    onTopLevelPropertyFound?: OpenGraphParseHandler<R1>,
    attributeHandlers?: StructuredObjectAttributeParserConfiguration<any>[],
): R1 | R2 | R1[] | R2[] | [R1 | R2] | undefined {
    if (typeof onTopLevelPropertyFound !== 'function') {
        onTopLevelPropertyFound = parseString as OpenGraphParseHandler<R1>;
    }
    const cssSelector = `meta[property^="${propertyName}"]`;
    let queryResult = $(cssSelector);
    const result: R1 | R2 | R1[] | R2[] | [R1 | R2] = [];
    if (queryResult.length > 0) {
        // let's track the most recent root element
        let mostRecentLabelRoot: Dictionary<any> | any;

        do {
            // re-read the property, it does match everything starting with og:image
            const property = queryResult.attr('property');
            const content = queryResult.attr('content') as any;

            // this is a new property root tag with a url value
            if (property === propertyName) {
                // if there was a previous image root tag, add it to the result
                if (mostRecentLabelRoot!) {
                    result.push(onTopLevelPropertyFound(mostRecentLabelRoot as never));
                }
                mostRecentLabelRoot = content;
            }
            // this is an structured metadata tag
            else {
                // if there isn't anything store yet be sure to create an empty object
                if (typeof mostRecentLabelRoot! === 'undefined') {
                    mostRecentLabelRoot = {} as Dictionary<any>;
                }
                // convert any root tags with only a default value into structures with a default field
                else if (typeof mostRecentLabelRoot !== 'object' && defaultObjectPropertyName) {
                    let newRecentLabelRoot = {} as Dictionary<any>;
                    const subPropertyName = defaultObjectPropertyName.substring(propertyName.length + 1);
                    newRecentLabelRoot[subPropertyName] = mostRecentLabelRoot;
                    mostRecentLabelRoot = newRecentLabelRoot;
                }
                if (typeof attributeHandlers !== 'undefined') {
                    for (const attributeHandler of attributeHandlers) {
                        if (property === attributeHandler.ogPropertyName) {
                            const attributeHandlerOrDefaultParseString =
                                attributeHandler.onStructuredPropertyFound ?? parseString;
                            mostRecentLabelRoot[attributeHandler.mapPropertyName] =
                                attributeHandlerOrDefaultParseString(content as any) as any;
                            break; // break out of the inner loop, continuing with the outer loop
                        }
                    }
                } else if (property?.indexOf(`${propertyName}:`) != -1) {
                    // if you didn't provide attribute handlers, then we'll just go ahead and assume you wanted them anyways and use defaultCopyOnRead
                    // to handle the parsing
                    mostRecentLabelRoot[property!.substring(propertyName.length + 1)] = parseString(
                        content as any,
                    ) as any;
                }
            }
            // read the next result
            queryResult = queryResult.next();

            // loop until there are no more results
        } while (queryResult.length > 0);

        // if there was a previous image root tag, add it to the result
        if (mostRecentLabelRoot!) {
            result.push(mostRecentLabelRoot as never);
        }
    }
    return result.length ? ((result.length > 1 ? result : result[0]) as R1 | R2 | R1[] | R2[] | [R1 | R2]) : undefined;
}

export function parseOpenGraphMetadata($: CheerioAPI): OpenGraphMetadata {
    return {
        url: parseFirstOpenGraphMetaTagContentMatching($, 'og:url'),
        type: parseFirstOpenGraphMetaTagContentMatching($, 'og:type'),
        title: parseFirstOpenGraphMetaTagContentMatching($, 'og:title'),
        locale: parseFirstOpenGraphMetaTagContentMatching($, 'og:locale'),
        localeAlternate: parseAllOpenGraphMetaTagContentsMatching($, 'og:locale:alternate'),
        image: parseOpenGraphStructuredObjectMatching<string, OpenGraphImageMetadata>(
            $,
            'og:image',
            'og:image:url',
            parseString as OpenGraphParseHandler<string>,
            [
                {
                    ogPropertyName: 'og:image:secure_url',
                    mapPropertyName: 'secureUrl',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:image:type',
                    mapPropertyName: 'type',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:image:width',
                    mapPropertyName: 'width',
                    onStructuredPropertyFound: parseNumber as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:image:height',
                    mapPropertyName: 'height',
                    onStructuredPropertyFound: parseNumber as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:image:alt',
                    mapPropertyName: 'alt',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
            ],
        ),
        video: parseOpenGraphStructuredObjectMatching<string, OpenGraphImageMetadata>(
            $,
            'og:video',
            'og:video:url',
            parseString as OpenGraphParseHandler<string>,
            [
                {
                    ogPropertyName: 'og:video:secure_url',
                    mapPropertyName: 'secureUrl',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:video:type',
                    mapPropertyName: 'type',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:video:width',
                    mapPropertyName: 'width',
                    onStructuredPropertyFound: parseNumber as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:video:height',
                    mapPropertyName: 'height',
                    onStructuredPropertyFound: parseNumber as OpenGraphParseHandler<string>,
                },
            ],
        ),
        audio: parseOpenGraphStructuredObjectMatching<string, OpenGraphImageMetadata>(
            $,
            'og:audio',
            'og:audio:url',
            parseString as OpenGraphParseHandler<string>,
            [
                {
                    ogPropertyName: 'og:audio:secure_url',
                    mapPropertyName: 'secureUrl',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:audio:type',
                    mapPropertyName: 'type',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:audio:title',
                    mapPropertyName: 'title',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:audio:artist',
                    mapPropertyName: 'artist',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
                {
                    ogPropertyName: 'og:audio:album',
                    mapPropertyName: 'album',
                    onStructuredPropertyFound: parseString as OpenGraphParseHandler<string>,
                },
            ],
        ),
        description: parseFirstOpenGraphMetaTagContentMatching($, 'og:description'),
        siteName: parseFirstOpenGraphMetaTagContentMatching($, 'og:site_name'),
        determiner: parseFirstOpenGraphMetaTagContentMatching($, 'og:determiner'),
        geo: parseOpenGraphStructuredObjectMatching<any, OpenGraphGeoMetadata>($, 'og:geo', '', undefined, [
            {
                ogPropertyName: 'og:geo:lat',
                mapPropertyName: 'latitude',
                onStructuredPropertyFound: parseNumber as OpenGraphParseHandler<string>,
            },
            {
                ogPropertyName: 'og:geo:long',
                mapPropertyName: 'longitude',
                onStructuredPropertyFound: parseNumber as OpenGraphParseHandler<string>,
            },
        ]),
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
        basicMetaData,
    );
    return ogrDict;
}
