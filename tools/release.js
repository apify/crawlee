const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver'); // eslint-disable-line import/no-extraneous-dependencies

const VERSION = require('../package.json').version;

log('Checking if current branch is master branch.');
const currentBranch = execSync('git branch | grep "*"', { encoding: 'utf8' }).substr(2);
if (currentBranch !== 'master') {
    log('Release can only be triggered from the master branch.');
    process.exit(1);
}

log('Checking if branch is up to date.');
const upToDate = execSync('git branch | grep "*"', { encoding: 'utf8' }).substr(2);

log('Fetching version of published beta.');
const betaVersion = fetchPackageJsonPropertyForTag('version', 'beta');

if (semver.gte(betaVersion, VERSION)) {
    log(`Cannot release version: ${VERSION} with version ${betaVersion} already released.`);
    process.exit(0);
}


function log(...messages) {
    /* eslint-disable no-console */
    console.log('release:', ...messages);
}

function fetchPackageJsonPropertyForTag(property, tag) {
    return execSync(`npm show apify@${tag} ${property}`, { encoding: 'utf8' }).trim();
}
