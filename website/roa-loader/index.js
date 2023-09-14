const { urlToRequest } = require('loader-utils');
const { inspect } = require('util');

const signingUrl = new URL('https://api.apify.com/v2/tools/encode-and-sign');
signingUrl.searchParams.set('token', process.env.APIFY_SIGNING_TOKEN);
const queue = [];
let working = false;

async function getHash(source) {
    const memory = source.match(/playwright|puppeteer/i) ? 4096 : 1024;
    const res = await (await fetch(signingUrl, {
        method: 'POST',
        body: JSON.stringify({
            input: JSON.stringify({ code: source }),
            options: {
                build: 'latest',
                contentType: 'application/json; charset=utf-8',
                memory,
                timeout: 180,
            },
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
    })).json();

    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!res.data || !res.data.encoded) {
        console.error(res);
        throw new Error(`Signing failed:' ${inspect(res.error) || 'Unknown error'}`);
    }

    return res.data.encoded;
}

async function encodeAndSign(source) {
    if (working) {
        return new Promise((resolve, reject) => {
            queue.push(() => {
                return getHash(source).then(resolve, reject);
            });
        });
    }

    let res;

    try {
        working = true;
        res = await getHash(source);

        while (queue.length) {
            await queue.shift()();
        }
    } finally {
        working = false;
    }

    return res;
}

module.exports = async function (code) {
    console.log(`Signing ${urlToRequest(this.resourcePath)}...`, { working, queue: queue.length });
    const hash = await encodeAndSign(code);
    return { code, hash };
};
