import React from 'react';
import clsx from 'clsx';
import Admonition from '@theme/Admonition';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import Highlights from '../components/Highlights';
import styles from './index.module.css';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';

function Hero() {
    return (
        <header className={clsx('container', styles.heroBanner)}>
            <div className="row padding-horiz--md">
                <div className="col col--7">
                    <div className={clsx(styles.relative, 'row')}>
                        <div className="col">
                            <h1 className={styles.tagline}>
                                Crawlee is a web<br /> scraping and browser<br /> automation library
                            </h1>
                            <h1 className={styles.tagline}>
                                Crawlee is a <span>web<br /> scraping</span> and <span>browser<br /> automation</span> library
                            </h1>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col">
                            <h2>It helps you build reliable crawlers. Fast.</h2>
                        </div>
                    </div>
                    <div className="row">
                        <div className="col">
                            <div className={styles.heroButtons}>
                                <Link to="docs/introduction" className={styles.getStarted}>Get Started</Link>
                                <iframe src="https://ghbtns.com/github-btn.html?user=apify&repo=crawlee&type=star&count=true&size=large" frameBorder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={clsx(styles.relative, 'col', 'col--5')}>
                    <div className={styles.logoBlur}>
                        <img src={require('../../static/img/logo-blur.png').default} className={clsx(styles.hideSmall)} />
                    </div>
                    <div className={styles.codeBlock}>
                        <CodeBlock className="language-bash">
                            npx crawlee create my-crawler
                        </CodeBlock>
                    </div>
                </div>
            </div>
        </header>
    );
}

