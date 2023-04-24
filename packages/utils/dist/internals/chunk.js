"use strict";
/*
The MIT License (MIT)

Copyright © `2020` `The Sapphire Community and its contributors`

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the “Software”), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunk = void 0;
function chunk(array, chunkSize) {
    if (!Array.isArray(array))
        throw new TypeError('entries must be an array.');
    if (!Number.isInteger(chunkSize))
        throw new TypeError('chunkSize must be an integer.');
    if (chunkSize < 1)
        throw new RangeError('chunkSize must be 1 or greater.');
    const clone = array.slice();
    const chunks = [];
    while (clone.length)
        chunks.push(clone.splice(0, chunkSize));
    return chunks;
}
exports.chunk = chunk;
//# sourceMappingURL=chunk.js.map