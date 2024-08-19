---
slug: common-problems-in-web-scraping
title: 'Current problems and mistakes of web scraping in Python and tricks to solve them!'
tags: [community]
description: 'Current problems and mistakes that developers encounters while scraping and crawling the internet with the advises and solution from an web scraping expert.'
image: ./img/problems-in-scraping.webp
author: Max
authorTitle: Community Member of Crawlee and web scraping expert
authorURL: https://github.com/Mantisus
authorImageURL: https://avatars.githubusercontent.com/u/34358312?v=4
---

## Introduction

Greetings! I'm [Max](https://apify.com/mantisus), a Python developer from Ukraine, a developer with expertise in web scraping, data analysis, and processing.

My journey in web scraping started in 2016 when I was solving lead generation challenges for a small company. Initially, I used off-the-shelf solutions such as [Import.io](https://www.import.io/) and Kimono Labs. However, I quickly encountered limitations such as blocking, inaccurate data extraction, and performance issues. This led me to learn Python. Those were the glory days when [`requests`](https://requests.readthedocs.io/en/latest/) and [`lxml`](https://lxml.de/)/[`beautifulsoup`](https://beautiful-soup-4.readthedocs.io/en/latest/) were enough to extract data from most websites. And if you knew how to work with threads, you were already a respected expert :)

:::note
One of our community members wrote this blog as a contribution to Crawlee Blog. If you want to contribute blogs like these to Crawlee Blog, please reach out to us on our [discord channel](https://apify.com/discord).
:::

As a freelancer, I've built small solutions and large, complex data mining systems for products over the years.

Today, I want to discuss the realities of [web scraping with Python in 2024](https://blog.apify.com/web-scraping-python/). We'll look at the mistakes I sometimes see and the problems you'll encounter and offer solutions to some of them.

Let's get started.

Just take `requests` and `beautifulsoup` and start making a lot of money...

No, this is not that kind of article.

<!-- truncate -->

## 1. "I got a 200 response from the server, but it's an unreadable character set."

Yes, it can be surprising. But I've seen this message from customers and developers six years ago, four years ago, and in 2024. I read a post on Reddit just a few months ago about this issue.

Let's look at a simple code example. This will work for `requests`, [`httpx`](https://www.python-httpx.org/), and [`aiohttp`](https://docs.aiohttp.org/en/stable/client.html#aiohttp-client) with a clean installation and no extensions.

```python
import httpx

url = 'https://www.wayfair.com/'

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
}

response = httpx.get(url, headers=headers)

print(response.content[:10])
```

The print result will be similar to:

```bash
b'\x83\x0c\x00\x00\xc4\r\x8e4\x82\x8a'
```

It's not an error - it's a perfectly valid server response. It's encoded somehow.

The answer lies in the `Accept-Encoding` header. In the example above, I just copied it from my browser, so it lists all the compression methods my browser supports: "gzip, deflate, br, zstd". The Wayfair backend supports compression with "br", which is [Brotli](https://github.com/google/brotli), and uses it as the most efficient method.

This can happen if none of the libraries listed above have a `Brotli` dependency among their standard dependencies. However, they all support decompression from this format if you already have `Brotli` installed.

Therefore, it's sufficient to install the appropriate library:

```bash
pip install Brotli
```

This will allow you to get the result of the print:

```bash
b'<!DOCTYPE '
```

You can obtain the same result for `aiohttp` and `httpx` by doing the installation with extensions:

```bash
pip install aiohttp[speedups]
pip install httpx[brotli]
```

By the way, adding the `brotli` dependency was my first contribution to [`crawlee-python`](https://github.com/apify/crawlee-python). They use `httpx` as the base HTTP client.

You may have also noticed that, a new supported data compression format [`zstd`](https://github.com/facebook/zstd) appeared some time ago I haven't seen any backends that use it yet, but `httpx` will support decompression in versions above 0.28.0. I already use it to compress server response dumps in my projects; it shows incredible efficiency in asynchronous solutions with [`aiofiles`](https://github.com/Tinche/aiofiles).

The most common solution to this situation that I've seen is for developers to simply stop using the `Accept-Encoding` header, thus getting an uncompressed response from the server. Why is that bad? The [main page of Wayfair](https://www.wayfair.com/) takes about 1 megabyte uncompressed and about 0.165 megabytes compressed.

Therefore, in the absence of this header:

- You increase the load on your internet bandwidth.
- If you use a proxy with traffic, you increase the cost of each of your requests.
- You increase the load on the server's internet bandwidth.
- You're revealing yourself as a scraper, since any browser uses compression.

But I think the problem is a bit deeper than that. Many web scraping developers simply don't understand what the headers they use do. So if this applies to you, when you're working on your next project, read up on these things; they may surprise you.

## 2. "I use headers as in an incognito browser, but I get a 403 response". Here's Johnn-... I mean, Cloudflare

Yes, that's right. 2023 brought us not only Large Language Models like ChatGPT but also improved [Cloudflare](https://www.cloudflare.com/) protection.

Those who have been scraping the web for a long time might say, "Well, we've already dealt with DataDome, PerimeterX, InCapsula, and the like."

But Cloudflare has changed the rules of the game. It is one of the largest CDN providers in the world, serving a huge number of sites. Therefore, its services are available to many sites with a fairly low entry barrier. This makes it radically different from the technologies mentioned earlier, which were implemented purposefully when they wanted to protect the site from scraping.

Cloudflare is the reason why, when you start reading another course on "How to do web scraping using `requests` and `beautifulsoup`", you can close it immediately. Because there's a big chance that what you learn will simply not work on any "decent" website.

Let's look at another simple code example:

```python
from httpx import Client

client = Client(http2=True)

url = 'https://www.g2.com/'

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
}

response = client.get(url, headers=headers)

print(response)
```

Of course, the response would be [403](https://blog.apify.com/web-scraping-how-to-solve-403-errors/).

What if we use [`curl`](https://curl.se/docs/manpage.html)?

```bash
curl -XGET -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Connection: keep-alive' 'https://www.g2.com/' -s -o /dev/null -w "%{http_code}\n"
```

Also 403.

Why is this happening?

Because Cloudflare uses TLS fingerprints of many HTTP clients popular among developers, site administrators can also customize how aggressively Cloudflare blocks clients based on these fingerprints.

For `curl`, we can solve it like this:

```bash
curl -XGET -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Connection: keep-alive' 'https://www.g2.com/' --tlsv1.3 -s -o /dev/null -w "%{http_code}\n"
```

You might expect me to write here an equally elegant solution for `httpx`, but no. About six months ago, you could do the "dirty trick" and change the basic [`httpcore`](https://www.encode.io/httpcore/) parameters that it passes to [`h2`](https://github.com/python-hyper/h2), which are responsible for the HTTP2 handshake. But now, as I'm writing this article, that doesn't work anymore.

There are different approaches to getting around this. But let's solve it by manipulating TLS.

The bad news is that all the Python clients I know of use the [`ssl`](https://docs.python.org/3/library/ssl.html) library to handle TLS. And it doesn't give you the ability to manipulate TLS subtly.

The good news is that the Python community is great and implements solutions that exist in other programming languages.

### The first way to solve this problem is to use [tls-client](https://github.com/FlorianREGAZ/Python-Tls-Client)

This Python wrapper around the [Golang library](https://github.com/bogdanfinn/tls-client) provides an API similar to `requests`.

```bash
pip install tls-client
```

```python
from tls_client import Session

client = Session(client_identifier="firefox_120")

url = 'https://www.g2.com/'

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
}

response = client.get(url, headers=headers)

print(response)
```

The `tls_client` supports TLS presets for popular browsers, the relevance of which is maintained by developers. To use this, you must pass the necessary `client_identifier`. However, the library also allows for subtle manual manipulation of TLS.

### The second way to solve this problem is to use [curl_cffi](https://github.com/yifeikong/curl_cffi)

This wrapper around the C library patches curl and provides an API similar to `requests`.

```bash
pip install curl_cffi
```

```python
from curl_cffi import requests

url = 'https://www.g2.com/'

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
}

response = requests.get(url, headers=headers, impersonate="chrome124")

print(response)
```

curl_cffi also provides [TLS presets](https://curl-cffi.readthedocs.io/en/latest/impersonate.html#supported-browser-versions) for some browsers, which are specified via the `impersonate` parameter. It also provides options for [subtle manual manipulation of TLS](https://curl-cffi.readthedocs.io/en/latest/impersonate.html#how-to-use-my-own-fingerprints-other-than-the-builtin-ones-e-g-okhttp).

I think someone just said, "They're literally doing the same thing." That's right, and they're both still very raw.

Let's do some simple comparisons:

| Feature | tls_client | curl_cffi |
|:-------:|:----------:|:---------:|
|TLS preset| + | + |
|TLS manual| + | + |
|async support| - | + |
|big company support| - | + |
|number of contributors| - | + |

Obviously, `curl_cffi` wins in this comparison. But as an active user, I have to say that sometimes there are some pretty strange errors that I'm just unsure how to deal with. And let's be honest, so far, they are both pretty raw.

I think we will soon see other libraries that solve this problem.

One might ask, what about [`Scrapy`](https://scrapy.org/)? I'll be honest: I don't really keep up with their updates. But I haven't heard about [Zyte](https://www.zyte.com/) doing anything to bypass TLS fingerprinting. So out of the box `Scrapy` will also be blocked, but nothing is stopping you from using `curl_cffi` in your Scrapy Spider.

## 3. What about headless browsers and Cloudflare Turnstile?

Yes, sometimes we need to use headless browsers. Although I'll be honest, from my point of view, they are used too often even when clearly not necessary.

Even in a headless situation, the folks at Cloudflare have managed to make life difficult for the average web scraper by creating a monster called Cloudflare Turnstile.

To test different tools, you can use this demo [page](https://2captcha.com/demo/cloudflare-turnstile).

To quickly test whether a library works with the browser, you should start by checking the usual non-headless mode. You don't even need to use automation; just open the site using the desired library and act manually.

What libraries are worth checking out for this?

### Candidate #1 [Playwright](https://playwright.dev/python/docs/intro) + [playwright-stealth](https://github.com/AtuboDad/playwright_stealth)

It'll be blocked and won't let you solve the captcha.

Playwright is a great library for browser automation. However the developers explicitly state that they don't plan to develop it as a web scraping tool.

And I haven't heard of any Python projects that effectively solve this problem.

### Candidate #2 [undetected_chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver)

It'll be blocked and won't let you solve the captcha.

This is a fairly common library for working with headless browsers in Python, and in some cases, it allows bypassing Cloudflare Turnstile. But on the target website, it is blocked. Also, in my projects, I've encountered at least two other cases where Cloudflare blocked undetected_chromedriver.

In general, undetected_chromedriver is a good library for your projects, especially since it uses good old Selenium under the hood.

### Candidate #3 [botasaurus-driver](https://github.com/omkarcloud/botasaurus-driver)

It allows you to go past the captcha after clicking.

I don't know how its developers pulled this off, but it works. Its main feature is that it was developed specifically for web scraping. It also has a higher-level library to work with - [botasaurus](https://github.com/omkarcloud/botasaurus).

On the downside, so far, it's pretty raw, and botasaurus-driver has no documentation and has a rather challenging API to work with.

To summarize, most likely, your main library for headless browsing will be `undetected_chromedriver`. But in some particularly challenging cases, you might need to use `botasaurus`.

## 4. What about frameworks?

High-level frameworks are designed to speed up and ease development by allowing us to focus on business logic, although we often pay the price in flexibility and control.

So, what are the frameworks for web scraping in 2024?

### [Scrapy](https://docs.scrapy.org/en/latest/)

It's impossible to talk about Python web scraping frameworks without mentioning Scrapy. Scrapinghub (now Zyte) first released it in 2008. For 16 years, it has been developed as an open-source library upon which development companies built their business solutions.

Talking about the advantages of `Scrapy`, you could write a separate article. But I will emphasize the two of them:

- The huge amount of tutorials that have been released over the years
- Middleware libraries are written by the community and are extending their functionality. For example, [`scrapy-playwright`](https://github.com/scrapy-plugins/scrapy-playwright).

But what are the downsides?

In recent years, Zyte has been focusing more on developing its own platform. `Scrapy` mostly gets fixes only.
- Lack of development towards bypassing anti-scraping systems. You have to implement them yourself, but then, why do you need a framework?
- `Scrapy` was originally developed with the asynchronous framework `Twisted`. Partial support for `asyncio` was added only in [`version 2.0`](https://docs.scrapy.org/en/latest/topics/asyncio.html). Looking through the source code, you may notice some workarounds that were added for this purpose.

Thus, `Scrapy` is a good and proven solution for sites that are not protected against web scraping. You will need to develop and add the necessary solutions to the framework in order to bypass anti-scraping measures.

### [Botasaurus](https://www.omkar.cloud/botasaurus/)

A new framework for web scraping using browser automation, built on [`botasaurus-driver`](https://github.com/omkarcloud/botasaurus-driver). The initial commit was made on May 9, 2023.

Let's start with its advantages:

- Allows you to bypass any Claudflare protection as well as many others using `botasaurus-driver`.
- Good documentation for a quick start

Downsides include:

- Browser automation only, not intended for HTTP clients.
- Tight coupling with `botasaurus-driver`; you can't easily replace it with something better if it comes out in the future.
- No asynchrony, only multithreading.
- At the moment, it's quite raw and still requires fixes for stable operation.
- There are very few training materials available at the moment.

This is a good framework for quickly building a web scraper based on browser automation. It lacks flexibility and support for HTTP clients, which is crutias for users like me.

### [Crawlee-python](https://crawlee.dev/python/docs/quick-start)

A new framework for web scraping in the Python ecosystem. The initial commit was made on Jan 10, 2024, with a release in the media space on July 5, 2024.

:::tip
If you like the blog so far, please consider [giving Crawlee a star on GitHub](https://github.com/apify/crawlee), it helps us to reach and help more developers.
:::

Developed by [Apify](https://apify.com/), it is a Python adaptation of their famous JS framework [`crawlee`](https://github.com/apify/crawlee), first released on Jul 9, 2019.

As this is a completely new solution on the market, it is now in an active design and development stage. The community is also actively involved in its development. So,we can see that the use of [curl_cffi](https://github.com/apify/crawlee-python/issues/292) is already being discussed. The possibility of creating their own Rust-based client was [previously discussed](https://github.com/apify/crawlee-python/issues/80). I hope the company doesn't abandon the idea, as I personally would like to see an HTTP client for Python developed and maintained by a major company. And Rust shows itself very well as a library language for Python. Let's remember at least [`Ruff`](https://docs.astral.sh/ruff/) and [`Pydantic`](https://docs.pydantic.dev/latest/) v2.

Advantages:

The framework was developed by an established company in the web scraping market, which has well-developed expertise in this sphere.
- Support for both browser automation and HTTP clients.
- Fully asynchronous, based on `asyncio`.
- Active development phase and media activity. As developers listen to the community, it is quite important in this phase.

On a separate note, it has a pretty good modular architecture. If developers introduce the ability to switch between several HTTP clients, we will get a rather flexible framework that allows us to easily change the technologies used, with a simple implementation from the development team.

Deficiencies:

- The framework is new. There are very few training materials available at the moment.
- At the moment, it's quite raw and still requires fixes for stable operation, as well as convenient interfaces for configuration.
-There is no implementation of any means of bypassing anti-scraping systems for now other than changing sessions and proxies. But they are being discussed.

I believe that how successful `crawlee-python` turns out to depends primarily on the community. Due to the small number of tutorials, it is not suitable for beginners. However, experienced developers may decide to try it instead of `Scrapy`.

In the long run, it may turn out to be a better solution than Scrapy and Botasaurus. It already provides flexible tools for working with HTTP clients, automating browsers out of the box, and quickly switching between them. However, it lacks tools to bypass scraping protections, and their implementation in the future may be the deciding factor in choosing a framework for you.

## Conclusion

If you have read all the way to here, I assume you found it interesting and maybe even helpful :)

The industry is changing and offering new challenges, and if you are professionally involved in web scraping, you will have to keep a close eye on the situation. In some other field, you would remain a developer who makes products using outdated technologies. But in modern web scraping, you become a developer who makes web scrapers that simply don't work.

Also, don't forget that you are part of the larger Python community, and your knowledge can be useful in developing tools that make things happen for all of us. As you can see, many of the tools you need are being built literally right now.

I'll be glad to read your comments. Also, if you need a web scraping expert or do you just want to discuss the article, you can find me on the following platforms: [Github](https://github.com/Mantisus), [Linkedin](https://www.linkedin.com/in/max-bohomolov/), [Apify](https://apify.com/mantisus), [Upwork](https://www.upwork.com/freelancers/mantisus), [Contra](https://contra.com/mantisus).

Thank you for your attention :)
