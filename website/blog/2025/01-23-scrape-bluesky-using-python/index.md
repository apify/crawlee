---
slug: scrape-bluesky
title: 'How to scrape Bluesky with Python'
tags: [community]
description: 'Learn how to scrape Bluesky using Crawlee for Python'
image: ''
authors: [MaxB]
---

[Bluesky](https://bsky.app/) is an emerging social network developed by former members of the [Twitter](https://x.com/) development team. The platform has been showing significant growth recently, reaching 132.9 million visits according to [SimilarWeb](https://www.similarweb.com/website/bsky.app/#traffic). Like Twitter, Bluesky generates a vast amount of data that can be used for analysis. In this article, we'll explore how to collect this data using [Crawlee for Python](https://github.com/apify/crawlee-python).

:::note

One of our community members wrote this blog as a contribution to the Crawlee Blog. If you would like to contribute blogs like these to Crawlee Blog, please reach out to us on our [discord channel](https://apify.com/discord).

:::

## Prerequisites

- Basic understanding of web scraping concepts
- [UV](https://docs.astral.sh/uv/) version 0.5.11 or higher
- Crawlee for Python v0.5.0 or higher
- Bluesky account for API access

### Project setup

1. If you don't have UV installed yet, follow the [guide](https://docs.astral.sh/uv/getting-started/installation/) or use this command:

    ```bash
    curl -LsSf https://astral.sh/uv/install.sh | sh
    ```

2. Install standalone Python using UV:

    ```bash
    uv install python 3.13
    ```

3. Create a new project and install Crawlee for Python:

    ```bash
    uv init bluesky-crawlee --package
    cd bluesky-crawlee
    uv add crawlee
    ```

We've created a new isolated Python project with all the necessary dependencies for Crawlee.

## Development of the Bluesky crawler in Python

### 1. Identifying the data source

When first exploring Bluesky, it might be disconcerting to find that the [main page](https://bsky.app/) lacks a search function without authentication. The same applies when trying to access individual [posts](https://bsky.app/profile/github-trending-js.bsky.social/post/3ldbe7b3ict2v).

Even if you navigate directly to the [search page](https://bsky.app/search?q=apify), while you'll see data, you'll encounter a limitation - the site doesn't allow viewing results beyond the first page.

Fortunately, Bluesky provides a well-documented [API](https://docs.bsky.app/docs/get-started) that's accessible to any registered user without additional permissions. This is what we'll use for data collection.

### 2. Creating a session for API interaction

For secure API interaction, you need to create a dedicated app password instead of using your main account password.

Go to Settings -> Privacy and Security -> [App Passwords](https://bsky.app/settings/app-passwords) and click *Add App Password*.
Important: Save the generated password, as it won't be visible after creation.

Next, create environment variables to store your credentials:

- app password
- user identifier (found in your profile and Bluesky URL, for example: [`mantisus.bsky.social`](https://bsky.app/profile/mantisus.bsky.social))

```bash
export BLUESKY_APP_PASSWORD=your_app_password
export BLUESKY_IDENTIFIER=your_identifier
```

Using the [createSession](https://docs.bsky.app/docs/api/com-atproto-server-create-session), [deleteSession](https://docs.bsky.app/docs/api/com-atproto-server-delete-session) endpoints and [`httpx`](https://www.python-httpx.org/), we can create a session for API interaction.

Let's create a class with the necessary methods:

```python
import traceback
import asyncio
import os
import json

import httpx
from yarl import URL
from crawlee.crawlers import HttpCrawler, HttpCrawlingContext
from crawlee.http_clients import HttpxHttpClient
from crawlee import ConcurrencySettings, Request
from crawlee.storages import Dataset

# Environment variables for authentication
# BLUESKY_APP_PASSWORD: App-specific password generated from Bluesky settings
# BLUESKY_IDENTIFIER: Your Bluesky handle (e.g., username.bsky.social)
BLUESKY_APP_PASSWORD = os.getenv('BLUESKY_APP_PASSWORD')
BLUESKY_IDENTIFIER = os.getenv('BLUESKY_IDENTIFIER')


class BlueskyCrawler:
    """
    A crawler class for extracting data from Bluesky social network using their official API.
    
    This crawler manages authentication, concurrent requests, and data collection for both
    posts and user profiles. It uses separate datasets for storing post and user information.
    """

    def __init__(self) -> None:

        self._crawler: HttpCrawler | None = None

        self._users: Dataset | None = None
        self._posts: Dataset | None = None

        # Variables for storing session data
        self._domain: str | None = None
        self._did: str | None = None
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._handle: str | None = None

    def create_session(self) -> None:
        """Create credentials for the session."""
        url = 'https://bsky.social/xrpc/com.atproto.server.createSession'
        headers = {
            "Content-Type": "application/json",
            }
        data = {
            "identifier": BLUESKY_IDENTIFIER,
            "password": BLUESKY_APP_PASSWORD
            }

        response = httpx.post(url, headers=headers, json=data)
        response.raise_for_status()

        data = response.json()

        self._domain = data['didDoc']['service'][0]['serviceEndpoint']
        self._did = data['didDoc']['id']
        self._access_token = data['accessJwt']
        self._refresh_token = data['refreshJwt']
        self._handle = data['handle']

    def delete_session(self) -> None:
        """Delete the current session."""
        url = f'{self._domain}/xrpc/com.atproto.server.deleteSession'
        headers = {
            "Content-Type": "application/json",
            "authorization": f"Bearer {self._refresh_token}"
            }

        response = httpx.post(url, headers=headers)
        response.raise_for_status()
```

The session expires after 2 hours of creation, so if you plan for your crawler to run longer, you should also add a method for [refresh](https://docs.bsky.app/docs/api/com-atproto-server-refresh-session).

### 3. Configuring Crawlee for Python for data collection

Since we'll be using the official API, we don't need to worry about being blocked by Bluesky. However, we should be careful with the number of requests to avoid overloading Bluesky's servers, so we'll configure [`ConcurrencySettings`](https://crawlee.dev/python/api/class/ConcurrencySettings). We'll also configure [`HttpxHttpClient`](https://crawlee.dev/python/api/class/HttpxHttpClient) to use custom headers with the current session's `Authorization`.

We'll use 2 endpoints for data collection: [searchPosts](https://docs.bsky.app/docs/api/app-bsky-feed-search-posts) for posts and [getProfile](https://docs.bsky.app/docs/api/app-bsky-actor-get-profile). If you plan to scale the crawler, you can use [getProfiles](https://docs.bsky.app/docs/api/app-bsky-actor-get-profiles) for user data, but in this case, you'll need to implement deduplication logic. When each link is unique, Crawlee for Python handles this for you.

When collecting data, I want to separately obtain user and post data, so we'll use different [`Dataset`](https://crawlee.dev/python/api/class/Dataset) instances for storage.

```python
async def init_crawler(self) -> None:
    """Initialize the crawler."""
    if not self._did:
        raise ValueError('Session not created.')

    # Initialize the datasets
    self._users = await Dataset.open(name='users')
    self._posts = await Dataset.open(name='posts')

    # Initialize the crawler
    self._crawler = HttpCrawler(
        max_requests_per_crawl=500,
        http_client=HttpxHttpClient(
            # Set headers for API requests
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._access_token}",
                "Connection": "Keep-Alive",
                "accept-encoding": "gzip, deflate, br, zstd",
            }
        ),
        # Configuring concurrency of crawling requests
        concurrency_settings=ConcurrencySettings(
            min_concurrency=10,
            desired_concurrency=10,
            max_concurrency=30,
            max_tasks_per_minute=200,
        ))

    self._crawler.router.default_handler(self._search_handler) # Handler for search requests
    self._crawler.router.handler(label='user')(self._user_handler) # Handler for user requests
```

### 4. Implementing handlers for data collection

Now we can implement the handler for searching posts. We'll save the retrieved posts in `self._posts` and create requests for user data, placing them in the crawler's queue. We also need to handle pagination by forming the link to the next search page.

```python
async def _search_handler(self, context: HttpCrawlingContext) -> None:
    context.log.info(f'Processing search {context.request.url} ...')

    data = json.loads(context.http_response.read())

    if 'posts' not in data:
        context.log.warning(f'No posts found in response: {context.request.url}')
        return

    user_requests = {}
    posts = []

    for post in data['posts']:
        # Add user request if not already added in current context
        if post['author']['did'] not in user_requests:
            user_requests[post['author']['did']] =Request.from_url(
                url=f"{self._domain}/xrpc/app.bsky.actor.getProfile?actor={post['author']['did']}",
                user_data={'label': 'user'},
                )

        posts.append({
            'uri': post['uri'],
            'cid': post['cid'],
            'author_did': post['author']['did'],
            'created': post['record']['createdAt'],
            'indexed': post['indexedAt'],
            'reply_count': post['replyCount'],
            'repost_count': post['repostCount'],
            'like_count': post['likeCount'],
            'quote_count': post['quoteCount'],
            'text': post['record']['text'],
            'langs': "; ".join(post['record'].get('langs', [])),
            'reply_parent': post['record'].get('reply', {}).get('parent', {}).get('uri'),
            'reply_root': post['record'].get('reply', {}).get('root', {}).get('uri'),
        })
    
    await self._posts.push_data(posts) # Push butch posts data to the dataset
    await context.add_requests(list(user_requests.values()))

    if cursor := data.get('cursor'):

        next_url = URL(context.request.url).update_query({'cursor': cursor}) # Use yarl for update the query string

        await context.add_requests([str(next_url)])
```

When receiving user data, we'll store it in the corresponding Dataset `self._users`

```python
async def _user_handler(self, context: HttpCrawlingContext) -> None:
    context.log.info(f'Processing user {context.request.url} ...')

    data = json.loads(context.http_response.read())

    user_item = {
        'did': data['did'],
        'created': data['createdAt'],
        'avatar': data.get('avatar'),
        'description': data.get('description'),
        'display_name': data.get('displayName'),
        'handle': data['handle'],
        'indexed': data.get('indexedAt'),
        'posts_count': data['postsCount'],
        'followers_count': data['followersCount'],
        'follows_count': data['followsCount'],
    }

    await self._users.push_data(user_item)
```

### 5. Saving data to files

For saving results, we'll use the `write_to_json` method in Dataset.

```python
async def save_data(self) -> None:
    """Save the data."""
    if not self._users or not self._posts:
        raise ValueError('Datasets not initialized.')

    with open('users.json', 'w') as f:
        await self._users.write_to_json(f, indent=4)
    
    with open('posts.json', 'w') as f:
        await self._posts.write_to_json(f, indent=4)
```

### 6. Running the crawler

We have everything needed to complete the crawler. We just need a method to execute the crawling - let's call it `crawl`

```python
async def crawl(self, queries: list[str]) -> None:
    """Crawl the given URL."""
    if not self._crawler:
        raise ValueError('Crawler not initialized.')

    await self._crawler.run([f"{self._domain}/xrpc/app.bsky.feed.searchPosts?q={query}" for query in queries])
```

Let's finalize the code:

```python
async def run():
    """
    Main execution function that orchestrates the crawling process.
    
    Creates a crawler instance, manages the session, and handles the complete
    crawling lifecycle including proper cleanup on completion or error.
    """
    crawler = BlueskyCrawler()
    crawler.create_session()
    try:
        await crawler.init_crawler()
        await crawler.crawl(['python', 'apify', 'crawlee'])
        await crawler.save_data()
    except Exception:
        traceback.print_exc()
    finally:
        crawler.delete_session()


def main():
    """Entry point for the crawler application."""
    asyncio.run(run())
```

If you check your `pyproject.toml`, you'll see that UV created an entrypoint for running `bluesky-crawlee = "bluesky_crawlee:main"`, so we can run our crawler simply by executing:

```bash
uv run bluesky-crawlee
```

Let's look at sample results:

Posts

![Posts Example](./img/posts.webp)

Users

![Posts Example](./img/users.webp)

## Conclusion

We've created an efficient crawler for Bluesky using the official API. If you want to dive deeper into this topic for regular data extraction from Bluesky, I recommend exploring [custom feed generation](https://docs.bsky.app/docs/starter-templates/custom-feeds) - I think it opens up some interesting possibilities.

And if you need to quickly create a crawler that can retrieve data for various queries, you now have everything you need.

You can find the complete code in the [repository](soon)
