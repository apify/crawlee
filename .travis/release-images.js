const path = require('path');
const { execSync } = require('child_process');

const TAG = process.env.TRAVIS_TAG;
const BRANCH = process.env.TRAVIS_BRANCH;

if (TAG && /^v\d+\.\d+\.\d+$/.test(TAG)) {
    // Latest release
    console.log('release-images: Triggering release of latest images.');
    execSync(`node ${path.join(__dirname, 'release-images-latest.js')} --dry-run'`);
} else if (BRANCH && /^master$/.test(BRANCH)) {
    // Beta release
    console.log('release-images: Triggering release of beta images.');
    execSync(`node ${path.join(__dirname, 'release-images-beta.js')} --dry-run`);
} else {
    console.log('release-images: Build is not a release build. Skipping.');
    process.exit(0);
}
