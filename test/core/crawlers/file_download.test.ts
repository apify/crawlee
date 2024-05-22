import type { Server } from 'http';
import type { AddressInfo } from 'node:net';
import { Duplex } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import { setTimeout } from 'node:timers/promises';

import { Configuration, FileDownload } from '@crawlee/http';
import express from 'express';
import { startExpressAppPromise } from 'test/shared/_helper';

class ReadableStreamGenerator {
    private static async generateRandomData(size: number, seed: number) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const buffer = Buffer.alloc(size);
        for (let i = 0; i < size; i++) {
            // eslint-disable-next-line no-bitwise
            seed = Math.imul(48271, seed) | (0 % 2147483647);
            buffer[i] = chars.charCodeAt(seed % chars.length);
        }
        return buffer;
    }

    static getReadableStream(size: number, seed: number, throttle: number = 0): ReadableStream {
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

    static async getBuffer(size: number, seed: number) {
        const stream = this.getReadableStream(size, seed);
        const chunks: string[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.from(chunks.join(''));
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

test('requestHandler works', async () => {
    const results: Buffer[] = [];

    const crawler = new FileDownload({
        maxRequestRetries: 0,
        requestHandler: ({ body }) => {
            results.push(body as Buffer);
        },
    });

    const fileUrl = new URL('/file?size=1024&seed=123', url).toString();

    await crawler.run([fileUrl]);

    expect(results).toHaveLength(1);
    expect(results[0].length).toBe(1024);
    expect(results[0]).toEqual(await ReadableStreamGenerator.getBuffer(1024, 123));
});

test('streamHandler works', async () => {
    let result: Buffer = Buffer.alloc(0);

    const crawler = new FileDownload({
        maxRequestRetries: 0,
        streamHandler: async ({ stream }) => {
            for await (const chunk of stream as ReadableStream<any>) {
                result = Buffer.concat([result, chunk]);
            }
        },
    });

    const fileUrl = new URL('/file?size=1024&seed=456', url).toString();

    await crawler.run([fileUrl]);

    expect(result.length).toBe(1024);
    expect(result).toEqual(await ReadableStreamGenerator.getBuffer(1024, 456));
});

test('crawler with streamHandler waits for the stream to finish', async () => {
    const bufferingStream = new Duplex({
        read() {},
        write(chunk, encoding, callback) {
            this.push(chunk);
            callback();
        },
    });

    const crawler = new FileDownload({
        maxRequestRetries: 0,
        streamHandler: ({ stream }) => {
            pipeline(stream as any, bufferingStream)
                .then(() => {
                    bufferingStream.push(null);
                    bufferingStream.end();
                })
                .catch((e) => {
                    bufferingStream.destroy(e);
                });
        },
    });

    // waits for a second after every kilobyte sent.
    const fileUrl = new URL(`/file?size=${5 * 1024}&seed=789&throttle=1000`, url).toString();
    await crawler.run([fileUrl]);

    // the stream should be finished once the crawler finishes.
    expect(bufferingStream.writableFinished).toBe(true);

    const bufferedData: Buffer[] = [];
    for await (const chunk of bufferingStream) {
        bufferedData.push(chunk);
    }
    const result = Buffer.concat(bufferedData);

    expect(result.length).toBe(5 * 1024);
    expect(result).toEqual(await ReadableStreamGenerator.getBuffer(5 * 1024, 789));
});
