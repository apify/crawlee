import fs from 'fs';
import type { Server } from 'http';
import path from 'path';
import { setTimeout } from 'timers/promises';

import bodyParser from 'body-parser';
import { entries } from 'crawlee';
import express from 'express';
import type { Application } from 'express';

export const startExpressAppPromise = async (app: Application, port: number) => {
    return new Promise<Server>((resolve) => {
        const server = app.listen(port, () => resolve(server));
    });
};

export const responseSamples = {
    json: { foo: 'bar' },
    xml:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<items>\n' +
        '<item>\n' +
        '    <url>https://apify.com</url>\n' +
        '    <title>Web Scraping, Data Extraction and Automation &#xb7; Apify</title>\n' +
        '</item>\n' +
        '</items>',
    complexXml: fs.readFileSync(path.join(__dirname, 'data/complex.xml'), 'utf-8'),
    image: fs.readFileSync(path.join(__dirname, 'data/apify.png')),
    html: `<!doctype html>
    <html>
    <head>
        <title>Example Domain</title>
        <meta charset="utf-8">
        <meta http-equiv="Content-type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style type="text/css">
        body {
            background-color: #f0f0f2;
            margin: 0;
            padding: 0;
            font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;

        }
        div {
            width: 600px;
            margin: 5em auto;
            padding: 2em;
            background-color: #fdfdff;
            border-radius: 0.5em;
            box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);
        }
        a:link, a:visited {
            color: #38488f;
            text-decoration: none;
        }
        @media (max-width: 700px) {
            div {
                margin: 0 auto;
                width: auto;
            }
        }
        </style>
    </head>

    <body>
    <div>
        <h1>Example Domain</h1>
        <p>This domain is for use in illustrative examples in documents. You may use this
        domain in literature without prior coordination or asking for permission.</p>
        <p><a href="https://www.iana.org/domains/example">More information...</a></p>
    </div>
    </body>
    </html>`,
    resources: `
    <html><body>
            <link rel="stylesheet" type="text/css" href="/style.css">
            <img src="/image.png">
            <img src="/image.gif">
            <script src="/script.js" defer="defer"></script>
        </body></html>`,
    cacheable: {
        html: `
<!doctype html>
    <html>
    <head>
        <title>Cacheable example website</title>
        <meta charset="utf-8">
        <meta http-equiv="Content-type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="cacheable/style.css">
        <script src="cacheable/script.js"></script>
    </body>
    </html>
`,
        css: `
body {
    background-color: #f0f0f2;
    margin: 0;
    padding: 0;
    font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
`,
        js: `
console.log('Hello world!');
`,
    },
    htmlWithOutsideRedirect: `
<html>
    <head>
        <title>Redirecting outside</title>
    </head>
    <body>
        <a href="/special/redirect-outside">click me</a>
    </body>
</html>`,
    cloudflareBlocking: `
<!DOCTYPE html>
<head>
    <title>Just a moment...</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=Edge">
    <meta name="robots" content="noindex,nofollow">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link href="/cdn-cgi/styles/challenges.css" rel="stylesheet">
    <meta http-equiv="refresh" content="375">
    <script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=837fec16d9534138"></script><script src="https://challenges.cloudflare.com/turnstile/v0/g/74bd6362/api.js?onload=AudPIu1&amp;render=explicit" async="" defer="" crossorigin="anonymous"></script>
</head>
<body class="no-js">
    <div class="main-wrapper" role="main">
        <div class="main-content">
            <h1 class="zone-name-title h1">dummypage.co</h1>
            <h2 id="challenge-running" class="h2">Checking if the site connection is secure</h2>
            <div id="challenge-stage" style="display: flex;">
                <div id="turnstile-wrapper" class="captcha-prompt spacer">
                    <div><iframe style="border: medium; overflow: hidden; width: 300px; height: 65px;" src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/if/ov2/av0/rcv0/0/o9un1/0x4AAAAAAADnPIDROrmt1Wwj/dark/normal" allow="cross-origin-isolated; fullscreen" sandbox="allow-same-origin allow-scripts allow-popups" id="cf-chl-widget-o9un1" tabindex="0" title="Widget containing a Cloudflare security challenge"></iframe><input type="hidden" name="cf-turnstile-response" id="cf-chl-widget-o9un1_response"></div>
                </div>
            </div>
            <div id="challenge-spinner" class="spacer loading-spinner" style="display: none; visibility: hidden;">
                <div class="lds-ring">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>
            <div id="challenge-body-text" class="core-msg spacer">dummypage.co needs to review the security of your connection before proceeding.</div>
            <div id="challenge-success" style="display: none;">
                <div class="h2">
                    <span class="icon-wrapper">
                    </span>Connection is secure</div>
                <div class="core-msg spacer">Proceeding...</div>
            </div>
            <noscript>
                <div id="challenge-error-title">
                    <div class="h2">
                        <span class="icon-wrapper">
                            <div class="heading-icon warning-icon"></div>
                        </span>
                        <span id="challenge-error-text">Enable JavaScript and cookies to continue</span>
                    </div>
                </div>
            </noscript>
        </div>
    </div>
    <div class="footer" role="contentinfo">
        <div class="footer-inner">
            <div class="clearfix diagnostic-wrapper">
                <div class="ray-id">Ray ID: <code>837fec16d9534138</code></div>
            </div>
            <div class="text-center" id="footer-text">Performance &amp; security by <a rel="noopener noreferrer" href="https://www.cloudflare.com?utm_source=challenge&amp;utm_campaign=m" target="_blank">Cloudflare</a></div>
        </div>
    </div>
</body>
</html>`,
};

