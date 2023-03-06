import type { Application } from 'express';
import type { Server } from 'http';

import express from 'express';
import { setTimeout } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import { entries } from 'crawlee';

export const startExpressAppPromise = (app: Application, port: number) => {
    return new Promise<Server>((resolve) => {
        const server = app.listen(port, () => resolve(server));
    });
};

export const responseSamples = {
    json: { foo: 'bar' },
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<items>\n'
        + '<item>\n'
        + '    <url>https://apify.com</url>\n'
        + '    <title>Web Scraping, Data Extraction and Automation &#xb7; Apify</title>\n'
        + '</item>\n'
        + '</items>',
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
};

export async function runExampleComServer(): Promise<[Server, number]> {
    const app = express();

    app.use(bodyParser.urlencoded({
        extended: true,
    }));
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
            res
                .status(500)
                .json({ message: 'CUSTOM_ERROR' });
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
