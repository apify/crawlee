const fs = require('fs-extra');
const path = require('path');
const childProcess = require('child_process');
const semver = require('semver'); // eslint-disable-line import/no-extraneous-dependencies

const {
    DOCKER_USERNAME,
    DOCKER_PASSWORD,
    TRAVIS,
    TRAVIS_TAG: TAG,
    TRAVIS_BRANCH: BRANCH,
} = process.env;

if (!TRAVIS) throw new Error('This script is supposed to run on Travis only. ' +
    'If you want to run it locally, you\'ll need to set some env vars and it will overwrite your Git credentials so tread carefully.');

const TEMP_DIR = path.join(__dirname, '..', 'tmp');
const IMAGE_REPO_NAME = 'apify-actor-docker';
const IMAGE_REPO_URL = `https://github.com/apifytech/${IMAGE_REPO_NAME}.git`;
const IMAGE_REPO_DIR = path.join(TEMP_DIR, IMAGE_REPO_NAME);
const IMAGES_TO_UPDATE = ['node-chrome', 'node-basic'];
const IMAGES_TO_BUILD = [...IMAGES_TO_UPDATE, 'node-chrome-xvfb', 'node-phantomjs'];
const PKG_PATHS = IMAGES_TO_UPDATE.map(getPackageJsonPath);

let RELEASE_TAG;
if (TAG && /^v\d+\.\d+\.\d+$/.test(TAG)) RELEASE_TAG = 'latest';
else if (BRANCH && /^master$/.test(BRANCH)) RELEASE_TAG = 'beta';
else {
    log('Build is not a release build. Skipping.');
    process.exit(0);
}

log(`Triggering release of ${RELEASE_TAG} images.`);

log('Preparing file system.');
fs.ensureDirSync(TEMP_DIR);
fs.removeSync(IMAGE_REPO_DIR);

log('Cloning image repository.');
execSync(`git clone ${IMAGE_REPO_URL}`, { cwd: TEMP_DIR });
execGitCommand('reset HEAD');

log('Setting up git.');
execGitCommand('config --global user.email "travis@travis-ci.org"');
execGitCommand('config --global user.name "Travis CI"');

log('Loading published Apify versions.');
const loadedApifyVersion = fetchPackageJsonPropertyForTag('version', RELEASE_TAG);

log(`Loading version of puppeteer in apify@${RELEASE_TAG}.`);
const loadedPuppeteerVersion = fetchPackageJsonPropertyForTag('dependencies.puppeteer', RELEASE_TAG);

let updatedImageCount = 0;
IMAGES_TO_UPDATE.forEach((imageName) => {
    log(`Processing image: ${imageName}`);
    const imagePkgPath = path.join(IMAGE_REPO_DIR, getPackageJsonPath(imageName));
    const imagePkg = require(imagePkgPath); // eslint-disable-line

    const apifyVersion = imagePkg.dependencies.apify;
    if (semver.gte(apifyVersion, loadedApifyVersion)) {
        return logSkipMessage(imageName, 'apify', apifyVersion, loadedApifyVersion);
    }

    const newImagePkg = JSON.parse(JSON.stringify(imagePkg));
    logUpdatingMessage(imageName, 'apify', apifyVersion, loadedApifyVersion);
    newImagePkg.dependencies.apify = loadedApifyVersion;

    const puppeteerVersion = imagePkg.dependencies.puppeteer;
    if (puppeteerVersion && semver.lt(puppeteerVersion, loadedPuppeteerVersion)) {
        newImagePkg.dependencies.puppeteer = loadedPuppeteerVersion;
        logUpdatingMessage(imageName, 'puppeteer', puppeteerVersion, loadedPuppeteerVersion);
    } else if (puppeteerVersion) {
        logSkipMessage(imageName, 'puppeteer', puppeteerVersion, loadedPuppeteerVersion);
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
let commitMessage = 'Update package versions';
if (isLatest()) {
    log('Skipping CI build of beta images because we\'re running a latest deploy.');
    commitMessage += ' [skip ci]';
}
execGitCommand(`commit -m "${commitMessage}"`);

log('Adding new origin with token.');
execGitCommand(`remote add origin-token https://${process.env.GH_TOKEN}@github.com/apifytech/apify-actor-docker > /dev/null 2>&1`);

log('Pushing changes to remote.');
execGitCommand('push --set-upstream origin-token master');

if (!isLatest()) {
    teardown();
    process.exit(0);
}

log('Initiating build of latest images.');
log('Checking that docker is running.');
execSync('docker ps');

log('Logging in to Docker registry.');
try {
    execSync(`echo "${DOCKER_PASSWORD}" | docker login -u "${DOCKER_USERNAME}" --password-stdin`);
} catch (err) {
    // Swallow the error to prevent printing credentials to console.
    log('Login to Docker registry failed.');
    process.exit(1);
}

IMAGES_TO_BUILD.forEach(imageName => {
    log(`Building image: ${imageName}`);
    const dockerImage = `apify/actor-${imageName}:latest`;
    execSync(`docker build --pull --tag ${dockerImage} --no-cache ./${imageName}/`, { cwd: IMAGE_REPO_DIR });
    log(`${imageName}: built. Running a test.`);
    execSync(`docker run ${dockerImage}`);
    log(`${imageName}: test successful. Pushing image to repository.`);
    execSync(`docker push ${dockerImage}`);
});

teardown();

function log(...messages) {
    /* eslint-disable no-console */
    console.log('release-images:', ...messages);
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
    const prop = execSync(`npm show apify@${tag} ${property}`, { encoding: 'utf8', stdio: 'pipe' });
    return prop.trim();
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

function isLatest() {
    return RELEASE_TAG === 'latest';
}

function execSync(command, options) {
    const opts = {
        stdio: 'inherit',
        ...options,
    };
    return childProcess.execSync(command, opts);
}
