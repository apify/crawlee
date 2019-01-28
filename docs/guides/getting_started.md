---
id: gettingstarted
title: Getting Started
---
Without the right tools, crawling and scraping the web can be a difficult thing. At the very least, you need an HTTP client to make the necessary requests, but that only gets you raw HTML and sometimes not even that. Then you have to read this HTML and extract the data you're interested in. Once extracted, it must be stored in a machine readable format and easily accessible for further processing, because it is the processed data that hold value.

Apify SDK covers the process end-to-end. From crawling the web for links and scraping the raw data to storing it in various machine readable formats, ready for processing. With this guide in hand, you should have your own data extraction solutions up and running in a few hours.

## Intro
The goal of this getting started guide is to provide a step-by-step introduction to all the features of the Apify SDK. It will walk you through creating the simplest of crawlers that only print text to console, all the way up to complex systems that crawl pages, interact with them as if a real user were sitting in front of a real browser and output structured data.

Since Apify SDK is usable both locally on any computer and on the 
<a href="https://my.apify.com" target="_blank">Apify Platform</a>,
you will be able to use the source code in both environments interchangeably. Nevertheless, some initial setup is still required, so choose your preferred starting environment and let's get into it.

## Setting up locally
To run Apify SDK on your own computer, you need to meet the following pre-requisites first:

1. Have Node.js version 8.14 or higher installed.
   * Visit <a href="https://nodejs.org/en/download/" target="_blank">Node.js website</a> to download or use <a href="https://github.com/creationix/nvm" target="_blank">nvm</a>
2. Have NPM installed.
   * NPM comes bundled with Node.js so you should already have it. If not, reinstall Node.js.

If you're not certain, confirm the pre-requisites by running:

```bash
node -v
```

```bash
npm -v
```

### Adding Apify SDK to an existing project
Apify SDK can be added as a dependency into any Node.js project, so if you already have a project that you'd like to add web crawling, scraping and automation capabilities to, just run the following command in the project's folder and you're good to go.

```bash
npm install apify
```

### Creating a new project
The fastest and best way to create new projects with the Apify SDK is to use our own 
<a href="https://www.npmjs.com/package/apify-cli" target="_blank">Apify CLI</a>.
This command line tool allows you to create, run and manage Apify projects with ease, including their deployment to the <a href="https://my.apify.com" target="_blank">Apify Platform</a> if you wish to run them in the cloud after developing them locally.

Let's install the Apify CLI with the following command:

```bash
npm install -g apify-cli
```
Once the installation finishes, all you need to do to set up an Apify SDK project is to run:

```bash
apify create my-new-project
```
A prompt will be shown, asking to choose a template. Disregard the different options for now and choose the template labeled `Hello world`. The command will now create a new directory in your current working directory, called `my-new-project`, create a `package.json` in this folder and install all the necessary dependencies. It will also add example source code that you can immediately run.

Let's try that!

```bash
cd my-new-project
```
```bash
apify run
```

You should start seeing log messages in the terminal as the system boots up and after a second, a Chromium browser window should pop up. In the window, you'll see quickly changing pages and back in the terminal, you should see the titles (contents of the &lt;title&gt; HTML tags) of the pages printed.

You can always terminate the crawl with a keypress in the terminal:

```bash
CTRL+C
```
Did you see all that? If you did, congratulations! You're ready to go!

## Setting up on the Apify Platform
Maybe you don't have Node.js installed and don't want the hassle. Or you can't install anything on your computer because you're using a company provided one. Or perhaps you'd just prefer to start working in the cloud right away. Well, no worries, we've got you covered.

The <a href="https://my.apify.com" target="_blank">Apify Platform</a> is the foundational product of <a href="https://www.apify.com" target="_blank">Apify</a>. It's a serverless cloud computing platform, specifically designed for any web automation jobs, that may include crawling and scraping, but really works amazing for any batch jobs and long running tasks.

It comes with a free account, so let's go to our
<a href="https://my.apify.com/sign-up" target="_blank">sign-up page</a>
and create one, if you haven't already. Don't forget to verify your email. Without it, you won't be able to run any projects.

