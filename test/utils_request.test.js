import express from 'express';
import {
    requestAsBrowser,
    FIREFOX_MOBILE_USER_AGENT,
    FIREFOX_DESKTOP_USER_AGENT,
} from '../build/utils_request';
import { startExpressAppPromise } from './_helper';

const CONTENT = 'CONTENT';
const HOST = '127.0.0.1';

describe('Apify.utils_request', () => {
    let port;
    let server;
    beforeAll(async () => {
        const app = express();

        app.get('/406', (req, res) => {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.status(406);
            res.send(CONTENT);
        });

        app.get('/echo', (req, res) => {
            res.send(JSON.stringify(req.headers));
        });

        app.get('/rawHeaders', (req, res) => {
            res.send(JSON.stringify(req.rawHeaders));
        });

        app.get('/invalidContentType', (req, res) => {
            res.setHeader('content-type', 'application/json');
            res.send(CONTENT);
        });

        app.get('/invalidContentHeader', (req, res) => {
            res.setHeader('Content-Type', 'non-existent-content-type');
            res.send(CONTENT);
        });

        app.get('/invalidBody', async (req, res) => {
            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(Buffer.from(CONTENT, 'utf8'));
        });

        app.get('/empty', async (req, res) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send();
        });

        app.get('/invalidHeaderChar', (req) => {
            const headers = {
                'Invalid Header With Space': 'some\value',
                'X-Normal-Header': 'HeaderValue2',
            };

            let msg = 'HTTP/1.1 200 OK\r\n';
            Object.entries(headers).forEach(([key, value]) => {
                msg += `${key}: ${value}\r\n`;
            });
            msg += `\r\n${CONTENT}`;

            req.socket.write(msg, () => {
                req.socket.end();

                // Unfortunately calling end() will not close the socket
                // if client refuses to close it. Hence calling destroy after a short while.
                setTimeout(() => {
                    req.socket.destroy();
                }, 100);
            });
        });

        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
    });

    afterAll(() => {
        server.close();
    });

    describe('Apify.requestAsBrowser', () => {
        test(
            'it uses mobile user-agent when mobile property is set to true ',
            async () => {
                const data = {
                    url: `http://${HOST}:${port}/echo`,
                    useMobileVersion: true,
                };
                const response = await requestAsBrowser(data);
                expect(response.statusCode).toBe(200);
                expect(JSON.parse(response.body)['user-agent']).toEqual(FIREFOX_MOBILE_USER_AGENT);
            },
        );

        test('uses desktop user-agent by default ', async () => {
            const data = {
                url: `http://${HOST}:${port}/echo`,
            };
            const response = await requestAsBrowser(data);
            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body)['user-agent']).toEqual(FIREFOX_DESKTOP_USER_AGENT);
        });

        test('sets correct hosts', async () => {
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/echo`,
            };

            const response = await requestAsBrowser(options);

            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body).host).toEqual(host);
        });

        test('uses correct default language', async () => {
            const languageCode = 'en';
            const countryCode = 'US';
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/echo`,
            };

            const response = await requestAsBrowser(options);

            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body)['accept-language']).toEqual(`${languageCode}-${countryCode},${languageCode};q=0.5`);
        });

        test('does not throw for empty response body', async () => {
            const options = {
                url: `http://${HOST}:${port}/empty`,
            };
            let error;
            try {
                await requestAsBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).toBeFalsy(); //eslint-disable-line
        });

        test('overrides defaults', async () => {
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/echo`,
                headers: {
                    'User-Agent': 'chrome',
                },
            };

            const response = await requestAsBrowser(options);

            expect(response.statusCode).toBe(200);
            expect(JSON.parse(response.body)['user-agent']).toEqual(options.headers['User-Agent']);
        });

        test('headers has same format as in firefox', async () => {
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/rawHeaders`,
            };

            const response = await requestAsBrowser(options);
            const headersArray = JSON.parse(response.body);
            expect(response.statusCode).toBe(200);


            expect(headersArray[0]).toBe('Host');
            expect(headersArray[1]).toEqual(host);
            expect(headersArray[2]).toBe('User-Agent');
            expect(headersArray[3]).toEqual(FIREFOX_DESKTOP_USER_AGENT);
            expect(headersArray[4]).toBe('Accept');
            expect(headersArray[5]).toBe('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
            expect(headersArray[6]).toBe('Accept-Language');
            expect(headersArray[7]).toBe('en-US,en;q=0.5');
            expect(headersArray[8]).toBe('Accept-Encoding');
            expect(headersArray[9]).toBe('gzip, deflate, br');
            expect(headersArray[10]).toBe('Connection');
            expect(headersArray[11]).toBe('keep-alive');
        });

        test('custom headers in lowercase override uppercase defaults', async () => {
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/rawHeaders`,
                headers: {
                    accept: 'foo',
                    bar: 'BAZ',
                },
            };

            const response = await requestAsBrowser(options);
            const headersArray = JSON.parse(response.body);
            expect(response.statusCode).toBe(200);
            expect(headersArray[4]).toBe('Accept');
            expect(headersArray[5]).toBe('foo');
            expect(headersArray[12]).toBe('bar');
            expect(headersArray[13]).toBe('BAZ');
        });

        test('correctly handles invalid header characters', async () => {
            const url = `http://${HOST}:${port}/invalidHeaderChar`;

            const response = await requestAsBrowser({ url });
            expect(response.body).toBe(CONTENT);
            expect(response.headers).toEqual({
                'invalid header with space': 'some\value',
                'x-normal-header': 'HeaderValue2',
            });
            try {
                await requestAsBrowser({
                    useInsecureHttpParser: false,
                    url,
                });
            } catch (err) {
                if (process.version.startsWith('v10')) {
                    expect(err.message).toMatch('Parse Error');
                } else {
                    expect(err.message).toMatch('Parse Error: Invalid header value char');
                }
            }
        });
    });
});
