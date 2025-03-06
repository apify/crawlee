/* eslint-disable max-len */
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import ThemedImage from '@theme/ThemedImage';
import React from 'react';

import commonStyles from './index.module.css';
import styles from './js.module.css';
import Button from '../components/Button';
import HomepageCliExample from '../components/Homepage/HomepageCliExample';
import HomepageCtaSection from '../components/Homepage/HomepageCtaSection';
import HomepageHeroSection from '../components/Homepage/HomepageHeroSection';
import LanguageInfoWidget from '../components/Homepage/LanguageInfoWidget';
import RiverSection from '../components/Homepage/RiverSection';
import ThreeCardsWithIcon from '../components/Homepage/ThreeCardsWithIcon';
import RunnableCodeBlock from '../components/RunnableCodeBlock';

function GetStartedSection() {
    return (
        <section className={styles.commonStyles}>
            <LanguageInfoWidget
                language="JavaScript"
                githubUrl="https://ghbtns.com/github-btn.html?user=apify&repo=crawlee&type=star&count=true&size=large"
                to="/docs/introduction"
            />
        </section>
    );
}

const example = `import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks, pushData, log }) {
        const title = await page.title();
        log.info(\`Title of \${request.loadedUrl} is '\${title}'\`);

        await pushData({ title, url: request.loadedUrl });
        await enqueueLinks();
    },

    // Uncomment this option to see the browser window.
    // headless: false,
});

await crawler.run(['https://crawlee.dev']);
`;

function CodeExampleSection() {
    return (
        <section className={commonStyles.codeExampleSection}>
            <div className={commonStyles.decorativeRow} />
            <div className={commonStyles.codeBlockContainer}>
                <RunnableCodeBlock
                    className={commonStyles.codeBlock}
                    type="playwright"
                >
                    {{
                        code: example,
                        hash: 'eyJ1IjoiRWdQdHczb2VqNlRhRHQ1cW4iLCJ2IjoxfQ.eyJpbnB1dCI6IntcbiAgICBcImNvZGVcIjogXCJpbXBvcnQgeyBQbGF5d3JpZ2h0Q3Jhd2xlciB9IGZyb20gJ2NyYXdsZWUnO1xcblxcbi8vIENyYXdsZXIgc2V0dXAgZnJvbSB0aGUgcHJldmlvdXMgZXhhbXBsZS5cXG5jb25zdCBjcmF3bGVyID0gbmV3IFBsYXl3cmlnaHRDcmF3bGVyKHtcXG4gICAgLy8gVXNlIHRoZSByZXF1ZXN0SGFuZGxlciB0byBwcm9jZXNzIGVhY2ggb2YgdGhlIGNyYXdsZWQgcGFnZXMuXFxuICAgIGFzeW5jIHJlcXVlc3RIYW5kbGVyKHsgcmVxdWVzdCwgcGFnZSwgZW5xdWV1ZUxpbmtzLCBwdXNoRGF0YSwgbG9nIH0pIHtcXG4gICAgICAgIGNvbnN0IHRpdGxlID0gYXdhaXQgcGFnZS50aXRsZSgpO1xcbiAgICAgICAgbG9nLmluZm8oYFRpdGxlIG9mICR7cmVxdWVzdC5sb2FkZWRVcmx9IGlzICcke3RpdGxlfSdgKTtcXG5cXG4gICAgICAgIC8vIFNhdmUgcmVzdWx0cyBhcyBKU09OIHRvIC4vc3RvcmFnZS9kYXRhc2V0cy9kZWZhdWx0XFxuICAgICAgICBhd2FpdCBwdXNoRGF0YSh7IHRpdGxlLCB1cmw6IHJlcXVlc3QubG9hZGVkVXJsIH0pO1xcblxcbiAgICAgICAgLy8gRXh0cmFjdCBsaW5rcyBmcm9tIHRoZSBjdXJyZW50IHBhZ2VcXG4gICAgICAgIC8vIGFuZCBhZGQgdGhlbSB0byB0aGUgY3Jhd2xpbmcgcXVldWUuXFxuICAgICAgICBhd2FpdCBlbnF1ZXVlTGlua3MoKTtcXG4gICAgfSxcXG5cXG4gICAgLy8gVW5jb21tZW50IHRoaXMgb3B0aW9uIHRvIHNlZSB0aGUgYnJvd3NlciB3aW5kb3cuXFxuICAgIC8vIGhlYWRsZXNzOiBmYWxzZSxcXG5cXG4gICAgLy8gQ29tbWVudCB0aGlzIG9wdGlvbiB0byBzY3JhcGUgdGhlIGZ1bGwgd2Vic2l0ZS5cXG4gICAgbWF4UmVxdWVzdHNQZXJDcmF3bDogMjAsXFxufSk7XFxuXFxuLy8gQWRkIGZpcnN0IFVSTCB0byB0aGUgcXVldWUgYW5kIHN0YXJ0IHRoZSBjcmF3bC5cXG5hd2FpdCBjcmF3bGVyLnJ1bihbJ2h0dHBzOi8vY3Jhd2xlZS5kZXYnXSk7XFxuXFxuLy8gRXhwb3J0IHRoZSBlbnRpcmV0eSBvZiB0aGUgZGF0YXNldCB0byBhIHNpbmdsZSBmaWxlIGluXFxuLy8gLi9zdG9yYWdlL2tleV92YWx1ZV9zdG9yZXMvcmVzdWx0LmNzdlxcbmNvbnN0IGRhdGFzZXQgPSBhd2FpdCBjcmF3bGVyLmdldERhdGFzZXQoKTtcXG5hd2FpdCBkYXRhc2V0LmV4cG9ydFRvQ1NWKCdyZXN1bHQnKTtcXG5cXG4vLyBPciB3b3JrIHdpdGggdGhlIGRhdGEgZGlyZWN0bHkuXFxuY29uc3QgZGF0YSA9IGF3YWl0IGNyYXdsZXIuZ2V0RGF0YSgpO1xcbmNvbnNvbGUudGFibGUoZGF0YS5pdGVtcyk7XFxuXCJcbn0iLCJvcHRpb25zIjp7ImNvbnRlbnRUeXBlIjoiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOCIsIm1lbW9yeSI6NDA5Nn19.WKB14SjgTceKYyhONw2oXTkiOao6X4-UAS7cIuwqGvo',
                    }}
                </RunnableCodeBlock>
            </div>
            <div className={commonStyles.dashedSeparator} />
            <div className={commonStyles.decorativeRow} />
        </section>
    );
}

