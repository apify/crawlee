#!/bin/bash

set -e

RED='\033[0;31m'
NC='\033[0m' # No Color

PACKAGE_VERSION=`node -pe "require('./package.json').version"`
BRANCH=`git status | grep 'On branch' | cut -d ' ' -f 3`
BRANCH_UP_TO_DATE=`git status | grep 'nothing to commit' | tr -s \n ' '`;

if [ -z "$BRANCH_UP_TO_DATE" ]; then
    printf "${RED}You have uncommited changes!${NC}\n"
    exit 1
fi

if [ $BRANCH = "master" ]; then
    NPM_TAG='latest'
    GIT_TAG="v${PACKAGE_VERSION}"
else
    NPM_TAG='beta'
    GIT_TAG="v${PACKAGE_VERSION}-beta"
fi

echo "Pushing to git ..."
git push

echo "Publishing version ${PACKAGE_VERSION} with tag \"${NPM_TAG}\" ..."
RUNNING_FROM_SCRIPT=1 npm publish --tag $NPM_TAG

echo "Tagging git with ${GIT_TAG} ..."
git tag ${GIT_TAG}
git push origin ${GIT_TAG}

echo "Done."
