import { expect } from 'chai';
import express from 'express';
import { compress } from 'iltorb';
import { requestAsBrowser, REQUEST_AS_BROWSER_DEFAULT_OPTIONS } from '../build/utils_request';
import { startExpressAppPromise } from './_helper';

const CONTENT = 'CONTENT';
const HOST = '127.0.0.1';
const ERROR_BODY = 'CUSTOM_ERROR';

describe('Apify.utils_request', () => {
    let mochaListener;
    let port;
    let server;
    before(async () => {
        mochaListener = process.listeners('uncaughtException').shift();
        process.removeListener('uncaughtException', mochaListener);
        const app = express();

        app.get('/406', (req, res) => {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.status(406);
            res.send(CONTENT);
        });

        app.get('/echo', (req, res) => {
            res.send(JSON.stringify(req.headers));
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

    describe('Apify.requestAsBrowser', async () => {
        it('it uses mobile user-agent whe mobile property is set to true ', async () => {
            const data = {
                url: `http://${HOST}:${port}/echo`,
                useMobileVersion: true,
            };
            const response = await requestAsBrowser(data);
            expect(response.statusCode).to.eql(200);
            expect(JSON.parse(response.body)['user-agent']).to.be.eql('Mozilla/5.0 (Android 9.0; Mobile; rv:66.0) Gecko/66.0 Firefox/66.0');
        });

        it('uses desktop user-agent by default ', async () => {
            const data = {
                url: `http://${HOST}:${port}/echo`,
            };
            const response = await requestAsBrowser(data);
            expect(response.statusCode).to.eql(200);
            expect(JSON.parse(response.body)['user-agent'])
                .to
                .be
                .eql('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.1 Safari/605.1.15');
        });

        it('sets correct hosts', async () => {
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/echo`,
            };

            const response = await requestAsBrowser(options);

            expect(response.statusCode).to.eql(200);
            expect(JSON.parse(response.body).host).to.be.eql(host);
        });

        it('uses correct default language', async () => {
            const { languageCode, countryCode } = REQUEST_AS_BROWSER_DEFAULT_OPTIONS;
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/echo`,
            };

            const response = await requestAsBrowser(options);

            expect(response.statusCode).to.eql(200);
            expect(JSON.parse(response.body)['accept-language']).to.be.eql(`${languageCode}-${countryCode},${languageCode};q=0.5`);
        });

        it('throws error for 406', async () => {
            const options = {
                url: `http://${HOST}:${port}/406`,
            };
            let error;
            try {
                await requestAsBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).to.exist; //eslint-disable-line
            expect(error.message).to.eql(`Request for ${options.url} aborted due to abortFunction`);
        });

        it('does not throw for empty response body', async () => {
            const options = {
                url: `http://${HOST}:${port}/empty`,
            };
            let error;
            try {
                await requestAsBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).to.not.exist; //eslint-disable-line
        });

        it('throws for other contentType then - text/html', async () => {
            const options = {
                url: `http://${HOST}:${port}/invalidContentType`,
            };
            let error;
            try {
                await requestAsBrowser(options);
            } catch (e) {
                error = e;
            }

            expect(error).to.exist; //eslint-disable-line
            expect(error.message).to.eql(`Request for ${options.url} aborted due to abortFunction`);
        });

        it('overrides defaults', async () => {
            const host = `${HOST}:${port}`;
            const options = {
                url: `http://${host}/echo`,
                headers: {
                    'User-Agent': 'chrome',
                },
            };

            const response = await requestAsBrowser(options);

            expect(response.statusCode).to.eql(200);
            expect(JSON.parse(response.body)['user-agent']).to.be.eql(options.headers['User-Agent']);
        });

        it('overrides defaults', async () => {
            const options = {
                url: 'https://www.ebay.com/sch/sis.html?_nkw=Beechcraft',
            };

            const response = await requestAsBrowser(options);

            console.log(response);
        });
    });
});
