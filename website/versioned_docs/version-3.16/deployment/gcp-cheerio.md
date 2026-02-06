---
id: gcp-cheerio
title: Cheerio on GCP Cloud Functions
---

Running CheerioCrawler-based project in GCP functions is actually quite easy - you just have to make a few changes to the project code.

## Updating the project

Let’s first create the Crawlee project locally with `npx crawlee create`. Set the `"main"` field in the `package.json` file to `"src/main.js"`.

```json title="package.json"
{
    "name": "my-crawlee-project",
    "version": "1.0.0",
    // highlight-next-line
    "main": "src/main.js",
    ...
}
```

Now, let’s update the `main.js` file, namely:

- Pass a separate `Configuration` instance (with the `persistStorage` option set to `false`) to the crawler constructor.

```javascript title="src/main.js"
import { CheerioCrawler, Configuration } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

const crawler = new CheerioCrawler({
    requestHandler: router,
// highlight-start
}, new Configuration({
    persistStorage: false,
}));
// highlight-end

await crawler.run(startUrls);
```

- Wrap the crawler call in a separate handler function. This function:
    - Can be asynchronous
    - Takes two positional arguments - `req` (containing details about the user-made request to your cloud function) and `res` (response object you can modify).
        - Call `res.send(data)` to return any data from the cloud function.
- Export this function from the `src/main.js` module as a named export.

```javascript title="src/main.js"
import { CheerioCrawler, Configuration } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

// highlight-next-line
export const handler = async (req, res) => {
    const crawler = new CheerioCrawler({
        requestHandler: router,
    }, new Configuration({
        persistStorage: false,
    }));

    await crawler.run(startUrls);
    
    // highlight-next-line
    return res.send(await crawler.getData())
// highlight-next-line
}
```

## Deploying to Google Cloud Platform

In the Google Cloud dashboard, create a new function, allocate memory and CPUs to it, set region and function timeout.
    
When deploying, pick **ZIP Upload**. You have to create a new GCP storage bucket to store the zip packages in.
    
Now, for the package - you should zip all the contents of your project folder **excluding the `node_modules` folder** - GCP doesn’t have Layers like AWS Lambda does, but takes care of the project setup for us based on the `package.json` file).
    
Also, make sure to set the **Entry point** to the name of the function you’ve exported from the `src/main.js` file. GCP takes the file from the `package.json`'s `main` field.
    
After the Function deploys, you can test it by clicking the “Testing” tab. This tab contains a `curl` script that calls your new Cloud Function. To avoid having to install the `gcloud` CLI application locally, you can also run this script in the Cloud Shell by clicking the link above the code block.
