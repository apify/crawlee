#!/bin/bash

export ALGOLIA_API_KEY=$1
export GIT_USER=$2
export USE_SSH=true
npm run publish-gh-pages
