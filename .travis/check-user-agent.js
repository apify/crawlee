const httpRequest = require('@apify/http-request');
const parse = require('csv-parse/lib/sync');
const UAParser = require('ua-parser-js');
const { DEFAULT_USER_AGENT } = require('../build/constants');

const getMajor = (version) => {
    return version.split('.')[0];
};

async function main() {
    const { body } = await httpRequest({ url: 'https://omahaproxy.appspot.com/all?csv=1' });
    const csv = await parse(body, { columns: true });
    const latestStabel = csv.find(line => line.channel === 'stable' && line.os === 'linux');
    const UA = new UAParser(DEFAULT_USER_AGENT);
    const defaultUserAgentVersion = getMajor(UA.getBrowser().version);
    const latestStableVersion = getMajor(latestStabel.current_version);
    if (defaultUserAgentVersion !== latestStableVersion) {
        console.log(`Default User-Agent has a correct Chrome version - ${defaultUserAgentVersion}.`);
        process.exit(0);
    } else {
        console.warn('Default User-Agent has incorrect version of Chrome!');
        console.warn('This can cause more blocking in head-full mode.');
        console.warn(`Default User-Agent: ${defaultUserAgentVersion} X Latest Chrome: ${latestStableVersion} `);
        process.exit(1);
    }
}

try {
    main();
} catch (e) {
    console.log('Could not check User-Agent');
    console.error(e);
    process.exit(1)
}
