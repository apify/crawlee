---
slug: netflix-show-recommender
title: 'Building a Netflix show recommender using Crawlee and React'
tags: [community]
description: 'Create a Netflix show recommendation system using Crawlee to scrape the data, JavaScript to code, and React to build the front end.'
image: ./img/create-netflix-show-recommender.png
author: Ayush Thakur
authorTitle: Community Member @ Apify
authorURL: https://github.com/ayush2390
authorImageURL: https://avatars.githubusercontent.com/u/43995654?v=4
authorTwitter: JSAyushThakur
---

# Building a Netflix web show recommender with Crawlee and React

In this blog, we'll guide you through the process of using Vite and Crawlee to build a website that recommends Netflix shows based on their categories and genres. To do that, we will first scrape the shows and categories from Netflix using Crawlee, and then visualize the scraped data in a React app built with Vite. By the end of this guide, you'll have a functional web show recommender that can provide Netflix show suggestions.

:::note
One of our community members wrote this blog as a contribution to Crawlee Blog. If you want to contribute blogs like these to Crawlee Blog, please reach out to us on our [discord channel](https://apify.com/discord).
:::

![How to scrape Netflix using Crawlee and React to build a show recommender](./img/create-netflix-show-recommender.png)

<!-- truncate -->

Let’s get started!

## Prerequisites

To use Crawlee, you need to have Node.js 16 or higher version.

:::tip
Before we start this tutorial, we recommend you [visit Crawlee's GitHub](https://github.com/apify/crawlee) and check out the codebase and installation guide. If you like Crawlee, do give us a star. 
:::

You can install the latest version of Node.js from the [official website](https://nodejs.org/en/). This great [Node.js installation guide](https://blog.apify.com/how-to-install-nodejs/) gives you tips to avoid issues later on. 

## Creating React app

First, we will create a React app (for the front end) using Vite. Run this command in the terminal to create it:

```
npx create-vite@latest
```

You can check out the [Vite Docs](https://vitejs.dev/guide/) to create a React app.

Once the React app is created, open it in VS Code.

![react](./img/react.png)

This will be the structure of your React app.

Run `npm run dev` command in the terminal to run the app.

![viteandreact](./img/viteandreact.png)

This will be the output displayed.

## Adding Scraper code

As per our project requirements, we will scrape the genres and the titles of the shows available on Netflix.

Let’s start building the scraper code.

### Installation

Run this command to install `crawlee`:

```
npm install crawlee
```

Crawlee utilizes Cheerio for [HTML parsing and scraping](https://crawlee.dev/blog/scrapy-vs-crawlee#html-parsing-and-scraping) of static websites. While faster and [less resource-intensive](https://crawlee.dev/docs/guides/scaling-crawlers), it can only scrape websites that do not require JavaScript rendering, making it unsuitable for SPAs (single page applications).

Additionally, Crawlee supports headless browser libraries like [Playwright](https://playwright.dev/) and [Puppeteer](https://pptr.dev/) for scraping of websites that are JavaScript-rendered. 

After installing the libraries, it’s time to create the scraper code.

Create a file in `src` directory and name it `scraper.js`. The entire scraper code will be created in this file.

### Scraping genres

To scrape the genres, we will utilize the [browser DevTools](https://developer.mozilla.org/en-US/docs/Learn/Common`questions/Tools`and`setup/What`are`browser`developer`tools) to identify the tags and CSS selectors targeting the genre elements on the Netflix website.

![genre](./img/genre.png)

Here, we can observe that the name of the genre is captured by a `span` tag with `nm-collections-row-name` class. So we can use the `span.nm-collections-row-name` selector to capture this and similar elements.

```js
// Use parseWithCheerio for efficient HTML parsing
const $ = await parseWithCheerio();
// Extract genre titles
const titles = $(".nm-collections-row-name").map((_, el) => $(el).text().trim()).get();
```

This will give us the list of all the genres stored in the `titles` array.

### Scraping shows

To scrape the titles of shows, we will use the same method we used for scraping genres. Let’s find out the tag capturing the shows’ names.

![title](./img/title.png)

Here, we can observe that the title of the show is captured by the `span` tag having `nm-collections-title-name` class. So we can use the `span.nm-collections-title-name` selector to capture this and similar elements.

```js
// Extract show titles
const shows = $(".nm-collections-title-name").map((_, el) => $(el).text().trim()).get();
```

This will scrape the title of all the shows and store it in the `shows` array.

Since the Netflix page we scraped has exactly 40 shows for each genre, we will create arrays of 40 shows.

```js
// Prepare data for pushing
const allShows = [];
let genreShows = [];
shows.forEach((show) => {
    genreShows.push(show);
    if (genreShows.length === 40) {
    allShows.push(genreShows);
    genreShows = [];
    }
});
if (genreShows.length > 0) {
    allShows.push(genreShows);
}
```

This code takes a large list of shows in `shows` and breaks them into groups of 40 in `genreShows`, storing these groups in the `allShows` array.

### Storing data

Now we have all the data that we want for our project and it’s time to store or save the scraped data. To store the data, Crawlee comes with a `pushData()` method.

The [pushData()](https://crawlee.dev/docs/introduction/saving-data) method creates a storage folder in the project directory and stores the scraped data in JSON format.

```js
await pushData({
      genre: titles,
      shows: allShows,
    });
```  

This will save the `titles` and `totalShows` arrays as values in the `genre` and `shows` keys.

Here’s the full code that we will use in our project:

```js
import { CheerioCrawler, log, Dataset } from 'crawlee';

const crawler = new CheerioCrawler({
  requestHandler: async ({ request, parseWithCheerio, pushData }) => {
    log.info(`Processing: ${request.url}`);

    // Use parseWithCheerio for efficient HTML parsing
    const $ = await parseWithCheerio();

    // Extract genre titles
    const titles = $('.nm-collections-row-name')
      .map((_, el) => $(el).text().trim())
      .get();

    // Extract show titles
    const shows = $('.nm-collections-title-name')
      .map((_, el) => $(el).text().trim())
      .get();

    // Prepare data for pushing
    const allShows = [];
    let genreShows = [];
    shows.forEach((show) => {
      genreShows.push(show);
      if (genreShows.length === 40) {
        allShows.push(genreShows);
        genreShows = [];
      }
    });
    if (genreShows.length > 0) {
      allShows.push(genreShows);
    }

    await pushData({
      genre: titles,
      shows: allShows,
    });
  },

  // Limit crawls for efficiency
  // maxRequestsPerCrawl: 20,
});

await crawler.run(['https://www.netflix.com/in/browse/genre/1191605']);
await Dataset.exportToJSON('results');
```

Now, we will run Crawlee to scrape the website. Before running Crawlee, we need to tweak the `package.json` file. We will add the `start` script targeting the `scraper.js` file to run Crawlee.

Add the following code in `'scripts'` object:

```
'start': 'node src/scraper.js'
```

and save it. Now run this command to run Crawlee to scrape the data:

```sh
npm start
```

After running this command, you will see a `storage` folder with the `key_value_stores/default/results.json` file. The scrapped data will be stored in JSON format in this file.

Now we can use this JSON data and display it in the `App.jsx` component to create the project.

In the `App.jsx` component, we will import `jsonData` from the `results.json` file:

```js
import { useState } from 'react';
import './App.css';
import jsonData from '../storage/key_value_stores/default/results.json';

function HeaderAndSelector({ handleChange }) {
  return (
    <>
      <h1 className='header'>Netflix Web Show Recommender</h1>
      <div className='genre-selector'>
        <select onChange={handleChange} className='select-genre'>
          <option value=''>Select your genre</option>
          {jsonData[0].genre.map((genre, key) => {
            return (
              <option key={key} value={key}>
                {genre}
              </option>
            );
          })}
        </select>
      </div>
    </>
  );
}

function App() {
  const [count, setCount] = useState(null);

  const handleChange = (event) => {
    const value = event.target.value;
    if (value) setCount(parseInt(value));
  };

  // Validate count to ensure it is within the bounds of the jsonData.shows array
  const isValidCount = count !== null && count <= jsonData[0].shows.length;

  return (
    <div className='app-container'>
      <HeaderAndSelector handleChange={handleChange} />
      <div className='shows-container'>
        {isValidCount && (
          <>
            <div className='shows-list'>
              <ul>
                {jsonData[0].shows[count].slice(0, 20).map((show, index) => (
                  <li key={index} className='show-item'>
                    {show}
                  </li>
                ))}
              </ul>
            </div>
            <div className='shows-list'>
              <ul>
                {jsonData[0].shows[count].slice(20).map((show, index) => (
                  <li key={index} className='show-item'>
                    {show}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
```

In this code snippet, the `genre` array is used to display the list of genres. User can select their desired genre and based upon that a list of web shows available on Netflix will be displayed using the `shows` array.

Make sure to update CSS on the `App.css` file from here: [https://github.com/ayush2390/web-show-recommender/blob/main/src/App.css](https://github.com/ayush2390/web-show-recommender/blob/main/src/App.css)

and download and save this image file in main project folder: [Download Image](https://raw.githubusercontent.com/ayush2390/web-show-recommender/main/Netflix.png)

Our project is ready!

## Result

Now, to run your project on localhost, run this command:

```
npm run dev
```

This command will run your project on localhost. Here is a demo of the project:

![result](./img/result.gif)

Project link - [https://github.com/ayush2390/web-show-recommender](https://github.com/ayush2390/web-show-recommender)

In this project, we used Crawlee to scrape Netflix; similarly, Crawlee can be used to scrape single application pages (SPAs) and JavaScript-rendered websites. The best part is all of this can be done while coding in JavaScript/TypeScript and using a single library.

If you want to learn more about Crawlee, go through the [documentation](https://crawlee.dev/docs/quick-start) and this step-by-step [Crawlee web scraping tutorial](https://blog.apify.com/crawlee-web-scraping-tutorial/) from Apify.