const benefitsCodeBlockCrawler = `{
    useFingerprints: true,
    fingerprintOptions: {
        fingerprintGeneratorOptions: {
            browsers: [BrowserName.chrome, BrowserName.firefox],
            devices: [DeviceCategory.mobile],
            locales: ['en-US'],
        },
    },
},
`;

const benefitsCodeBlockHeadless = `const crawler = new AdaptivePlaywrightCrawler({
    renderingTypeDetectionRatio: 0.1,
    async requestHandler({ querySelector, enqueueLinks }) {
        // The crawler detects if JS rendering is needed
        // to extract this data. If not, it will use HTTP
        // for follow-up requests to save time and costs.
        const $prices = await querySelector('span.price')
        await enqueueLinks();
    },
});
`;

function BenefitsSection() {
    return (
        <section className={styles.benefitsSection}>
            <h2>What are the benefits?</h2>
            <RiverSection
                title="Unblock websites by default"
                description="Crawlee crawls stealthily with zero configuration, but you can customize its behavior to overcome any protection. Real-world fingerprints included."
                content={
                    <CodeBlock className="code-block">
                        {benefitsCodeBlockCrawler}
                    </CodeBlock>
                }

                to="/docs/guides/avoid-blocking"
            />
            <div className={commonStyles.trianglesSeparator} />
            <RiverSection
                title="Work with your favorite tools"
                description="Crawlee integrates BeautifulSoup, Cheerio, Puppeteer, Playwright, and other popular open-source tools. No need to learn new syntax."
                content={
                    <ThemedImage
                        alt="Work with your favorite tools"
                        sources={{
                            light: '/img/js_light.png',
                            dark: '/img/js_dark.png',
                        }}
                    />
                }
                reversed
                to="/docs/quick-start#choose-your-crawler"
            />
            <div className={commonStyles.trianglesSeparator} />
            <RiverSection
                title="One API for headless and HTTP"
                description="Switch between HTTP and headless without big rewrites thanks to a shared API. Or even let Adaptive crawler decide if JS rendering is needed."
                content={
                    <CodeBlock className="code-block">
                        {benefitsCodeBlockHeadless}
                    </CodeBlock>
                }
                to="/api/core"
            />
        </section>
    );
}