export async function runExampleComServer(): Promise<[Server, number]> {
    const app = express();

    app.use(
        bodyParser.urlencoded({
            extended: true,
        }),
    );
    app.use(bodyParser.json());

    const special = express.Router();
    const cacheable = express.Router();

    // "special" pages with debugging info and responses for use in tests
    (() => {
        special.get('/getRawHeaders', (req, res) => {
            res.send(JSON.stringify(req.rawHeaders));
        });

        special.all('/getDebug', (req, res) => {
            res.json({
                headers: req.headers,
                method: req.method,
                bodyLength: +req.headers['content-length'] || 0,
            });
        });

        special.post('/mock', (req, res) => {
            const { headers, statusCode, error = false, body } = req.body;

            if (error) {
                throw new Error(error);
            }

            entries(headers as Record<string, string>).forEach(([key, value]) => res.setHeader(key, value));

            res.status(statusCode).send(body);
        });

        special.get('/headers', (req, res) => {
            res.status(200).json({ headers: req.headers });
        });

        special.get('/invalidContentType', (_req, res) => {
            res.send({ some: 'json' });
        });

        special.post('/jsonError', (_req, res) => {
            res.status(500).json({ message: 'CUSTOM_ERROR' });
        });

        special.get('/mirror', (_req, res) => {
            res.send('<html><head><title>Title</title></head><body>DATA</body></html>');
        });

        special.get('/html-type', (_req, res) => {
            res.send(responseSamples.html);
        });

        special.get('/json-type', (_req, res) => {
            res.json(responseSamples.json);
        });
        special.get('/xml-type', (_req, res) => {
            res.type('application/xml');
            res.send(responseSamples.xml);
        });
        special.get('/complex-xml', (_req, res) => {
            res.type('application/xml');
            res.send(responseSamples.complexXml);
        });
        special.get('/image-type', (_req, res) => {
            res.type('image/png');
            res.send(responseSamples.image);
        });

        special.get('/timeout', async (_req, res) => {
            await setTimeout(32000);
            res.type('html').send('<div>TEST</div>');
        });
        special.get('/resources', async (_req, res) => {
            res.type('html').send(responseSamples.resources);
        });

        special.get('/redirect', (_req, res) => {
            res.type('html').send(responseSamples.htmlWithOutsideRedirect);
        });

        special.get('/redirect-outside', (req, res) => {
            res.redirect('https://example.com');
        });

        special.get('/cloudflareBlocking', async (_req, res) => {
            res.type('html').status(403).send(responseSamples.cloudflareBlocking);
        });
    })();

    // "cacheable" site with one page, scripts and stylesheets
    (() => {
        cacheable.get('/', (req, res) => {
            res.send(responseSamples.cacheable.html);
        });
        cacheable.get('/style.css', (req, res) => {
            res.type('text/css').send(responseSamples.cacheable.css);
        });
        cacheable.get('/script.js', (req, res) => {
            res.type('application/javascript').send(responseSamples.cacheable.js);
        });
    })();

    app.use('/special', special);
    app.use('/cacheable', cacheable);

    app.get('**/*', async (req, res) => {
        await setTimeout(50);
        res.send(responseSamples.html);
    });

    const server = await startExpressAppPromise(app, 0);
    const { port } = server.address() as any;

    return [server, port];
}
