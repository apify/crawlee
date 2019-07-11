const { execSync } = require('child_process');

const IMAGES_TO_UPDATE = ['node-chrome', 'node-basic', 'node-chrome-xvfb'];
const { DOCKER_USERNAME, DOCKER_PASSWORD } = process.env;

log('Checking that docker is running.');
execSync('docker ps');

log('Logging in to Docker registry.');
try {
    execSync(`echo "${DOCKER_PASSWORD}" | docker login -u "${DOCKER_USERNAME}" --password-stdin`);
} catch (err) {
    // Swallow the error to prevent printing credentials to console.
    process.exit(1);
}


IMAGES_TO_UPDATE.forEach((imageName) => {
    log(`Processing image: ${imageName}.`);
    log(`${imageName}: Removing local copies of image.`);
    execSync(`docker image rm --force apify/actor-${imageName}:beta apify/actor-${imageName}:latest`);

    log(`${imageName}: Pulling remote beta image.`);
    execSync(`docker pull apify/actor-${imageName}:beta`);

    log(`${imageName}: Tagging beta image with the latest tag.`);
    execSync(`docker image tag apify/actor-${imageName}:beta apify/actor-${imageName}:latest`);

    log(`${imageName}: Pushing local version to remote.`);
    execSync(`docker push apify/actor-${imageName}:latest`);

    log(`Docker image was published as apify/actor-${imageName}:latest`);
});

log('All images were tagged and pushed to remote.');

function log(...messages) {
    /* eslint-disable no-console */
    console.log('update-latest-images:', ...messages);
}
