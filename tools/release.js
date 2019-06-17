const { execSync } = require('child_process');
const semver = require('semver'); // eslint-disable-line import/no-extraneous-dependencies

const VERSION = require('../package.json').version;

const dryRun = process.argv.includes('--dry-run');

log('Checking if current branch is master branch.');
const gitStatus = execSync('git status --porcelain --branch', { encoding: 'utf8' });
if (!gitStatus.startsWith('## feature/')) { // TODO for testing, dont forget to replace
    log('Release can only be triggered from the master branch. Please checkout master.');
    process.exit(1);
}

log('Building documentation.');
execSync('npm run build-docs');
execSync('npm run build-readme');

log('Checking if all changes are committed.');
const statusLines = gitStatus.split('\n');
if (statusLines.length > 1 && statusLines[1].length) {
    log('You have uncommitted changes. Please commit them and run the script again.');
    process.exit(1);
}

log('Checking if branch is up to date.');
if (/\[ahead|behind \d+\]/.test(gitStatus)) {
    log('Your local copy of master branch is not up to date with the remote. Please push / pull changes.');
    process.exit(1);
}

log('Fetching version of published beta.');
const betaVersion = fetchPackageJsonPropertyForTag('version', 'beta');

if (semver.gte(betaVersion, VERSION)) {
    log(`Cannot release version: ${VERSION} with version ${betaVersion} already released.`);
    process.exit(0);
}

if (dryRun) log('DRY RUN: The following operations produce only log messages.');

const npmTag = 'beta';
log(`Publishing version ${VERSION} with the "${npmTag}" tag.`);
if (!dryRun) execSync(`npm publish --tag ${npmTag}`);

const versionTag = `v${VERSION}`;
log(`Tagging last commit with "${versionTag}" and "${npmTag}".`);
if (!dryRun) {
    execSync(`git tag ${versionTag}`);
    execSync(`git tag -f ${npmTag}`);
}

function log(...messages) {
    /* eslint-disable no-console */
    console.log('release:', ...messages);
}

function fetchPackageJsonPropertyForTag(property, tag) {
    return execSync(`npm show apify@${tag} ${property}`, { encoding: 'utf8' }).trim();
}
