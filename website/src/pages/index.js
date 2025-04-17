/* eslint-disable max-len */
import { PageMetadata } from '@docusaurus/theme-common';
import Head from '@docusaurus/Head';

import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import React, { useState } from 'react';

import styles from './index.module.css';
import HomepageCliExample from '../components/Homepage/HomepageCliExample';
import HomepageCtaSection from '../components/Homepage/HomepageCtaSection';
import HomepageHeroSection from '../components/Homepage/HomepageHeroSection';
import LanguageInfoWidget from '../components/Homepage/LanguageInfoWidget';
import LanguageSwitch from '../components/Homepage/LanguageSwitch';
import RunnableCodeBlock from '../components/RunnableCodeBlock';

import PythonHomePageExample from '!!raw-loader!roa-loader!./home_page_example.py';

function LanguageGetStartedSection() {
    return (
        <section className={styles.languageGetStartedSection}>
            <LanguageInfoWidget
                language="JavaScript"
                command="npx crawlee create my-crawler"
                githubUrl="https://github.com/apify/crawlee"
                to="/js"
            />
            <div className={styles.dashedSeparatorVertical} />
            <LanguageInfoWidget
                language="Python"
                command="pipx run 'crawlee[cli]' create my-crawler"
                githubUrl="https://github.com/apify/crawlee-python"
                to="https://crawlee.dev/python"
            />
        </section>
    );
}

const jsExample = `import { PlaywrightCrawler } from 'crawlee';

// PlaywrightCrawler crawls the web using a headless browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
    // Use the requestHandler to process each of the crawled pages.
    async requestHandler({ request, page, enqueueLinks, pushData, log }) {
        const title = await page.title();
        log.info(\`Title of \${request.loadedUrl} is '\${title}'\`);

        // Save results as JSON to \`./storage/datasets/default\` directory.
        await pushData({ title, url: request.loadedUrl });

        // Extract links from the current page and add them to the crawling queue.
        await enqueueLinks();
    },

    // Uncomment this option to see the browser window.
    // headless: false,

    // Comment this option to scrape the full website.
    maxRequestsPerCrawl: 20,
});

// Add first URL to the queue and start the crawl.
await crawler.run(['https://crawlee.dev']);

// Export the whole dataset to a single file in \`./result.csv\`.
await crawler.exportData('./result.csv');

// Or work with the data directly.
const data = await crawler.getData();
console.table(data.items);
`;

