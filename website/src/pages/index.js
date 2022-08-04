import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';
import Hightlights from '../components/Highlights';

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
                <div className="col col--4">
                    <h2>Easy crawling</h2>
                </div>
            </div>
            <div className="row">
                <div className="col col--4">
                    <p>
                        There are three main classes that you can use to start crawling the web in no time. Need to crawl plain HTML?
                        Use the blazing fast CheerioCrawler. For complex websites that use React, Vue or other front-end javascript libraries and require
                        JavaScript execution, spawn a headless browser with PlaywrightCrawler or PuppeteerCrawler.
                    </p>
                </div>
                <div className="col col--8 text--center">
                    <img src={require('../../static/img/chrome_scrape.gif').default} className={clsx(styles.hideSmall)} />
                </div>
            </div>
        </section>
    );
}

const example = `import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks }) {
        const title = await page.title();
        console.log(\`Title of $\{request.loadedUrl} is '$\{title}'\`);

        // save some results
        await Dataset.pushData({ title, url: request.loadedUrl });

        // enqueue all links targeting the same hostname
        await enqueueLinks();
    }
});

await crawler.run(['https://crawlee.dev']);
`;

function ActorExample() {
    return (
        <section className={clsx(styles.try, 'container')}>
            <div className="col">
                <h2>Try it out</h2>
                <p>Install Crawlee into a Node.js project. You must have Node.js 16 or higher installed.</p>
                <CodeBlock className="language-bash">
                    npm install crawlee playwright
                </CodeBlock>
                <p>Copy the following code into a file in the project, for example <code>main.mjs</code>:</p>
                <CodeBlock className="language-typescript">
                    {example}
                </CodeBlock>
                <p>Execute the following command in the project's folder and watch it recursively crawl Crawlee website with Puppeteer and Chromium.</p>
                <CodeBlock className="language-bash">
                    node main.mjs
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
            <Hightlights />
            <Features />
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