function OtherFeaturesSection() {
    return (
        <section className={styles.otherFeaturesSection}>
            <h2>What else is in Crawlee?</h2>
            <div className={styles.cardsWithContentContainer}>
                <div className={styles.cardsWithImageContainer}>
                    <div className={styles.cardWithImage}>
                        <ThemedImage
                            sources={{
                                light: '/img/auto-scaling-light.webp',
                                dark: '/img/auto-scaling-dark.webp',
                            }}
                            alt=""
                        />
                        <div className={styles.cardWithImageText}>
                            <h3 className={styles.cardWithImageTitle}>
                                Auto scaling
                            </h3>
                            <div className={styles.cardWithImageDescription}>
                                Crawlers automatically adjust concurrency based
                                on available system resources. Avoid memory
                                errors in small containers and run faster in
                                large ones.
                            </div>
                        </div>
                    </div>
                    <div className={styles.cardWithImage}>
                        <ThemedImage
                            sources={{
                                light: '/img/smart-proxy-light.webp',
                                dark: '/img/smart-proxy-dark.webp',
                            }}
                            alt=""
                        />
                        <div className={styles.cardWithImageText}>
                            <h3 className={styles.cardWithImageTitle}>
                                Smart proxy rotation
                            </h3>
                            <div className={styles.cardWithImageDescription}>
                                Crawlee uses a pool of sessions represented by
                                different proxies to maintain the proxy
                                performance and keep IPs healthy. Blocked
                                proxies are removed from the pool automatically.
                            </div>
                        </div>
                    </div>
                </div>
                <ThreeCardsWithIcon
                    cards={[
                        {
                            icon: (
                                <ThemedImage
                                    sources={{
                                        light: '/img/queue-light-icon.svg',
                                        dark: '/img/queue-dark-icon.svg',
                                    }}
                                    alt=""
                                />
                            ),
                            title: 'Queue and storage',
                            description:
                                'Pause and resume crawlers thanks to a persistent queue of URLs and storage for structured data.',
                        },
                        {
                            icon: (
                                <ThemedImage
                                    sources={{
                                        light: '/img/scraping-utils-light-icon.svg',
                                        dark: '/img/scraping-utils-dark-icon.svg',
                                    }}
                                    alt=""
                                />
                            ),
                            title: 'Handy scraping utils',
                            description:
                                'Sitemaps, infinite scroll, contact extraction, large asset blocking and many more utils included.',
                        },
                        {
                            icon: (
                                <ThemedImage
                                    sources={{
                                        light: '/img/routing-light-icon.svg',
                                        dark: '/img/routing-dark-icon.svg',
                                    }}
                                    alt=""
                                />
                            ),
                            title: 'Routing & middleware',
                            description:
                                'Keep your code clean and organized while managing complex crawls with a built-in router that streamlines the process.',
                        },
                    ]}
                />
            </div>
        </section>
    );
}

