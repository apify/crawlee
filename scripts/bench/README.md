# Import-time bench

Measures cold-start `import()` time of crawlee packages by spawning a fresh
`node` process per sample (so the module cache is empty every run). Used while
investigating https://github.com/apify/crawlee/issues/3549.

## Setup

After `pnpm install && pnpm build` at the repo root, link the workspace
packages into this directory:

```sh
mkdir -p node_modules/@crawlee
ln -sfn ../../../packages/crawlee node_modules/crawlee
for p in basic-crawler cheerio-crawler http-crawler playwright-crawler \
         puppeteer-crawler core utils; do
  short=$(echo "$p" | sed 's/-crawler//')
  ln -sfn "../../../packages/$p" "node_modules/@crawlee/$short"
done
```

## Run

```sh
# default targets: crawlee, @crawlee/basic, /cheerio, /http, /playwright, /puppeteer, /core, /utils
node bench.mjs

# specific targets
node bench.mjs @crawlee/utils @crawlee/basic

# tune sample count / warm-ups
SAMPLES=15 WARMUP=1 node bench.mjs
```

Output columns: `median`, `min`, `max`, then the raw samples in ms.

## Tracing which modules a target loads

```sh
node --no-warnings --experimental-loader=./trace-loader.mjs \
  -e "import('@crawlee/http').then(()=>{})" 2>&1 | grep '^R '
```

Prints every bare-specifier resolution the loader sees, so you can spot which
third-party packages a target pulls in at load time.
