---
slug: scrape-google-maps
title: 'How to scrape Google Maps data using Python'
tags: [community]
description: 'Learn how to scrape google maps data using Crawlee for Python'
image: ./img/google-maps.webp
authors: [SatyamT]
---

Millions of people use Google Maps daily, leaving behind a goldmine of data just waiting to be analyzed. In this guide, I'll show you how to build a reliable scraper using Crawlee and Python to extract locations, ratings, and reviews from Google Maps, all while handling its dynamic content challenges.

:::note

One of our community members wrote this blog as a contribution to the Crawlee Blog. If you would like to contribute blogs like these to Crawlee Blog, please reach out to us on our [discord channel](https://apify.com/discord).

:::

## What data will we extract from Google Maps?

We’ll collect information about hotels in a specific city. You can also customize your search to meet your requirements. For example, you might search for "hotels near me", "5-star hotels in Bombay", or other similar queries.

![Google Maps Data Screenshot](./img/scrape-google-maps-with-crawlee-screenshot-data-to-scrape.webp)

We’ll extract important data, including the hotel name, rating, review count, price, a link to the hotel page on Google Maps, and all available amenities. Here’s an example of what the extracted data will look like:

```json
{
    "name": "Vividus Hotels, Bangalore",
    "rating": "4.3",
    "reviews": "633",
    "price": "₹3,667",
    "amenities": [
        "Pool available",
        "Free breakfast available",
        "Free Wi-Fi available",
        "Free parking available"
    ],
    "link": "https://www.google.com/maps/place/Vividus+Hotels+,+Bangalore/..."
}
```
<!-- truncate -->

## Building a Google Maps scraper

Let's build a Google Maps scraper step-by-step.

:::note

Crawlee requires Python 3.9 or later.

:::

### 1. Setting up your environment

First, let's set up everything you’ll need to run the scraper. Open your terminal and run these commands:

```bash
# Create and activate a virtual environment
python -m venv google-maps-scraper

# Windows:
.\google-maps-scraper\Scripts\activate

# Mac/Linux:
source google-maps-scraper/bin/activate

# We plan to use Playwright with Crawlee, so we need to install both:
pip install crawlee "crawlee[playwright]"
playwright install
```

*If you're new to **Crawlee**, check out its easy-to-follow documentation. It’s available for both [Node.js](https://www.crawlee.dev/docs/quick-start) and [Python](https://www.crawlee.dev/python/docs/quick-start).*

::: note

Before going ahead with the project, I request to star Crawlee for Python on [GitHub](https://github.com/apify/crawlee-python/), it helps us to spread the world to fellow scraping developers. 

:::

### 2. Connecting to Google Maps

Let's see the steps to connect to Google Maps.

**Step 1: Setting up the crawler**

The first step is to configure the crawler. We're using [`PlaywrightCrawler`](https://www.crawlee.dev/python/api/class/PlaywrightCrawler) from Crawlee, which gives us powerful tools for automated browsing. We set `headless=False` to make the browser visible during scraping and allow 5 minutes for the pages to load.

```python
from crawlee.playwright_crawler import PlaywrightCrawler
from datetime import timedelta

# Initialize crawler with browser visibility and timeout settings
crawler = PlaywrightCrawler(
    headless=False,  # Shows the browser window while scraping
    request_handler_timeout=timedelta(
        minutes=5
    ),  # Allows plenty of time for page loading
)
```

**Step 2: Handling each page**

This function defines how each page is handled when the crawler visits it. It uses `context.page` to navigate to the target URL.

```python
async def scrape_google_maps(context):
    """
    Establishes connection to Google Maps and handles the initial page load
    """
    page = context.page
    await page.goto(context.request.url)
    print("Connected to:", context.request.url)
```

**Step 3: Launching the crawler**

Finally, the main function brings everything together. It creates a search URL, sets up the crawler, and starts the scraping process.

```python
import asyncio

async def main():
    # Prepare the search URL
    search_query = "hotels in bengaluru"
    start_url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"

    # Tell the crawler how to handle each page it visits
    @crawler.router.default_handler
    async def default_handler(context):
        await scrape_google_maps(context)

    # Start the scraping process
    await crawler.run([start_url])

if __name__ == "__main__":
    asyncio.run(main())
```

Let’s combine the above code snippets and save them in a file named `gmap_scraper.py`:

```python
from crawlee.playwright_crawler import PlaywrightCrawler
from datetime import timedelta
import asyncio

async def scrape_google_maps(context):
    """
    Establishes connection to Google Maps and handles the initial page load
    """
    page = context.page
    await page.goto(context.request.url)
    print("Connected to:", context.request.url)

async def main():
    """
    Configures and launches the crawler with custom settings
    """
    # Initialize crawler with browser visibility and timeout settings
    crawler = PlaywrightCrawler(
        headless=False,  # Shows the browser window while scraping
        request_handler_timeout=timedelta(
            minutes=5
        ),  # Allows plenty of time for page loading
    )

    # Tell the crawler how to handle each page it visits
    @crawler.router.default_handler
    async def default_handler(context):
        await scrape_google_maps(context)

    # Prepare the search URL
    search_query = "hotels in bengaluru"
    start_url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"

    # Start the scraping process
    await crawler.run([start_url])

if __name__ == "__main__":
    asyncio.run(main())
```

Run the code using:

```bash
$ python3 gmap_scraper.py
```

When everything works correctly, you'll see the output like this:

![Connect to page](./img/scrape-google-maps-with-crawlee-screenshot-connect-to-page.png)

### 3. Understanding Google Maps internal code structure

Before we dive into scraping, let's understand exactly what elements we need to target. When you search for hotels in Bengaluru, Google Maps organizes hotel information in a specific structure. Here's a detailed breakdown of how to locate each piece of information.

**Hotel name:**

![Hotel name](./img/scrape-google-maps-with-crawlee-screenshot-name.webp)

**Hotel rating:**

![Hotel rating](./img/scrape-google-maps-with-crawlee-screenshot-ratings.webp)

**Hotel review count:**

![Hotel Review Count](./img/scrape-google-maps-with-crawlee-screenshot-reviews.webp)

**Hotel URL:**

![Hotel URL](./img/scrape-google-maps-with-crawlee-screenshot-url.webp)

**Hotel Price:**

![Hotel Price](./img/scrape-google-maps-with-crawlee-screenshot-price.webp)

**Hotel amenities:**

This returns multiple elements as each hotel has several amenities. We'll need to iterate through these.

![Hotel amenities](./img/scrape-google-maps-with-crawlee-screenshot-amenities.webp)

**Quick tips:**

- Always verify these selectors before scraping, as Google might update them.
- Use Chrome DevTools (F12) to inspect elements and confirm selectors.
- Some elements might not be present for all hotels (like prices during the off-season).

### 4. Scraping Google Maps data using identified selectors

Let's build a scraper to extract detailed hotel information from Google Maps. First, create the core scraping function to handle data extraction.

*gmap_scraper.py:*

```python
async def scrape_google_maps(context) -> None:
    page = context.page
    print(f"\nProcessing URL: {context.request.url}\n")

    # Wait for content to load
    await page.wait_for_selector(".Nv2PK", timeout=30000)
    await page.wait_for_timeout(2000)

    # Get all hotel listings
    listings = await page.query_selector_all(".Nv2PK")
    print(f"Found {len(listings)} hotels\n")

    # Process each hotel listing
    for listing in listings:
        # Extract details for each listing
        data = {
            "name": (
                await (await listing.query_selector(".qBF1Pd")).inner_text()
                if await listing.query_selector(".qBF1Pd")
                else None
            ),
            "rating": (
                await (await listing.query_selector(".MW4etd")).inner_text()
                if await listing.query_selector(".MW4etd")
                else "N/A"
            ),
            "reviews": (
                (await (await listing.query_selector(".UY7F9")).inner_text())
                .replace("(", "")
                .replace(")", "")
                if await listing.query_selector(".UY7F9")
                else "N/A"
            ),
            "price": (
                await (await listing.query_selector(".wcldff")).inner_text()
                if await listing.query_selector(".wcldff")
                else "N/A"
            ),
            "link": (
                await (await listing.query_selector("a.hfpxzc")).get_attribute("href")
                if await listing.query_selector("a.hfpxzc")
                else "N/A"
            ),
            "amenities": [
                await amenity.get_attribute("aria-label")
                for amenity in await listing.query_selector_all(".dc6iWb")
                if await amenity.get_attribute("aria-label")
            ],
        }

        # Pretty-print the data
        print(json.dumps(data, indent=4))
        print("\n")
```

In the code:

- `query_selector`: Returns first DOM element matching CSS selector, useful for single items like a name or rating
- `query_selector_all`: Returns all matching elements, ideal for multiple items like amenities
- `inner_text()`: Extracts text content
- Some hotels might not have all the information available - we handle this with 'N/A’

When you run this script, you'll see output similar to this:

```json
{
    "name": "GRAND KALINGA HOTEL",
    "rating": "4.2",
    "reviews": "1,171",
    "price": "\u20b91,760",
    "link": "https://www.google.com/maps/place/GRAND+KALINGA+HOTEL/data=!4m10!3m9!1s0x3bae160e0ce07789:0xb15bf736f4238e6a!5m2!4m1!1i2!8m2!3d12.9762259!4d77.5786043!16s%2Fg%2F11sp32pz28!19sChIJiXfgDA4WrjsRao4j9Db3W7E?authuser=0&hl=en&rclk=1",
    "amenities": [
        "Pool available",
        "Free breakfast available",
        "Free Wi-Fi available",
        "Free parking available"
    ]
}
```

### 5. Scroll to load more

When scraping Google Maps, you'll notice that not all results load at once. Let's handle this infinite scroll pagination!

First, we need a function that can handle the scrolling and detect when we've hit the bottom. Copy-paste this new function in the `gmap_scraper.py` file:

```python
async def load_more_items(page) -> bool:
    # Locate the scrollable feed container
    feed = await page.query_selector('div[role="feed"]')
    if not feed:
        return False
    
    # Get the current scroll position
    prev_scroll = await feed.evaluate("(element) => element.scrollTop")

    # Scroll down to load more items
    await feed.evaluate("(element) => element.scrollTop += 800")
    await page.wait_for_timeout(2000)  # Allow content to load

    # Check if the page actually scrolled
    new_scroll = await feed.evaluate("(element) => element.scrollTop")
    if new_scroll <= prev_scroll:  # No further scroll means end of listings
        return False
    
    # Extra wait for dynamic content to appear
    await page.wait_for_timeout(1000)
    return True
```

Run this code using:

```bash
$ python3 gmap_scraper.py
```

You should see an output like this:

![scrape-google-maps-with-crawlee-screenshot-handle-pagination.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/63b6fe41-a503-4e50-9b1e-caa1e011ae25/cba448f3-f260-4cb4-b068-93ca4a9d54de/d905f2ab-d448-460d-b8eb-f68d2b2f842d.png)

### 6. Exporting Google Maps data to JSON

Once you've successfully scraped data from Google Maps, it's important to save that data in a format that is both accessible and easy to work with. JSON is an excellent choice for this purpose.

Here's a simple code that saves your scraped data to a JSON file:

```python
import json

# Your scraped data will be stored in this list
all_data = [
    ...
]

# Save data to JSON file
with open('google_maps_data.json', 'w', encoding='utf-8') as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)
```

Here's what your exported JSON file will look like:

```json
[
  {
    "name": "Vividus Hotels, Bangalore",
    "rating": "4.3",
    "reviews": "633",
    "price": "₹3,667",
    "amenities": [
      "Pool available",
      "Free breakfast available",
      "Free Wi-Fi available",
      "Free parking available"
    ],
    "link": "https://www.google.com/maps/place/Vividus+Hotels+,+Bangalore/..."
  }
]
```

### 7. Using proxies for Google Maps scraping

When scraping Google Maps at scale, using proxies is very helpful. Here are a few key reasons why:

1. **Avoid IP blocks**: Google Maps can detect and block IP addresses that make an excessive number of requests in a short time. Using proxies helps you stay under the radar.
2. **Bypass rate limits**: Google implements strict limits on the number of requests per IP address. By rotating through multiple IPs, you can maintain a consistent scraping pace without hitting these limits.
3. **Access location-specific data**: Different regions may display different data on Google Maps. Proxies allow you to view listings as if you are browsing from any specific location.

Here's a simple implementation using Crawlee's built-in proxy management. Update your previous code with this to use proxy settings.

```python
from crawlee.playwright_crawler import PlaywrightCrawler
from crawlee.proxy_configuration import ProxyConfiguration

# Configure your proxy settings
proxy_configuration = ProxyConfiguration(
    proxy_urls=[
        "http://username:password@proxy.provider.com:12345",
        # Add more proxy URLs as needed
    ]
)

# Initialize crawler with proxy support
crawler = PlaywrightCrawler(
    headless=True,
    request_handler_timeout=timedelta(minutes=5),
    proxy_configuration=proxy_configuration,
)
```

Here, I use a proxy to scrape hotel data in New York City.

![Using a proxy](./img/scrape-google-maps-with-crawlee-screenshot-proxies.webp)

Here's an example of data scraped from New York City hotels using proxies:

```json
{
  "name": "The Manhattan at Times Square Hotel",
  "rating": "3.1",
  "reviews": "8,591",
  "price": "$120",
  "amenities": [
    "Free parking available",
    "Free Wi-Fi available",
    "Air-conditioned available",
    "Breakfast available"
  ],
  "link": "https://www.google.com/maps/place/..."
}
```

### 8. Project: Interactive hotel analysis dashboard

After scraping hotel data from Google Maps, you can build an interactive dashboard that helps analyze hotel trends. Here’s a preview of how the dashboard works:

![Final dashboard](./img/scrape-google-maps-with-crawlee-screenshot-hotel-analysis-dashboard.gif)

Find the complete info for this dashboard on GitHub: [Hotel Analysis Dashboard](https://github.com/triposat/Hotel-Analytics-Dashboard).

### 9. Now you’re ready to put everything into action!

Take a look at the complete scripts in my GitHub Gist:

- [Basic Scraper](https://gist.github.com/triposat/9a6fb03130f3c4332bab71b72a973940)
- [Code with Proxy Integration](https://gist.github.com/triposat/6c554b13c787a55348b48b6bfc5459c0)
- [Hotel Analysis Dashboard](https://gist.github.com/triposat/13ce4b05c36512e69b5602833e781a6c)

To make it all work:

1. **Run the basic scraper or proxy-integrated scraper**: This will collect the hotel data and store it in a JSON file.
2. **Run the dashboard script**: Load your JSON data and view it interactively in the dashboard.

## Wrapping up and next steps

You've successfully built a comprehensive Google Maps scraper that collects and processes hotel data, presenting it through an interactive dashboard. Now you’ve learned about:

- Using Crawlee with Playwright to navigate and extract data from Google Maps
- Using proxies to scale up scraping without getting blocked
- Storing the extracted data in JSON format
- Creating an interactive dashboard to analyze hotel data

We’ve handpicked some great resources to help you further explore web scraping:

- [Scrapy vs. Crawlee: Choosing the right tool](https://www.crawlee.dev/blog/scrapy-vs-crawlee)
- [Mastering proxy management with Crawlee](https://wwww.crawlee.dev/blog/proxy-management-in-crawlee)
- [Think like a web scraping expert: 12 pro tips](https://www.crawlee.dev/blog/web-scraping-tips)
- [Building a LinkedIn job scraper](https://www.crawlee.dev/blog/linkedin-job-scraper-python)