function CodeExampleSection() {
    const [activeOption, setActiveOption] = useState('JavaScript');
    return (
        <>
            <section className={styles.codeExampleSection}>
                <div
                    className={styles.dashedSeparatorVertical}
                    style={{ height: '46px', placeSelf: 'center' }}
                />
                <div className={styles.languageSwitchContainer}>
                    <LanguageSwitch
                        options={['JavaScript', 'Python']}
                        onChange={(option) => setActiveOption(option)}
                    />
                </div>
                <div className={styles.fadedOutSeparator} />
                <div className={styles.decorativeRow} />
                <div className={styles.codeBlockContainer}>
                    {activeOption === 'JavaScript' && (
                        <RunnableCodeBlock
                            className={styles.codeBlock}
                            type="playwright"
                            language="javascript"
                        >
                            {{
                                code: jsExample,
                                hash: 'eyJ1IjoiRWdQdHczb2VqNlRhRHQ1cW4iLCJ2IjoxfQ.eyJpbnB1dCI6IntcbiAgICBcImNvZGVcIjogXCJpbXBvcnQgeyBQbGF5d3JpZ2h0Q3Jhd2xlciB9IGZyb20gJ2NyYXdsZWUnO1xcblxcbi8vIENyYXdsZXIgc2V0dXAgZnJvbSB0aGUgcHJldmlvdXMgZXhhbXBsZS5cXG5jb25zdCBjcmF3bGVyID0gbmV3IFBsYXl3cmlnaHRDcmF3bGVyKHtcXG4gICAgLy8gVXNlIHRoZSByZXF1ZXN0SGFuZGxlciB0byBwcm9jZXNzIGVhY2ggb2YgdGhlIGNyYXdsZWQgcGFnZXMuXFxuICAgIGFzeW5jIHJlcXVlc3RIYW5kbGVyKHsgcmVxdWVzdCwgcGFnZSwgZW5xdWV1ZUxpbmtzLCBwdXNoRGF0YSwgbG9nIH0pIHtcXG4gICAgICAgIGNvbnN0IHRpdGxlID0gYXdhaXQgcGFnZS50aXRsZSgpO1xcbiAgICAgICAgbG9nLmluZm8oYFRpdGxlIG9mICR7cmVxdWVzdC5sb2FkZWRVcmx9IGlzICcke3RpdGxlfSdgKTtcXG5cXG4gICAgICAgIC8vIFNhdmUgcmVzdWx0cyBhcyBKU09OIHRvIC4vc3RvcmFnZS9kYXRhc2V0cy9kZWZhdWx0XFxuICAgICAgICBhd2FpdCBwdXNoRGF0YSh7IHRpdGxlLCB1cmw6IHJlcXVlc3QubG9hZGVkVXJsIH0pO1xcblxcbiAgICAgICAgLy8gRXh0cmFjdCBsaW5rcyBmcm9tIHRoZSBjdXJyZW50IHBhZ2VcXG4gICAgICAgIC8vIGFuZCBhZGQgdGhlbSB0byB0aGUgY3Jhd2xpbmcgcXVldWUuXFxuICAgICAgICBhd2FpdCBlbnF1ZXVlTGlua3MoKTtcXG4gICAgfSxcXG5cXG4gICAgLy8gVW5jb21tZW50IHRoaXMgb3B0aW9uIHRvIHNlZSB0aGUgYnJvd3NlciB3aW5kb3cuXFxuICAgIC8vIGhlYWRsZXNzOiBmYWxzZSxcXG5cXG4gICAgLy8gQ29tbWVudCB0aGlzIG9wdGlvbiB0byBzY3JhcGUgdGhlIGZ1bGwgd2Vic2l0ZS5cXG4gICAgbWF4UmVxdWVzdHNQZXJDcmF3bDogMjAsXFxufSk7XFxuXFxuLy8gQWRkIGZpcnN0IFVSTCB0byB0aGUgcXVldWUgYW5kIHN0YXJ0IHRoZSBjcmF3bC5cXG5hd2FpdCBjcmF3bGVyLnJ1bihbJ2h0dHBzOi8vY3Jhd2xlZS5kZXYnXSk7XFxuXFxuLy8gRXhwb3J0IHRoZSBlbnRpcmV0eSBvZiB0aGUgZGF0YXNldCB0byBhIHNpbmdsZSBmaWxlIGluXFxuLy8gLi9zdG9yYWdlL2tleV92YWx1ZV9zdG9yZXMvcmVzdWx0LmNzdlxcbmNvbnN0IGRhdGFzZXQgPSBhd2FpdCBjcmF3bGVyLmdldERhdGFzZXQoKTtcXG5hd2FpdCBkYXRhc2V0LmV4cG9ydFRvQ1NWKCdyZXN1bHQnKTtcXG5cXG4vLyBPciB3b3JrIHdpdGggdGhlIGRhdGEgZGlyZWN0bHkuXFxuY29uc3QgZGF0YSA9IGF3YWl0IGNyYXdsZXIuZ2V0RGF0YSgpO1xcbmNvbnNvbGUudGFibGUoZGF0YS5pdGVtcyk7XFxuXCJcbn0iLCJvcHRpb25zIjp7ImNvbnRlbnRUeXBlIjoiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOCIsIm1lbW9yeSI6NDA5Nn19.WKB14SjgTceKYyhONw2oXTkiOao6X4-UAS7cIuwqGvo',
                            }}
                        </RunnableCodeBlock>
                    )}
                    {activeOption === 'Python' && (
                        <RunnableCodeBlock className={styles.codeBlock} type="python" language="python">
                            {PythonHomePageExample}
                        </RunnableCodeBlock>
                    )}
                </div>
                <div className={styles.dashedSeparator} />
                <div className={styles.decorativeRow} />
            </section>

            <HomepageCliExample
                example={
                    activeOption === 'JavaScript'
                        ? `npx crawlee create my-crawler`
                        : `pipx run 'crawlee[cli]' create my-crawler`
                }
            />
        </>
    );
}

const PAGE_TITLE = 'Crawlee · Build reliable crawlers. Fast.';

export default function Home() {
    const { siteConfig } = useDocusaurusContext();
    return (
        <Layout description={siteConfig.description}>
            <PageMetadata image="/img/crawlee-og.png" />
            <Head>
                <title>{PAGE_TITLE}</title>
            </Head>
            <div id={styles.homepageContainer}>
                <HomepageHeroSection />
                <LanguageGetStartedSection />
                <div className={styles.dashedSeparator} />
                <CodeExampleSection />
                <div className={styles.dashedSeparator}>
                    <div
                        className={styles.dashedDecorativeCircle}
                        id={styles.ctaDecorativeCircle}
                    />
                </div>
                <HomepageCtaSection showJs showPython />
            </div>
        </Layout>
    );
}
