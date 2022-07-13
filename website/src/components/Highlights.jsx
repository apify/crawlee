import React from 'react';
import clsx from 'clsx';
import styles from './Highlights.module.css';

const FeatureList = [
    {
        title: 'Runs on JavaScript',
        Svg: require('../../static/img/js_file.svg').default,
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
        Svg: require('../../static/img/workflow.svg').default,
        description: (
            <>
                Run headless Chrome, Firefox, WebKit or other browsers, manage lists and queues of URLs to crawl, run crawlers in parallel at maximum
                system capacity. Handle storage and export of results and rotate proxies.
            </>
        ),
    },
    {
        title: 'Works on any system',
        Svg: require('../../static/img/system.svg').default,
        description: (
            <>
                Crawlee can be used stand-alone on your own systems or it can run as a serverless microservice on the {' '}
                <a href="https://console.apify.com/actors">Apify Platform</a>.
            </>
        ),
    },
    {
        title: 'Automatic scaling',
        // Svg: require('../../static/img/system.svg').default,
        description: (
            <>
                All the crawlers are automatically scaled based on available system resources using the <code>AutoscaledPool</code> class.
                Advanced options are available to fine-tune scaling behaviour.
            </>
        ),
    },
    {
        title: 'Generated fingerprints',
        // Svg: require('../../static/img/system.svg').default,
        description: (
            <>
                Never get blocked with unique fingerprints for browsers generated based on real world data.
            </>
        ),
    },
    {
        title: 'Browser like requests from Node.js',
        // Svg: require('../../static/img/system.svg').default,
        description: (
            <>
                Crawl using HTTP requests as if they were from browsers, using auto-generated headers based on real browsers and their TLS fingerprints.
            </>
        ),
    },
    // {
    //     title: '',
    //     Svg: require('../../static/img/system.svg').default,
    //     description: (
    //         <>
    //
    //         </>
    //     ),
    // },
];

function Feature({ Svg, title, description }) {
    return (
        <div className={clsx('col col--4')}>
            <div className="text--center">
                {Svg ? <Svg className={styles.featureSvg} alt={title}/> : null}
            </div>
            <div className="text--center padding-horiz--md padding-bottom--xl">
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </div>
    );
}

export default function Highlights() {
    return (
        <section className={styles.features}>
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
