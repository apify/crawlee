const { execSync } = require('child_process');

const IMAGES_TO_UPDATE = ['node-basic', 'node-chrome', 'node-chrome-xvfb'];
const { DOCKER_USERNAME, DOCKER_PASSWORD } = process.env;

const dryRun = process.argv.includes('--dry-run');

log('Checking that docker is running.');
execSync('docker ps');

log('Logging in to Docker registry.');
try {
    execSync(`echo "${DOCKER_PASSWORD}" | docker login -u "${DOCKER_USERNAME}" --password-stdin`);
} catch (err) {
    // Swallow the error to prevent printing credentials to console.
    process.exit(1);
}


if (dryRun) log('DRY RUN: The following operations produce only log messages.');

IMAGES_TO_UPDATE.forEach((imageName) => {
    log(`Processing image: ${imageName}.`);
    log(`${imageName}: Removing local copies of image.`);
    if (!dryRun) execSync(`docker image rm --force apify/actor-${imageName}:beta apify/actor-${imageName}:latest`);

    log(`${imageName}: Pulling remote beta image.`);
    if (!dryRun) execSync(`docker pull apify/actor-${imageName}:beta`);

    log(`${imageName}: Tagging beta image with the latest tag.`);
    if (!dryRun) execSync(`docker image tag apify/actor-${imageName}:beta apify/actor-${imageName}:latest`);

    log(`${imageName}: Pushing local version to remote.`);
    if (!dryRun) execSync(`docker push apify/actor-${imageName}:latest`);

    log(`Docker image was published as apify/actor-${imageName}:latest`);
});

log('All images were tagged and pushed to remote.');

function log(...messages) {
    /* eslint-disable no-console */
    console.log('update-latest-images:', ...messages);
}
