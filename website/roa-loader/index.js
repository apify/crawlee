const { urlToRequest } = require('loader-utils');

const signingUrl = new URL('https://api.apify.com/v2/tools/encode-and-sign');
signingUrl.searchParams.set('token', process.env.APIFY_SIGNING_TOKEN);

module.exports = async function (source) {
    console.log(`Signing ${urlToRequest(this.resourcePath)}...`);

    const res = await (await fetch(signingUrl, {
        method: 'POST',
        body: JSON.stringify({
            input: JSON.stringify({ code: source }),
            options: {
                build: 'latest',
                contentType: 'application/json; charset=utf-8',
            },
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
    })).json();

    if (!res.data || !res.data.encoded) {
        console.error(res);
        throw new Error(`Signing failed: ${res.error || 'Unknown error'}`);
    }
    const runUrl = new URL('https://console.apify.com/actors/6i5QsHBMtm3hKph70');
    runUrl.searchParams.set('runConfig', res.data.encoded);

    return { code: source, runUrl: runUrl.toString() };
};