function DeployToCloudSection() {
    return (
        <section className={styles.deployToCloudSection}>
            <div className={styles.deployToCloudLeftSide}>
                <h2>Deploy to cloud </h2>
                <div className={styles.deployToCloudDescription}>
                    Crawlee, by Apify, works anywhere, but Apify offers the best
                    experience. Easily turn your project into an Actor—a
                    serverless micro-app with built-in infra, proxies, and
                    storage.
                </div>
                <Button
                    withIcon
                    to="https://docs.apify.com/platform/actors/development/deployment"
                >
                    Deploy to Apify
                </Button>
            </div>
            <div className={styles.deployToCloudRightSide}>
                <div
                    className={commonStyles.dashedSeparatorVertical}
                    id={styles.verticalStepLine}
                />
                <div className={styles.deployToCloudStep}>
                    <div className={styles.deployToCloudStepNumber}>
                        <div>1</div>
                    </div>
                    <div className={styles.deployToCloudStepText}>
                        Install Apify SDK and Apify CLI.
                    </div>
                </div>
                <div className={styles.deployToCloudStep}>
                    <div className={styles.deployToCloudStepNumber}>
                        <div>2</div>
                    </div>
                    <div className={styles.deployToCloudStepText}>
                        Add <pre>Actor.init()</pre> to the begining and{' '}
                        <pre>Actor.exit()</pre> to the end of your code.
                    </div>
                </div>
                <div className={styles.deployToCloudStep}>
                    <div className={styles.deployToCloudStepNumber}>
                        <div>3</div>
                    </div>
                    <div className={styles.deployToCloudStepText}>
                        Use the Apify CLI to push the code to the Apify
                        platform.
                    </div>
                </div>
            </div>
        </section>
    );
}

function BuildFastScrapersSection() {
    return (
        <section className={styles.buildFastScrapersSection}>
            <div className={commonStyles.dashedDecorativeCircle} />
            <div className={commonStyles.dashedSeparator} />
            <h2>Crawlee helps you build scrapers faster</h2>
            <ThreeCardsWithIcon
                cards={[
                    {
                        icon: (
                            <ThemedImage
                                sources={{
                                    light: '/img/zero-setup-light-icon.svg',
                                    dark: '/img/zero-setup-dark-icon.svg',
                                }}
                                alt=""
                            />
                        ),
                        title: 'Zero setup required',
                        description:
                            'Use on the templates, install Crawlee and go. No CLI required, no complex file structure, no boilerplate.',
                        actionLink: {
                            text: 'Get started',
                            href: '/docs/quick-start',
                        },
                    },
                    {
                        icon: (
                            <ThemedImage
                                sources={{
                                    light: '/img/defaults-light-icon.svg',
                                    dark: '/img/defaults-dark-icon.svg',
                                }}
                                alt=""
                            />
                        ),
                        title: 'Reasonable defaults',
                        description:
                            'Unblocking, proxy rotation and other core features are already turned on. But also very configurable.',
                        actionLink: {
                            text: 'Learn more',
                            href: '/docs/guides/configuration',
                        },
                    },
                    {
                        icon: (
                            <ThemedImage
                                sources={{
                                    light: '/img/community-light-icon.svg',
                                    dark: '/img/community-dark-icon.svg',
                                }}
                                alt=""
                            />
                        ),
                        title: 'Helpful community',
                        description:
                            'Join our Discord community of over Xk developers and get fast answers to your web scraping questions.',
                        actionLink: {
                            text: 'Join Discord',
                            href: 'https://discord.gg/jyEM2PRvMU',
                        },
                    },
                ]}
            />
        </section>
    );
}

export default function JavascriptHomepage() {
    const { siteConfig } = useDocusaurusContext();
    return (
        <Layout description={siteConfig.description}>
            <div id={commonStyles.homepageContainer}>
                <HomepageHeroSection />
                <GetStartedSection />
                <div className={commonStyles.dashedSeparator} />
                <CodeExampleSection />
                <HomepageCliExample />
                <div className={commonStyles.dashedSeparator}>
                    <div
                        className={commonStyles.dashedDecorativeCircle}
                        id={commonStyles.ctaDecorativeCircle}
                    />
                </div>
                <BenefitsSection />
                <div className={commonStyles.dashedSeparator} />
                <OtherFeaturesSection />
                <div className={commonStyles.dashedSeparator} />
                <DeployToCloudSection />
                <div className={commonStyles.dashedSeparator} />
                <BuildFastScrapersSection />
                <HomepageCtaSection showJs />
            </div>
        </Layout>
    );
}
