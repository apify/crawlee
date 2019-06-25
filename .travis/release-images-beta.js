const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver'); // eslint-disable-line import/no-extraneous-dependencies

const TEMP_DIR = path.join(__dirname, '..', 'tmp');
const IMAGE_REPO_NAME = 'apify-actor-docker';
const IMAGE_REPO_URL = `https://github.com/apifytech/${IMAGE_REPO_NAME}.git`;
const IMAGE_REPO_DIR = path.join(TEMP_DIR, IMAGE_REPO_NAME);
const IMAGES_TO_UPDATE = ['node-basic', 'node-chrome'];
const PKG_PATHS = IMAGES_TO_UPDATE.map(getPackageJsonPath);

const dryRun = process.argv.includes('--dry-run');

log('Preparing file system.');
fs.ensureDirSync(TEMP_DIR);
fs.removeSync(IMAGE_REPO_DIR);

log('Cloning image repository.');
execSync(`git clone -n ${IMAGE_REPO_URL} --depth 1`, { cwd: TEMP_DIR });
execGitCommand('reset HEAD');

log('Setting up git.');
execGitCommand('config --global user.email "travis@travis-ci.org"');
execGitCommand('config --global user.name "Travis CI"');

log('Checking out package.jsons.');
execGitCommand('checkout master', PKG_PATHS);

log('Loading published Apify versions.');
const betaVersion = fetchPackageJsonPropertyForTag('version', 'beta');

log('Loading version of puppeteer in apify@beta.');
const puppeteerVersionInBeta = fetchPackageJsonPropertyForTag('dependencies.puppeteer', 'beta');

let updatedImageCount = 0;
IMAGES_TO_UPDATE.forEach((imageName) => {
    log(`Processing image: ${imageName}`);
    const imagePkgPath = path.join(IMAGE_REPO_DIR, getPackageJsonPath(imageName));
    const imagePkg = require(imagePkgPath); // eslint-disable-line

    const apifyVersion = imagePkg.dependencies.apify;
    if (semver.gte(apifyVersion, betaVersion)) {
        return logSkipMessage(imageName, 'apify', apifyVersion, betaVersion);
    }

    const newImagePkg = JSON.parse(JSON.stringify(imagePkg));
    logUpdatingMessage(imageName, 'apify', apifyVersion, betaVersion);
    newImagePkg.dependencies.apify = betaVersion;

    const puppeteerVersion = imagePkg.dependencies.puppeteer;
    if (puppeteerVersion && semver.lt(puppeteerVersion, puppeteerVersionInBeta)) {
        newImagePkg.dependencies.puppeteer = puppeteerVersionInBeta;
        logUpdatingMessage(imageName, 'puppeteer', puppeteerVersion, puppeteerVersionInBeta);
    } else if (puppeteerVersion) {
        logSkipMessage(imageName, 'puppeteer', puppeteerVersion, puppeteerVersionInBeta);
    }

    log(`${imageName}: Writing new package.json.`);
    fs.writeFileSync(imagePkgPath, `${JSON.stringify(newImagePkg, null, 4)}\n`);
    updatedImageCount++;
});

if (!updatedImageCount) {
    log('Exiting because no images were updated.');
    teardown();
    process.exit(0);
}

log('Committing changes to package.jsons.');
execGitCommand('add', PKG_PATHS);
execGitCommand('commit -m "Update package versions"');

if (dryRun) {
    log('DRY RUN: Exiting process before changes are pushed to remote repository. Temp dir will be kept.');
    log('Run "git diff origin/master HEAD" to see changes.');
    process.exit(0);
}

log('Adding new origin with token.');
execGitCommand(`remote add origin-token https://${process.env.GH_TOKEN}@github.com/apifytech/apify-js > /dev/null 2>&1`);

log('Pushing changes to remote.');
execGitCommand(`push --set-upstream origin-token master`);

teardown();

function log(...messages) {
    /* eslint-disable no-console */
    console.log('update-images:', ...messages);
}

function execGitCommand(command, filePaths = []) {
    const fullCommand = filePaths.length
        ? `git ${command} ${PKG_PATHS.join(' ')}`
        : `git ${command}`;
    return execSync(fullCommand, { cwd: IMAGE_REPO_DIR });
}

function getPackageJsonPath(image) {
    return `./${image}/package.json`;
}

function fetchPackageJsonPropertyForTag(property, tag) {
    return execSync(`npm show apify@${tag} ${property}`, { encoding: 'utf8' }).trim();
}

function logSkipMessage(imageName, pkg, repoVersion, newVersion) {
    log(`${imageName}: Cannot update repository version of ${pkg}: ${repoVersion} with version: ${newVersion}`);
}

function logUpdatingMessage(imageName, pkg, repoVersion, newVersion) {
    log(`${imageName}: Updating package "${pkg}" from version ${repoVersion} to ${newVersion}`);
}

function teardown() {
    log('Cleaning up file system.');
    fs.removeSync(TEMP_DIR);
    log('Done.');
}
