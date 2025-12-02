---
id: gcp-browsers
title: Browsers in GCP Cloud Run
---

Running full-size browsers on GCP Cloud Functions is actually a bit different from doing so on AWS Lambda - [apparently](https://pptr.dev/troubleshooting#running-puppeteer-on-google-cloud-functions), the latest runtime versions miss dependencies required to run Chromium.

If we want to run browser-enabled Crawlee crawlers on GCP, we’ll need to turn towards **Cloud Run.** Cloud Run is GCP’s platform for running Docker containers - other than that, (almost) everything is the same as with Cloud Functions / AWS Lambdas. 

GCP can spin up your containers on demand, so you’re only billed for the time it takes your container to return an HTTP response to the requesting client. In a way, it also provides a slightly better developer experience (than regular FaaS), as you can debug your Docker containers locally and be sure you’re getting the same setup in the cloud.

## Preparing the project

As always, we first pass a new `Configuration` instance to the crawler constructor:

```javascript  title="src/main.js"
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

All we now need to do is wrap our crawler with an Express HTTP server handler, so it can communicate with the client via HTTP. Because the Cloud Run platform sees only an opaque Docker container, we have to take care of this bit ourselves. 

:::info

GCP passes you an environment variable called `PORT` - your HTTP server is expected to be listening on this port (GCP exposes this one to the outer world).

:::

The `main.js` script should be looking like this in the end:

```javascript title="src/main.js"
import { Configuration, PlaywrightCrawler } from 'crawlee';
import { router } from './routes.js';
// highlight-start
import express from 'express';
const app = express();
// highlight-end

const startUrls = ['https://crawlee.dev'];


// highlight-next-line
app.get('/', async (req, res) => {
    const crawler = new PlaywrightCrawler({
        requestHandler: router,
    }, new Configuration({
        persistStorage: false,
    }));
    
    await crawler.run(startUrls);    

    // highlight-next-line
    return res.send(await crawler.getData());
// highlight-next-line
});

// highlight-next-line
app.listen(parseInt(process.env.PORT) || 3000);
```

:::tip

Always make sure to keep all the logic in the request handler - as with other FaaS services, your request handlers have to be **stateless.**

:::

## Deploying to GCP

Now, we’re ready to deploy! If you have initialized your project using `npx crawlee create`, the initialization script has prepared a Dockerfile for you. 

All you have to do now is run `gcloud run deploy` in your project folder (the one with your Dockerfile in it). The gcloud CLI application will ask you a few questions, such as what region you want to deploy your application in, or whether you want to make your application public or private.

After answering those questions, you should be able to see your application in the GCP dashboard and run it using the link you find there.

:::tip

In case your first execution of your newly created Cloud Run fails, try editing the Run configuration - mainly setting the available memory to 1GiB or more and updating the request timeout according to the size of the website you are scraping.

:::