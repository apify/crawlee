
# Checklist of things to do to publish new version


## Beta release

Bump `package.json` version, updated `CHANGELOG.md` and commit to develop branch.

Run `publish.sh` to publish the package on NPM

Upgrade packages in [Apify Docker images](https://github.com/apifytech/apify-actor-docker),
**make sure the `puppeteer` version matches the version in Apify SDK** !!! After commit, the new BETA
images are built automatically.

On major version upgrade, ensure that [Apify CLI templates](https://github.com/apifytech/apify-cli/tree/master/src/templates)
use the latest version.

Upgrade packages in Apify integration tests and run them using:

```
./check.sh BETA_PACKAGES=true ./check.sh prod 2
```

## Latest release 

TODO
