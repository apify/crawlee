---
id: aws-cheerio
title: Cheerio on AWS Lambda
---

Locally, we can conveniently create a Crawlee project with `npx crawlee create`. In order to run this project on AWS Lambda, however, we need to do a few tweaks.

## Updating the code

Whenever we instantiate a new crawler, we have to pass a unique `Configuration` instance to it. By default, all the Crawlee crawler instances share the same storage - this can be convenient, but would also cause “statefulness” of our Lambda, which would lead to hard-to-debug problems.

Also, when creating this Configuration instance, make sure to pass the `persistStorage: false` option. This tells Crawlee to use in-memory storage, as the Lambda filesystem is read-only.
    
```javascript title="src/main.js"
// For more information, see https://crawlee.dev/
import { CheerioCrawler, Configuration, ProxyConfiguration } from 'crawlee';
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

Now, we wrap all the logic in a `handler` function. This is the actual “Lambda” that AWS will be executing later on. 

```javascript title="src/main.js"
// For more information, see https://crawlee.dev/
import { CheerioCrawler, Configuration } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

// highlight-next-line
export const handler = async (event, context) => {
    const crawler = new CheerioCrawler({
        requestHandler: router,
    }, new Configuration({
        persistStorage: false,
    }));

    await crawler.run(startUrls);
// highlight-next-line
};
```

:::tip **Important**

Make sure to always instantiate a **new crawler instance for every Lambda**. AWS always keeps the environment running for some time after the first Lambda execution (in order to reduce cold-start times) - so any subsequent Lambda calls will access the already-used crawler instance.

**TLDR: Keep your Lambda stateless.**

:::


Last things last, we also want to return the scraped data from the Lambda when the crawler run ends.

In the end, your `main.js` script should look something like this:

```javascript title="src/main.js"
// For more information, see https://crawlee.dev/
import { CheerioCrawler, Configuration } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

export const handler = async (event, context) => {
    const crawler = new CheerioCrawler({
        requestHandler: router,
    }, new Configuration({
        persistStorage: false,
    }));

    await crawler.run(startUrls);

    // highlight-start
    return {
        statusCode: 200,
        body: await crawler.getData(),
    }
    // highlight-end
};
```

## Deploying the project

Now it’s time to deploy our script on AWS!

Let’s create a zip archive from our project (including the `node_modules` folder) by running `zip -r package.zip .` in the project folder.

:::note Large `node_modules` folder?

AWS has a limit of 50MB for direct file upload. Usually, our Crawlee projects won’t be anywhere near this limit, but we can easily exceed this with large dependency trees.

A better way to install your project dependencies is by using Lambda Layers. With Layers, we can also share files between multiple Lambdas - and keep the actual “code” part of the Lambdas as slim as possible.

**To create a Lambda Layer, we need to:** 

- Pack the `node_modules` folder into a separate zip file (the archive should contain one folder named `node_modules`).
- Create a new Lambda layer from this archive. We’ll probably need to upload this file to AWS S3 storage and create the Lambda Layer like this.
- After creating it, we simply tell our new Lambda function to use this layer.

:::

To deploy our actual code, we upload the `package.zip` archive as our code source.

In Lambda Runtime Settings, we point the `handler` to the main function that runs the crawler. You can use slashes to describe directory structure and `.` to denote a named export. Our handler function is called `handler` and is exported from the `src/main.js` file, so we’ll use `src/main.handler` as the handler name.

Now we’re all set! By clicking the **Test** button, we can send an example testing event to our new Lambda. The actual contents of the event don’t really matter for now - if you want, further parameterize your crawler run by analyzing the `event` object AWS passes as the first argument to the handler.

:::tip

In the Configuration tab in the AWS Lambda dashboard, you can configure the amount of memory the Lambda is running with or the size of the ephemeral storage. 

The memory size can greatly affect the execution speed of your Lambda. 

See the [official documentation](https://docs.aws.amazon.com/lambda/latest/operatorguide/computing-power.html) to see how the performance and cost scale with more memory.

:::