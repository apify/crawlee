#!/bin/bash

set -e

RED='\033[0;31m'
NC='\033[0m' # No Color

PACKAGE_NAME=`node -pe "require('./package.json').name"`
PACKAGE_VERSION=`node -pe "require('./package.json').version"`
BRANCH=`git status | grep 'On branch' | cut -d ' ' -f 3`
BRANCH_UP_TO_DATE=`git status | grep 'nothing to commit' | tr -s \n ' '`;
GIT_TAG="v${PACKAGE_VERSION}"

if [ -z "${BRANCH_UP_TO_DATE}" ]; then
    printf "${RED}You have uncommitted changes!${NC}\n"
    exit 1
fi

echo "Pushing to git ..."
git push

# Master gets published as LATEST if that version doesn't exists yet and retagged as LATEST otherwise.
if [ "${BRANCH}" = "master" ]; then
    if [ -z `npm view ${PACKAGE_NAME} versions | grep ${PACKAGE_VERSION}` ]; then
        printf "${RED}You can only publish to NPM from develop branch with beta tag!${NC}\n"
        exit 1
    else
        echo "Tagging version ${PACKAGE_VERSION} with tag \"latest\" ..."
        RUNNING_FROM_SCRIPT=1 npm dist-tag add ${PACKAGE_NAME}@${PACKAGE_VERSION} latest
    fi

# Develop branch gets published as BETA and we don't allow to override tag of existing version.
elif [ "${BRANCH}" = "develop" ]; then
    echo "Publishing version ${PACKAGE_VERSION} with tag \"beta\" ..."
    RUNNING_FROM_SCRIPT=1 npm publish --tag beta

# For other branch throw an error.
else
    printf "${RED}You can publish from develop and master branches only!${NC}\n"
    exit 1
fi

echo "Tagging git with ${GIT_TAG} ..."
git tag ${GIT_TAG}
git push origin ${GIT_TAG}
echo "Git tag: ${GIT_TAG} created."

echo "Done."