Once you're in, you might be prompted by our in-app help to walk through a step-by-step guide into some of our new features. Feel free to finish that, if you'd like, but once you're done, click on the **Actors** tab in the left menu. You might be tempted to go directly to Crawlers, because what the heck are **Actors**, right? Bear with me, **Actors** are the tool that you really want! To read more about them, see: [What is an Actor](./whatisanactor).

### Creating a new project
In the page that shows after clicking on Actors in the left menu, choose **Create new**. Give it a name in the form that opens, let's say, `my-new-actor`. Disregard all the available options for now and save your changes.

Now click on the **Sources** tab at the top. Disregard the version and environment variables inputs for now and proceed directly to **Source code**. This is where you develop the actor, if you choose not to do it locally. Just press **Run** below the **Source code** panel. It will automatically build and run the example source code. You should start seeing log messages that represent the build and after the build is complete, log messages of the running actor. Feel free to check out the other **Run** tabs, such as **Info**, where you can find useful information about the run, or **Key-value-store**, where the actor's **INPUT** and **OUTPUT** are stored.

Good job. You're now ready to run your own source code on the Apify Platform. For more information visit the
<a href="https://www.apify.com/docs/actor" target="_blank">Actor documentation page</a>,
where you'll find everything about the platform's various options.

## First crawler
Whether you've chosen to develop locally or in the cloud, it's time to start writing some actual source code. But before we do, let me just briefly introduce all the Apify SDK classes necessary to make it happen.

### The general idea
There are 3 crawler classes available for use in the Apify SDK. [`BasicCrawler`](../api/basiccrawler), [`CheerioCrawler`](../api/cheeriocrawler) and [`PuppeteerCrawler`](../api/puppeteercrawler). We'll talk about their differences later. Now, let's talk about what they have in common.

All the crawlers' general idea is to go to a web page, open it, do some stuff there, save some results and continue to the next page, until it's done its job. So each time the crawler needs to find answers to two questions: **Where should I go?** and **What should I do there?**. Answering those two questions is the only setup mandatory to run the crawlers.

### The Where - `Request`, `RequestList` and `RequestQueue`
All crawlers use instances of the [`Request`](../api/request) class to determine where they need to go. Each request may hold a lot of information, but at the very least, it must hold a URL - a web page to open. But having only one URL would not make sense for crawling. We need to either have a pre-existing list of our own URLs that we wish to visit, perhaps a thousand, or a million, or we need to build this list dynamically as we crawl, adding more and more URLs to the list as we progress.

A representation of the pre-existing list is an instance of the [`RequestList`](../api/requestlist) class. It is a static, immutable list of URLs and other metadata (see the [`Request`](../api/request) object) that the crawler will visit, one by one, retrying whenever an error occurs, until there are no more `Requests` to process.

[`RequestQueue`](../api/requestqueue) on the other hand, represents a dynamic queue of `Requests`. One that can be updated at runtime by adding more pages - `Requests` to process. This allows the crawler to open one page, extract interesting URLs, such as links to other pages on the same domain, add them to the queue (called *enqueuing*) and repeat this process to build a queue of tens of thousands or more URLs while knowing only a single one at the beginning.

`RequestList` and `RequestQueue` are essential for the crawler's operation. There is no other way to supply `Requests` = "pages to crawl" to the crawlers. At least one of them always needs to be provided while setting up. You can also use both at the same time, if you wish.

### The What - `handlePageFunction`
The `handlePageFunction` is the brain of the crawler. It tells it what to do at each and every page it visits. Generally it handles extraction of data from the page, processing the data, saving it, calling APIs, doing calculations and whatever else you need it to do, really.

The `handlePageFunction` is provided by you, the user, and invoked automatically by the crawler for each `Request` from either the `RequestList` or `RequestQueue`. It always receives a single argument and that is a plain `Object`. Its properties change depending on the used crawler class, but it always includes at least the `request` property, which represents the currently crawled `Request` instance (i.e. the URL the crawler is visiting and related metadata) and the `autoscaledPool` property, which is an instance of the [`AutoscaledPool`](../api/autoscaledpool) class and we'll talk about it in detail later.

