#!/bin/bash

if [ -z $1 ] || [ -z $2 ]; then
    echo "Deploys new website content to https://sdk.apify.com"
    echo "Usage: ./publish_docs.sh <ALGOLIA_API_KEY> <GITHUB_USERNAME>"
    exit 1
fi

export ALGOLIA_API_KEY=$1
export GIT_USER=$2
export USE_SSH=true
npm run publish-gh-pages
