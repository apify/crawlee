import { expect } from 'chai';
import zlib from 'zlib';
import express from 'express';
import { compress } from 'iltorb';
import { requestBetter, requestLikeBrowser } from '../build/utils_request';
import { startExpressAppPromise } from './_helper';

const CONTENT = 'CONTENT';
const HOST = '127.0.0.1';
const ERROR_BODY = 'CUSTOM_ERROR';
const JSON_BODY = {
    message: ERROR_BODY,
};

describe('Apify.utils_request', () => {
    let port;
    let server;
    before(async () => {
        const app = express();

        app.get('/406', (req, res) => {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.status(406);
            res.send('CONTENT');
        });

        app.get('/invalidContentType', (req, res) => {
            res.setHeader('content-type', 'application/json');
            res.send('CONTENT');
        });

        app.get('/gzip', (req, res) => {
            zlib.gzip(CONTENT, (error, result) => {
                if (error) throw error;
                res.setHeader('content-encoding', 'gzip');
                res.send(result);
            });
        });

        app.get('/deflate', (req, res) => {
            // return zlib.compress(CONTENT);
            zlib.deflate(CONTENT, (error, result) => {
                if (error) throw error;
                res.setHeader('content-encoding', 'deflate');
                res.send(result);
            });
        });

        app.get('/brotli', async (req, res) => {
            // return zlib.compress(CONTENT);
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'br');
            res.send(compressed);
        });

        app.get('/500', (req, res) => {
            res.status(500);
            res.send(ERROR_BODY);
        });

        app.get('/500/invalidBody', async (req, res) => {
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(compressed);
        });

        app.get('/500/json', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.status(500);
            res.send(JSON.stringify(JSON_BODY));
        });

        app.get('/invalidContentHeader', (req, res) => {
            res.setHeader('Content-Type', 'non-existent-content-type');
            res.send(CONTENT);
        });

        app.get('/invalidBody', async (req, res) => {
            const compressed = await compress(Buffer.from(CONTENT, 'utf8'));

            res.setHeader('content-encoding', 'deflate');
            res.status(500);
            res.send(compressed);
        });

        app.get('/empty', async (req, res) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send();
        });

        server = await startExpressAppPromise(app, 0);
        port = server.address().port; //eslint-disable-line
    });

    after(() => {
        server.close();
    });

    describe('Apify.requestBetter', async () => {
        it('works', async () => {
            const data = {
                url: 'https://api.apify.com/v2/browser-info',
            };
            const response = await requestBetter(data);
            expect(response.statusCode)
                .to
                .eql(200);
            expect(response.request.headers).to.be.empty; // eslint-disable-line no-unused-expressions
        });

        it('passes response to abortFunction and aborts request', async () => {
            let constructorName;
            let aborted = false;
            const data = {
                url: `http://${HOST}:${port}/empty`,
                abortFunction: (response) => {
                    constructorName = response.constructor.name;
                    response.request.on('abort', () => {
                        aborted = true;
                    });
                    return true;
                },

            };
            await requestBetter(data);
            expect(constructorName).to.be.eql('IncomingMessage');
            expect(aborted).to.be.eql(true);
        });

        it('it does not aborts request when aborts function returns false', async () => {
            let aborted = false;
            const data = {
                url: `http://${HOST}:${port}/gzip`,
                abortFunction: (response) => {
                    response.on('aborted', () => {
                        aborted = true;
                    });
                    return false;
                },

            };
            await requestBetter(data);
            expect(aborted).to.be.eql(false);
        });

        it('decompress gzip', async () => {
            const options = {
                url: `http://${HOST}:${port}/gzip`,

            };

            const response = await requestBetter(options);
            expect(response.body)
                .to
                .eql(CONTENT);
        });

        it('decompress deflate', async () => {
            const options = {
                url: `http://${HOST}:${port}/deflate`,

            };

            const response = await requestBetter(options);
            expect(response.body)
                .to
                .eql(CONTENT);
        });

        it('decompress brotli', async () => {
            const options = {
                url: `http://${HOST}:${port}/brotli`,

            };

            const response = await requestBetter(options);
            expect(response.body).to.eql(CONTENT);
        });

        it('it does not throw error for 400+ error codes when throwOnHttpError is false', async () => {
            const options = {
                url: `http://${HOST}:${port}/500`,

            };
            let error;
            try {
                await requestBetter(options);
            } catch (e) {
                error = e;
            }
            expect(error).to.be.undefined; // eslint-disable-line
        });

        it('it does not throw error for 400+ error codes when throwOnHttpError is true', async () => {
            const options = {
                url: `http://${HOST}:${port}/500`,
                throwOnHttpError: true,

            };
            let error;
            try {
                await requestBetter(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
            expect(error.message.includes(ERROR_BODY)).to.be.eql(true);
        });

        it('it throws error when the body cannot be parsed and the code is 500 when throwOnHttpError is true', async () => {
            const options = {
                url: `http://${HOST}:${port}/500/invalidBody`,
                throwOnHttpError: true,

            };
            let error;
            try {
                await requestBetter(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
        });

        it('it throws error when the body cannot be parsed', async () => {
            const options = {
                url: `http://${HOST}:${port}/invalidBody`,

            };
            let error;
            try {
                await requestBetter(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
        });

        it('it returns json when 500 even if content-type is different, throwOnHttpError is true ', async () => {
            const options = {
                url: `http://${HOST}:${port}/500/json`,
                throwOnHttpError: true,

            };
            let error;
            try {
                await requestBetter(options);
            } catch (e) {
                error = e;
            }
            expect(error.message).to.exist; // eslint-disable-line
            expect(error.message.includes(JSON_BODY.message)).to.be.eql(true);
        });
    });

    describe('Apify.requestAsBrowser', async () => {
        it('passes crunchbase.com non browser request blocking', async () => {
            const data = {
                url: 'https://www.crunchbase.com/',
                html: true,
            };
            const { response } = await requestLikeBrowser(data);
            expect(response.statusCode).to.eql(200);
        });

        it('it uses mobile user-agent whe mobile property is set to true ', async () => {
            const data = {
                url: 'https://www.crunchbase.com/',
                html: true,
                useMobileVersion: true,
            };
            const { response } = await requestLikeBrowser(data);
            expect(response.statusCode).to.eql(200);
            expect(response.request.headers['User-Agent']).to.be.eql('Mozilla/5.0 (Android 9.0; Mobile; rv:66.0) Gecko/66.0 Firefox/66.0');
        });

        it('it uses desktop user-agent by default ', async () => {
            const data = {
                url: 'https://www.crunchbase.com/',
                html: true,
            };
            const { response } = await requestLikeBrowser(data);
            expect(response.statusCode).to.eql(200);
            expect(response.request.headers['User-Agent'])
                .to
                .be
                .eql('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.1 Safari/605.1.15');
        });

        it('it sets correct hosts', async () => {
            const host = 'www.crunchbase.com';
            const options = {
                url: `https://${host}`,
            };

            const { response } = await requestLikeBrowser(options);

            expect(response.statusCode).to.eql(200);
            expect(response.request.headers.Host).to.be.eql(host);
        });

        it('it uses correct default language', async () => {
            const host = 'www.crunchbase.com';
            const options = {
                url: `https://${host}`,
            };

            const { response } = await requestLikeBrowser(options);

            expect(response.statusCode).to.eql(200);
            expect(response.request.headers.Host).to.be.eql(host);
        });

        it('it throws error for 406', async () => {
            const options = {
                url: `http://${HOST}:${port}/406`,
            };
            let error;
            try {
                await requestLikeBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).to.exist; //eslint-disable-line
            expect(error.message).to.eql(`requestLikeBrowser: Resource ${options.url} is not available in HTML format. Skipping resource.`);
        });

        it('it throws for empty response body', async () => {
            const options = {
                url: `http://${HOST}:${port}/empty`,
            };
            let error;
            try {
                await requestLikeBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).to.exist; //eslint-disable-line
            expect(error.message).to.eql('The response body is empty');
        });

        it('it throws for other contentType then - text/html', async () => {
            const options = {
                url: `http://${HOST}:${port}/invalidContentType`,
            };
            let error;
            try {
                await requestLikeBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).to.exist; //eslint-disable-line
            expect(error.message.includes('Received unexpected Content-Type:')).to.eql(true);
        });
    });
});