```js
// The object received as a single argument by the handlePageFunction
{
    request: Request,
    autoscaledPool: AutoscaledPool
}
```

### Putting it all together
Enough theory! Let's put some of those hard learned facts into practice. We learned above that we need `Requests` and a `handlePageFunction` to setup a crawler. We will also use the [`Apify.main()`](../api/apify#module_Apify.main) function. It's not mandatory, but it makes our life easier. We'll learn about it in detail later on.

Let's start super easy. Visit one page, get its title and close. First of all we need to require Apify, to make all of its features available to us:

```js
const Apify = require('apify');
```

Easy right? It doesn't get much more difficult, trust me. For the purposes of this tutorial, we'll be scraping our own webpage <a href="https://www.apify.com" target="_blank">https://www.apify.com</a>. Now, to get there, we need a `Request` with the page's URL in one of our sources, `RequestList` or `RequestQueue`. Let's go with `RequestQueue` for now.

```js
const Apify = require('apify');

// This is how you use the Apify.main() function.
Apify.main(async () => {
    // First we create the request queue instance.
    const requestQueue = await Apify.openRequestQueue();
    // And then we add a request to it.
    await requestQueue.addRequest({ url: 'https://www.apify.com' });
});
```
> If you're not familiar with the `async` and `await` keywords used in the example, trust that it is a native syntax in modern JavaScript and you can [learn more about it here](https://nikgrozev.com/2017/10/01/async-await/).

The [`requestQueue.addRequest()`](../api/requestqueue#RequestQueue+addRequest) function automatically converts the plain object we passed to it to a `Request` instance, so now we have a `requestQueue` that holds one `request` which points to `https://www.apify.com`. Now we need the `handlePageFunction`.

```js
// We'll define the function separately so it's more obvious.
const handlePageFunction = async ({ request, $ }) => {
    // This should look familiar if you ever worked with jQuery.
    // We're just getting the text content of the <title> HTML element.
    const title = $('title').text();
    
    console.log(`The title of "${request.url}" is: ${title}.`);
}
```

Wait, where did the `$` come from? Remember what we learned about the `handlePageFunction` earlier. It expects a plain `Object` as an argument that will always have a `request` property, but it will also have other properties, depending on the chosen crawler class. Well, `$` is a property provided by the `CheerioCrawler` class which we'll set up right now.

```js
const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.apify.com' });
    
    const handlePageFunction = async ({ request, $ }) => {
        const title = $('title').text();
    
        console.log(`The title of "${request.url}" is: ${title}.`);
    }
    
    // Set up the crawler, passing a single options object as an argument.
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageFunction
    });
    
    await crawler.run();
});
```

And we're done! You just created your first crawler from scratch. It will download the HTML of `https://www.apify.com`, find the `<title>` element, get its text content and print it to console. Good job!

To run the code locally, copy and paste the code, if you haven't already typed it in yourself, to the `main.js` file in the `my-new-project` we created earlier and run `apify run` from that project's directory.

To run the code on Apify Platform, just replace the original example with your new code and hit Run.

Whichever environment you choose, you should see the message `The title of "https://www.apify.com" is: Web Scraping, Data Extraction and Automation - Apify.` printed to the screen. If you do, congratulations and let's move onto some bigger challenges! And if you feel like you don't really know what just happened there, no worries, it will all become clear when you learn more about the `CheerioCrawler`.


## CheerioCrawler aka jQuery crawler
This is the crawler that we used in our earlier example. Our simplest and also the fastest crawling solution. If you're familiar with `jQuery`, you'll understand `CheerioCrawler` in minutes. <a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a> is essentially `jQuery` for Node.js. It offers the same API, including the familiar `$` object. You can use it, as you would `jQuery`, for manipulating the DOM of a HTML page. In crawling, you'll mostly use it to select the right elements and extract their text values - the data you're interested in. But `jQuery` runs in a browser and attaches directly to the browser's DOM. Where does `cheerio` get its HTML? This is where the `Crawler` part of `CheerioCrawler` comes in.


> TO BE CONTINUED ...
