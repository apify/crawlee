---
id: aws-browsers
title: Browsers on AWS Lambda
---

Running browser-enabled Crawlee crawlers in AWS Lambda is a bit complicated - but not too much. The main problem is that we have to upload not only our code and the dependencies, but also the **browser binaries**.

## Managing browser binaries

Fortunately, there are already some NPM packages that can help us with managing the browser binaries installation:

- [@sparticuz/chromium](https://www.npmjs.com/package/@sparticuz/chromium) is an NPM package containing brotli-compressed chromium binaries. When run in the Lambda environment, the package unzips the binaries under the `/tmp/` path and returns the path to the executable.

We just add this package to the project dependencies and zip the `node_modules` folder.

```bash
# Install the package
npm i -S @sparticuz/chromium

# Zip the dependencies
zip -r dependencies.zip ./node_modules
```

We will now upload the `dependencies.zip` as a Lambda Layer to AWS. Unfortunately, we cannot do this directly - there is a 50MB limit on direct uploads (and the compressed Chromium build is around that size itself). Instead, we'll upload it as an object into an S3 storage and provide the link to that object during the layer creation.

## Updating the code

We also have to slightly update the Crawlee code:

- First, we pass a new `Configuration` instance to the Crawler. This way, every crawler instance we create will have its own storage and won’t interfere with other crawler instances running in your Lambda environment.

```javascript title="src/main.js"
// For more information, see https://crawlee.dev/
import { Configuration, PlaywrightCrawler } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

const crawler = new PlaywrightCrawler({
    requestHandler: router,
// highlight-start
}, new Configuration({
    persistStorage: false,
}));
// highlight-end

await crawler.run(startUrls);
```

- Now, we actually have to supply the code with the Chromium path from the `@sparticuz/chromium` package. AWS Lambda execution also lacks some hardware support for GPU acceleration etc. - you can tell Chrome about this by passing the `aws_chromium.args` to the `args` parameter.

```javascript title="src/main.js"
// For more information, see https://crawlee.dev/
import { Configuration, PlaywrightCrawler } from 'crawlee';
import { router } from './routes.js';
// highlight-next-line
import aws_chromium from '@sparticuz/chromium';

const startUrls = ['https://crawlee.dev'];

const crawler = new PlaywrightCrawler({
    requestHandler: router,
    // highlight-start
    launchContext: {
        launchOptions: {
             executablePath: await aws_chromium.executablePath(),
             args: aws_chromium.args,
             headless: true
        }
    }
    // highlight-end
}, new Configuration({
    persistStorage: false,
}));

```

- Last but not least, we have to wrap the code in the exported `handler` function - this will become the Lambda AWS will be executing.

```javascript title="src/main.js"
import { Configuration, PlaywrightCrawler } from 'crawlee';
import { router } from './routes.js';
import aws_chromium from '@sparticuz/chromium';

const startUrls = ['https://crawlee.dev'];

// highlight-next-line
export const handler = async (event, context) => {
    const crawler = new PlaywrightCrawler({
        requestHandler: router,
        launchContext: {
            launchOptions: {
                executablePath: await aws_chromium.executablePath(),
                args: aws_chromium.args,
                headless: true
            }
        }
    }, new Configuration({
        persistStorage: false,
    }));

    await crawler.run(startUrls);

    // highlight-start
    return {
        statusCode: 200,
        body: await crawler.getData(),
    };
}
// highlight-end

```

## Deploying the code

Now we can simply pack the code into a zip archive (minus the `node_modules` folder, we have put that in the Lambda Layer, remember?). We upload the code archive to AWS as the Lambda body, set up the Lambda so it uses the dependencies Layer, and test our newly created Lambda.

:::tip Memory settings

Since we’re using full-size browsers here, we have to update the Lambda configurations a bit. Most importantly, make sure to set the memory setting to **1024 MB or more** and update the **Lambda timeout**. 

The target timeout value depends on how long your crawler will be running. Try measuring the execution time when running your crawler locally and set the timeout accordingly.

:::