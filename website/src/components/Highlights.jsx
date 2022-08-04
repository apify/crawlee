import React from 'react';
import clsx from 'clsx';
import styles from './Highlights.module.css';

const FeatureList = [
    {
        title: 'Runs on JavaScript',
        Svg: require('../../static/img/features/runs-on-js.svg').default,
        description: (
            <>
                JavaScript is the language of the web. Crawlee builds on popular tools like <a href="https://www.npmjs.com/package/playwright">Playwright</a>, {' '}
                <a href="https://www.npmjs.com/package/puppeteer">Puppeteer</a> and <a href='https://www.npmjs.com/package/cheerio'>cheerio</a>,
                to deliver large-scale high-performance web scraping and crawling of any website. Works best with <b>TypeScript</b>!
            </>
        ),
    },
    {
        title: 'Automates any web workflow',
        Svg: require('../../static/img/features/automate-everything.svg').default,
        description: (
            <>
                Run headless Chrome, Firefox, WebKit or other browsers, manage lists and queues of URLs to crawl, run crawlers in parallel at maximum
                system capacity. Handle storage and export of results and rotate proxies.
            </>
        ),
    },
    {
        title: 'Works on any system',
        Svg: require('../../static/img/features/works-everywhere.svg').default,
        description: (
            <>
                Crawlee can be used stand-alone on your own systems or it can run as a serverless microservice on the {' '}
                <a href="https://console.apify.com/actors">Apify Platform</a>.
            </>
        ),
    },
    {
        title: 'Automatic scaling',
        Svg: require('../../static/img/features/auto-scaling.svg').default,
        description: (
            <>
                All the crawlers are automatically scaled based on available system resources using the <code>AutoscaledPool</code> class.
                Advanced options are available to fine-tune scaling behaviour.
            </>
        ),
    },
    {
        title: 'Generated fingerprints',
        Svg: require('../../static/img/features/fingerprints.svg').default,
        description: (
            <>
                Never get blocked with unique fingerprints for browsers generated based on real world data.
            </>
        ),
    },
    {
        title: 'Browser like requests from Node.js',
        Svg: require('../../static/img/features/node-requests.svg').default,
        description: (
            <>
                Crawl using HTTP requests as if they were from browsers, using auto-generated headers based on real browsers and their TLS fingerprints.
            </>
        ),
    },
];

function Feature({ Svg, title, description }) {
    return (
        <div className={clsx('col col--4')}>
            <div className="padding-horiz--md padding-bottom--md">
                <div className={styles.featureIcon}>
                    {Svg ? <Svg alt={title}/> : null}
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </div>
    );
}

export default function Highlights() {
    const Svg = require('../../static/img/features/gradient.svg').default;
    return (
        <section className={styles.features}>
            {<Svg />}
            <div className="container">
                <div className="row">
                    {FeatureList.map((props, idx) => (
                        <Feature key={idx} {...props} />
                    ))}
                </div>
            </div>
        </section>
    );
}
