const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const PKG_JSON_PATH = path.join(__dirname, '..', '..', 'package.json');

const pkgJson = require(PKG_JSON_PATH);

const PACKAGE_NAME = pkgJson.name;
const VERSION = pkgJson.version;

const nextVersion = getNextVersion(VERSION);
console.log(`before-deploy: Setting version to ${nextVersion}`);
pkgJson.version = nextVersion;

fs.writeFileSync(PKG_JSON_PATH, JSON.stringify(pkgJson, null, 2) + '\n');

function getNextVersion(version) {
    const versionString = execSync(`npm show ${PACKAGE_NAME} versions --json`, { encoding: 'utf8'});
    const versions = JSON.parse(versionString);

    if (versions.some(v => v === VERSION)) {
        console.error(`before-deploy: A release with version ${VERSION} already exists. Please increment version accordingly.`);
        process.exit(1);
    }

    const prereleaseNumbers = versions
        .filter(v => (v.startsWith(VERSION) && v.includes('-')))
        .map(v => Number(v.match(/\.(\d+)$/)[1]));
    const lastPrereleaseNumber = Math.max(-1, ...prereleaseNumbers);
    return `${version}-beta.${lastPrereleaseNumber + 1}`
}
