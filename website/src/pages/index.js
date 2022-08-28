import React from 'react';
import clsx from 'clsx';
import Admonition from '@theme/Admonition';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import Highlights from '../components/Highlights';
import ProductHuntCard from '../components/ProductHuntCard';
import styles from './index.module.css';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';
import { default as GHLogo } from '../../static/img/logo-gh.svg';
import { default as HNLogo } from '../../static/img/logo-hn.svg';
import { default as PHLogo } from '../../static/img/logo-ph.svg';
import { default as ZoomLogo } from '../../static/img/logo-zoom.svg';

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

function TopBanner() {
    const HNLogo = require('../../static/img/logo-hn.svg').default;
    const PHLogo = require('../../static/img/logo-ph.svg').default;
    const GHLogo = require('../../static/img/logo-gh.svg').default;
    return (
        <section className={clsx('container', styles.topBanner)}>
            <div className="row">
                <div className="col col--8">
                    <div className={clsx('container', styles.textRow)}>
                        <div className="row">
                            <h1>🎉 Crawlee is out!</h1>
                        </div>
                        <div className="row">
                            Check Crawlee on{' '}
                            <Link to="https://github.com/apify/crawlee">
                                <GHLogo className={styles.ghLogoSmall} />
                                GitHub
                            </Link>,&nbsp;
                            <Link to="https://news.ycombinator.com/item?id=32561127">
                                <HNLogo className={styles.hnLogoSmall} />
                                Hacker News
                            </Link>
                            &nbsp;and&nbsp;
                            <Link to="https://www.producthunt.com/posts/crawlee">
                                <PHLogo className={styles.phLogoSmall} />
                                Product Hunt
                            </Link>!
                        </div>
                    </div>
                </div>
                <div className={clsx('col col--4', styles.phcard)}>
                    <ProductHuntCard />
                </div>
            </div>
        </section>
    );
}

function Features() {
    return (
        <section className={clsx('container', styles.features)}>
            <div className="row">
                <div className="col col--6">
                    <h2>Reliable crawling 🏗</h2>
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

export default function Home() {
    const SvgLogo = require('../../static/img/crawlee-logo.svg').default;
    const { siteConfig } = useDocusaurusContext();
    return (
        <Layout
            title={`${siteConfig.title} · ${siteConfig.tagline}`}
            description={siteConfig.description}>
            <TopBanner />
            <Hero />
            <Features />
            <Highlights />
            <ActorExample />
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