function Features() {
    return (
        <section className={clsx('container', styles.features)}>
            <div className="row">
                <div className="col col--6">
                    <h2>Reliable crawling 🏗️</h2>
                    <p>
                        Crawlee won't fix broken selectors for you (yet), but it helps you <b>build and maintain your crawlers faster</b>.
                    </p>
                    <p>
                        When a website adds JavaScript rendering, you don't have to rewrite everything, only switch to
                        one of the browser crawlers. When you later find a great API to speed up your crawls, flip the switch back.
                    </p>
                    <p>
                        It keeps your proxies healthy by rotating them smartly with good fingerprints that make your crawlers
                        look human-like. It's not unblockable,
                        but <a href="https://blog.apify.com/daltix-python-vs-apify-sdk/" target="_blank" rel="noreferrer"><b>it will save you money in the long run</b></a>.
                    </p>
                    <p>
                        Crawlee is built by people who scrape for a living and use it every day to scrape millions of pages.
                        <a href="https://discord.com/invite/jyEM2PRvMU" target="_blank" rel="noreferrer"><b> Meet our community on Discord</b></a>.
                    </p>
                </div>
                <div className="col col--6">
                    <div className="video-container">
                        <LiteYouTubeEmbed
                            id="g1Ll9OlFwEQ"
                            params="autoplay=1&autohide=1&showinfo=0&rel=0"
                            title="Crawlee, the web scraping and browser automation library"
                            poster="maxresdefault"
                            webp
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

const example = `import { PlaywrightCrawler, Dataset } from 'crawlee';

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
    // Use the requestHandler to process each of the crawled pages.
    async requestHandler({ request, page, enqueueLinks, log }) {
        const title = await page.title();
        log.info(\`Title of \${request.loadedUrl} is '\${title}'\`);

        // Save results as JSON to ./storage/datasets/default
        await Dataset.pushData({ title, url: request.loadedUrl });

        // Extract links from the current page
        // and add them to the crawling queue.
        await enqueueLinks();
    },
    // Uncomment this option to see the browser window.
    // headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run(['https://crawlee.dev']);
`;

function ActorExample() {
    return (
        <section className={clsx(styles.try, 'container')}>
            <div className="col">
                <h2>Try Crawlee out 👾</h2>
                <Admonition type="caution" title="before you start">
                    Crawlee requires <a href="https://nodejs.org/en/" target="_blank" rel="noreferrer"><b>Node.js 16 or higher</b></a>.
                </Admonition>
                <p>
                    The fastest way to try Crawlee out is to use the <b>Crawlee CLI</b> and choose the <b>Getting started example</b>.
                    The CLI will install all the necessary dependencies and add boilerplate code for you to play with.
                </p>
                <CodeBlock className="language-bash">
                    npx crawlee create my-crawler
                </CodeBlock>
                <p>
                    If you prefer adding Crawlee <b>into your own project</b>, try the example below.
                    Because it uses <code>PlaywrightCrawler</code> we also need to install Playwright.
                    It's not bundled with Crawlee to reduce install size.
                </p>
                <CodeBlock className="language-bash">
                    npm install crawlee playwright
                </CodeBlock>
                <CodeBlock className="language-typescript">
                    {example}
                </CodeBlock>
            </div>
        </section>
    );
}

const npmInstall = `npm install apify
npm install -G apify-cli`;
const exampleActor = `import { PlaywrightCrawler, Dataset } from 'crawlee';

// import the \`Actor\` class from the Apify SDK
import { Actor } from 'apify';

// set up the integration to Apify
await Actor.init();

// crawler setup from the previous example
const crawler = new PlaywrightCrawler({
    // ...
});
await crawler.run(['https://crawlee.dev']);

// once finished, clean up the environment
await Actor.exit();
`;

const apifyPush = `apify login # so the CLI knows you
apify init  # and the Apify platform understands your project
apify push  # time to ship it!`;

function Deployment() {
    return (
        <section className={clsx(styles.try, 'container')}>
            <div className="col">
                <h2>Deploy to the cloud ☁️</h2>
                <p>
                    Crawlee is developed by <a href="https://apify.com" rel="dofollow" target="_blank"><b>Apify</b></a>, the web scraping and automation platform.
                    You can deploy a <b>Crawlee</b> project wherever you want, but using the <a href="https://console.apify.com/" target="_blank"><b>Apify
                    platform</b></a> will give you the best experience. With a few simple steps, you can convert your Crawlee project into a so
                    called <b>Actor</b>. Actors are serverless micro-apps that are easy to develop, run, share, and integrate. The infra, proxies,
                    and storages are ready to go. <a href="https://apify.com/actors" target="_blank">Learn more about Actors</a>.
                </p>
                <p>
                    1️⃣ First, install the <b>Apify SDK</b> to your project, as well as the <b>Apify CLI</b>. The SDK will help with the Apify integration,
                    while the CLI will help us with the initialization and deployment.
                </p>
                <CodeBlock className="language-bash">
                    {npmInstall}
                </CodeBlock>
                <p>
                    2️⃣ The next step is to add <code>Actor.init()</code> to the beginning of your main script and <code>Actor.exit()</code> to the end of it.
                    This will enable the integration to the Apify Platform, so the <a href="https://apify.com/storage" target="_blank">cloud
                    storages</a> (e.g. <code>RequestQueue</code>) will be used. The code should look like this:
                </p>
                <CodeBlock className="language-typescript">
                    {exampleActor}
                </CodeBlock>
                <p>
                    3️⃣ Then you will need to <a href="https://console.apify.com/sign-up" target="_blank">sign up for the Apify account</a>. Once you have it,
                    use the Apify CLI to log in via <code>apify login</code>. The last two steps also involve the Apify CLI. Call the <code>apify
                    init</code> first, which will add Apify config to your project, and finally run the <code>apify push</code> to deploy it.
                </p>
                <CodeBlock className="language-bash">
                    {apifyPush}
                </CodeBlock>
            </div>
        </section>
    );
}

export default function Home() {
    const SvgLogo = require('../../static/img/crawlee-logo.svg').default;
    const { siteConfig } = useDocusaurusContext();
    return (
        <Layout
            title={`${siteConfig.title} · ${siteConfig.tagline}`}
            description={siteConfig.description}>
            <Hero />
            <Features />
            <Highlights />
            <ActorExample />
            <Deployment />
            <div className="container">
                <div className="row">
                    <div className="col text--center padding-top--lg padding-bottom--xl">
                        <SvgLogo className={styles.bottomLogo} />
                    </div>
                </div>
            </div>
        </Layout>
    );
}
