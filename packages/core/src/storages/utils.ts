import type { StorageClient } from '@crawlee/types';
import { Configuration } from '../configuration';

/**
 * Cleans up the local storage folder (defaults to `./storage`) created when running code locally.
 * Purging will remove all the files in all storages except for INPUT.json in the default KV store.
 *
 * Purging of storages is happening automatically when we run our crawler (or when we open some storage
 * explicitly, e.g. via `RequestList.open()`). We can disable that via `purgeOnStart` {@apilink Configuration}
 * option or by setting `CRAWLEE_PURGE_ON_START` environment variable to `0` or `false`.
 *
 * This is a shortcut for running (optional) `purge` method on the StorageClient interface, in other words
 * it will call the `purge` method of the underlying storage implementation we are currently using. In addition,
 * this method will make sure the storage is purged only once for a given execution context, so it is safe to call
 * it multiple times.
 */
export async function purgeDefaultStorages(config = Configuration.getGlobalConfig()) {
    const client = config.getStorageClient() as StorageClient & { __purged?: boolean };

    if (config.get('purgeOnStart') && !client.__purged) {
        client.__purged = true;
        await client.purge?.();
    }
}

// https://github.com/sindresorhus/strip-json-comments/blob/ad70a18c06f5a3c93f02f855489d1c0f900f43d3/index.js
export function stripJsonComments(jsonString: string, { whitespace = true } = {}) {
    /*
    MIT License

    Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
    to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
    and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
    */
    const singleComment = Symbol('singleComment');
    const multiComment = Symbol('multiComment');

    const stripWithoutWhitespace = () => '';
    const stripWithWhitespace = (string: string, start?: number, end?: number) => string.slice(start, end).replace(/\S/g, ' ');

    const isEscaped = (string: string, quotePosition: number) => {
        let index = quotePosition - 1;
        let backslashCount = 0;

        while (string[index] === '\\') {
            index -= 1;
            backslashCount += 1;
        }

        return Boolean(backslashCount % 2);
    };

    if (typeof jsonString !== 'string') {
        throw new TypeError(`Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``);
    }

    const strip = whitespace ? stripWithWhitespace : stripWithoutWhitespace;

    let isInsideString = false;
    let isInsideComment: typeof singleComment | typeof multiComment | false = false;
    let offset = 0;
    let result = '';

    for (let index = 0; index < jsonString.length; index++) {
        const currentCharacter = jsonString[index];
        const nextCharacter = jsonString[index + 1];

        if (!isInsideComment && currentCharacter === '"') {
            const escaped = isEscaped(jsonString, index);
            if (!escaped) {
                isInsideString = !isInsideString;
            }
        }

        if (isInsideString) {
            continue;
        }

        if (!isInsideComment && currentCharacter + nextCharacter === '//') {
            result += jsonString.slice(offset, index);
            offset = index;
            isInsideComment = singleComment;
            index++;
        } else if (isInsideComment === singleComment && currentCharacter + nextCharacter === '\r\n') {
            index++;
            isInsideComment = false;
            result += strip(jsonString, offset, index);
            offset = index;
            continue;
        } else if (isInsideComment === singleComment && currentCharacter === '\n') {
            isInsideComment = false;
            result += strip(jsonString, offset, index);
            offset = index;
        } else if (!isInsideComment && currentCharacter + nextCharacter === '/*') {
            result += jsonString.slice(offset, index);
            offset = index;
            isInsideComment = multiComment;
            index++;
            continue;
        } else if (isInsideComment === multiComment && currentCharacter + nextCharacter === '*/') {
            index++;
            isInsideComment = false;
            result += strip(jsonString, offset, index + 1);
            offset = index + 1;
            continue;
        }
    }

    return result + (isInsideComment ? strip(jsonString.slice(offset)) : jsonString.slice(offset));
}
