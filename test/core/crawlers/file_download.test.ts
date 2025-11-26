import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Duplex, finished, pipeline as pipelineWithCallbacks, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import { setTimeout } from 'node:timers/promises';

import { FileDownload } from '@crawlee/http';
import express from 'express';
import { startExpressAppPromise } from 'test/shared/_helper.js';
import { afterAll, beforeAll, expect, test } from 'vitest';

class ReadableStreamGenerator {
    private static async generateRandomData(size: number, seed: number): Promise<Uint8Array> {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const array = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            // eslint-disable-next-line no-bitwise
            seed = Math.imul(48271, seed) | (0 % 2147483647);
            array[i] = chars.charCodeAt(seed % chars.length);
        }
        return array;
    }

    static getReadableStream(size: number, seed: number, throttle = 0): ReadableStream {
        let bytesRead = 0;
        const stream = new ReadableStream({
            start: async (controller) => {
                while (bytesRead < size) {
                    const chunkSize = Math.min(size - bytesRead, 1024);
                    const chunk = await this.generateRandomData(chunkSize, seed);
                    bytesRead += chunk.length;
                    controller.enqueue(chunk);

                    if (throttle > 0) {
                        await setTimeout(throttle);
                    }
                }
                controller.close();
            },
        });

        return stream;
    }

    static async getUint8Array(size: number, seed: number) {
        const stream = this.getReadableStream(size, seed);
        const chunks: Uint8Array = new Uint8Array(size);
        let offset = 0;
        for await (const chunk of stream) {
            chunks.set(chunk, offset);
            offset += chunk.length;
        }
        return chunks;
    }
}

let url = 'http://localhost';
let server: Server;
beforeAll(async () => {
    const app = express();

    app.get('/file', async (req, res) => {
        const reqUrl = new URL(req.url, 'http://localhost');

        const size = Number(reqUrl.searchParams.get('size') ?? 1024);
        const seed = Number(reqUrl.searchParams.get('seed') ?? 123);
        const throttle = Number(reqUrl.searchParams.get('throttle') ?? 0);

        const stream = ReadableStreamGenerator.getReadableStream(size, seed, throttle);

        res.setHeader('content-type', 'application/octet-stream');
        await pipeline(stream, res);

        res.end();
    });

    server = await startExpressAppPromise(app, 0);
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    server.close();
});

test('requestHandler - reading bytes synchronously', async () => {
    const results: Uint8Array[] = [];

    const crawler = new FileDownload({
        maxRequestRetries: 0,
        requestHandler: async ({ response }) => {
            results.push(await response.bytes());
        },
    });

    const fileUrl = new URL('/file?size=1024&seed=123', url).toString();

    await crawler.run([fileUrl]);

    expect(results).toHaveLength(1);
    expect(results[0].length).toBe(1024);
    expect(results[0]).toEqual(await ReadableStreamGenerator.getUint8Array(1024, 123));
});

test('requestHandler - streaming response body', async () => {
    let result: Uint8Array = new Uint8Array();

    const crawler = new FileDownload({
        maxRequestRetries: 0,
        requestHandler: async ({ response }) => {
            for await (const chunk of response.body as any) {
                result = new Uint8Array([...result, ...chunk]);
            }
        },
    });

    const fileUrl = new URL('/file?size=1024&seed=456', url).toString();

    await crawler.run([fileUrl]);

    expect(result.length).toBe(1024);
    expect(result).toEqual(await ReadableStreamGenerator.getUint8Array(1024, 456));
});

test('requestHandler receives response', async () => {
    const crawler = new FileDownload({
        maxRequestRetries: 0,
        requestHandler: async ({ response }) => {
            expect(response?.headers.get('content-type')).toBe('application/octet-stream');
            expect(response?.status).toBe(200);
            expect(response?.statusText).toBe('OK');
        },
    });

    const fileUrl = new URL('/file?size=1024&seed=456', url).toString();

    await crawler.run([fileUrl]);
});

test('crawler waits for the stream to be consumed', async () => {
    const bufferingStream = new Duplex({
        read() {},
        write(chunk, _encoding, callback) {
            this.push(chunk);
            callback();
        },
    });

    const crawler = new FileDownload({
        maxRequestRetries: 0,
        requestHandler: async ({ response }) => {
            pipelineWithCallbacks(response.body as any, bufferingStream, (err) => {
                if (!err) {
                    bufferingStream.push(null);
                    bufferingStream.end();
                } else {
                    bufferingStream.destroy(err);
                }
            });
        },
    });

    // waits for a second after every kilobyte sent.
    const fileUrl = new URL(`/file?size=${5 * 1024}&seed=789&throttle=1000`, url).toString();
    await crawler.run([fileUrl]);

    // the stream should be finished once the crawler finishes.
    expect(bufferingStream.writableFinished).toBe(true);

    const bufferedData = new Uint8Array(5 * 1024);
    let offset = 0;
    for await (const chunk of bufferingStream) {
        bufferedData.set(chunk, offset);
        offset += chunk.length;
    }

    expect(bufferedData.length).toBe(5 * 1024);
    expect(bufferedData).toEqual(await ReadableStreamGenerator.getUint8Array(5 * 1024, 789));
});
