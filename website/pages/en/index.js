/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const React = require('react');

const CompLibrary = require('../../core/CompLibrary.js');

const MarkdownBlock = CompLibrary.MarkdownBlock;
/* Used to read markdown */
const Container = CompLibrary.Container;
const GridBlock = CompLibrary.GridBlock;

const siteConfig = require(`${process.cwd()}/siteConfig.js`);

function imgUrl(img) {
    return `${siteConfig.baseUrl}img/${img}`;
}

function docUrl(doc, language) {
    return `${siteConfig.baseUrl}docs/${language ? `${language}/` : ''}${doc}`;
}

function pageUrl(page, language) {
    return siteConfig.baseUrl + (language ? `${language}/` : '') + page;
}

class Button extends React.Component {
    render() {
        return (
            <div className="pluginWrapper buttonWrapper">
                <a className="button" href={this.props.href} target={this.props.target}>
                    {this.props.children}
                </a>
            </div>
        );
    }
}

Button.defaultProps = {
    target: '_self',
};

const SplashContainer = props => (
    <div className="homeContainer">
        <div className="homeSplashFade">
            <div className="wrapper homeWrapper">{props.children}</div>
        </div>
    </div>
);

const Logo = props => (
    <div className="projectLogo">
        <img src={props.img_src} alt="Project Logo"/>
    </div>
);

const ProjectTitle = () => (
    <h2 className="projectTitle">
        {siteConfig.title}
        <small>{siteConfig.tagline}</small>
    </h2>
);

const PromoSection = props => (
    <div className="section promoSection">
        <div className="promoRow">
            <div className="pluginRowBlock">{props.children}</div>
        </div>
    </div>
);

class HomeSplash extends React.Component {
    render() {
        const language = this.props.language || '';
        return (
            <SplashContainer>
                {/*<Logo img_src={imgUrl('apify_logo.svg')}/>*/}
                <div className="inner">
                    <ProjectTitle/>
                    <PromoSection>
                        <Button href="#try">Try It Out</Button>
                        <Button href={docUrl('guides/getting-started', language)}>Learn the Basics</Button>
                        <Button href={docUrl('examples/crawl-multiple-urls', language)}>See Examples</Button>
                        <Button href='https://apify.typeform.com/to/eV6Rqb' target='_blank'>Give Feedback</Button>
                    </PromoSection>
                </div>
                <a
                    className="github-button"
                    href={this.props.config.repoUrl}
                    data-icon="octicon-star"
                    data-count-href="/apify/apify-js/stargazers"
                    data-show-count="true"
                    data-count-aria-label="# stargazers on GitHub"
                    aria-label="Star Apify SDK on GitHub">
                    Star
                </a>
            </SplashContainer>
        );
    }
}

const Block = props => (
    <Container
        padding={props.paddingBottomOnly ? ['bottom'] : ['bottom', 'top']}
        id={props.id}
        background={props.background}>
        <GridBlock align={props.gridBlockAlign || 'center'} contents={props.children} layout={props.layout}/>
    </Container>
);

const Features = () => (
    <Block layout="fourColumn" paddingBottomOnly>
        {[
            {
                content: '**JavaScript** is the language of the web. Although there are JavaScript tools like [puppeteer](https://www.npmjs.com/package/puppeteer) and [cheerio](https://www.npmjs.com/package/cheerio), ' +
                    'there was no universal framework that would enable **large-scale high-performance** web scraping and crawling of any website. **Until now!**',
                image: imgUrl('javascript_logo.svg'),
                imageAlign: 'top',
                title: 'Runs on JavaScript',
            },
            {
                content: 'Run **headless Chrome** or Selenium, manage **lists and queues** of URLs to crawl, run crawlers in **parallel** at maximum system capacity. ' +
                    'Handle **storage and export** of results and rotate **proxies**.',
                image: imgUrl('robot.png'),
                imageAlign: 'top',
                title: 'Automates any web workflow',
            },
            {
                content: 'Apify SDK can be used **stand-alone** in your Node.js projects or it can run as a **serverless microservice on the Apify Cloud**. ' +
                    '[Get started with Apify Cloud](https://my.apify.com/actors)',
                image: imgUrl('cloud_icon.svg'),
                imageAlign: 'top',
                title: 'Works locally and in the cloud',
            }
        ]}
    </Block>
);

// const FeatureCallout = () => (
//     <div
//         className="productShowcaseSection paddingBottom"
//         style={{ textAlign: 'center' }}>
//         <h2>All the features you need are already included</h2>
//         <MarkdownBlock>
//             We've built three different crawler classes for you so that you can be up and running in no time.
//             Need to crawl plain HTML? Use our **blazing fast** [`CheerioCrawler`](examples/cheeriocrawler).
//
//             For complex websites that use **React, Vue** and other front-end javascript libraries and require real-time manipulation,
//             spawn a headless browser with our [`PuppeteerCrawler`](examples/puppeteercrawler).
//
//             And if you need **control of all aspects** of your crawling, just use the bare bones [`BasicCrawler`](examples/basiccrawler)
//
//             All of your crawlers will be automatically **scaled** based on available system resources with our [`AutoscaledPool`](api/AutoscaledPool).
//             And if you use the [Apify Cloud](https://my.apify.com/actors), we will also provide you with a pool of **Proxies** to avoid detection.
//
//             For your persistence needs, check out the [`Dataset`](api/dataset) and [`Key-Value Store`](api/keyvaluestore) storages.
//         </MarkdownBlock>
//     </div>
// );

const EasyCrawling = () => (
    <Block background="light" gridBlockAlign="left">
        {[
            {
                content: 'There are three main classes that you can use to start crawling the web in no time. ' +
                    'Need to crawl plain HTML? Use the **blazing fast** [`CheerioCrawler`](docs/examples/cheerio-crawler).\n' +
                    'For complex websites that use **React**, **Vue** or other front-end javascript libraries and require JavaScript execution, ' +
                    'spawn a headless browser with [`PuppeteerCrawler`](docs/examples/puppeteer-crawler).\n' +
                    'To **control all aspects** of your crawling, just use the bare bones [`BasicCrawler`](docs/examples/basic-crawler)',
                image: imgUrl('chrome_scrape.gif'),
                imageAlign: 'right',
                title: 'Easy crawling',
            },
        ]}
    </Block>
);

const PowerfulTools = () => (
    <Block gridBlockAlign="left">
        {[
            {
                content: 'All the crawlers are automatically **scaled** based on available system resources using the [`AutoscaledPool`](docs/api/autoscaled-pool) class. ' +
                    'When you run your code on the [Apify Cloud](https://my.apify.com/actors), you can also take advantage of a [pool of proxies](https://apify.com/proxy) to avoid detection. ' +
                    'For data storage, you can use the [`Dataset`](docs/api/dataset), [`KeyValueStore`](docs/api/key-value-store) and [`RequestQueue`](docs/api/request-queue) classes.',
                image: imgUrl('source_code.png'),
                imageAlign: 'left',
                title: 'Powerful tools',
            },
        ]}
    </Block>
);


const TryOut = () => (
    <Block id="try" background="light" gridBlockAlign="left">
        {[
            {
                content: 'Install **Apify SDK** into a Node.js project. You must have Node.js 10 or higher installed.\n' +
                    '```\n' +
                    'npm install apify\n' +
                    '```\n' +
                    'Copy the following code into a file in the project, for example `main.js`:\n' +
                    '```\n' +
                    'const Apify = require(\'apify\');\n' +
                    '\n' +
                    'Apify.main(async () => {\n' +
                    '    const requestQueue = await Apify.openRequestQueue();\n' +
                    '    await requestQueue.addRequest({ url: \'https://www.iana.org/\' });\n' +
                    '    const pseudoUrls = [new Apify.PseudoUrl(\'https://www.iana.org/[.*]\')];\n' +
                    '\n' +
                    '    const crawler = new Apify.PuppeteerCrawler({\n' +
                    '        requestQueue,\n' +
                    '        handlePageFunction: async ({ request, page }) => {\n' +
                    '            const title = await page.title();\n' +
                    '            console.log(`Title of ${request.url}: ${title}`);\n' +
                    '            await Apify.utils.enqueueLinks({ page, selector: \'a\', pseudoUrls, requestQueue });\n' +
                    '        },\n' +
                    '        maxRequestsPerCrawl: 100,\n' +
                    '        maxConcurrency: 10,\n' +
                    '    });\n' +
                    '\n' +
                    '    await crawler.run();\n' +
                    '});\n' +
                    '```\n' +
                    'Execute the following command in the project\'s folder and watch it recursively crawl ' +
                    '[IANA](https://www.iana.org) with Puppeteer and Chromium.\n' +
                    '```\n' +
                    'node main.js\n' +
                    '```\n',
                // image: imgUrl('apify_logo.svg'),
                // imageAlign: 'right',
                title: 'Try it out',
            },
        ]}
    </Block>
);

// const Showcase = props => {
//     if ((siteConfig.users || []).length === 0) {
//         return null;
//     }
//
//     const showcase = siteConfig.users.filter(user => user.pinned)
//         .map(user => (
//             <a href={user.infoLink} key={user.infoLink}>
//                 <img src={user.image} alt={user.caption} title={user.caption}/>
//             </a>
//         ));
//
//     return (
//         <div className="productShowcaseSection paddingBottom">
//             <h2>Who is Using This?</h2>
//             <p>This project is used by all these people</p>
//             <div className="logos">{showcase}</div>
//             <div className="more-users">
//                 <a className="button" href={pageUrl('users.html', props.language)}>
//                     More {siteConfig.title} Users
//                 </a>
//             </div>
//         </div>
//     );
// };

class Index extends React.Component {
    render() {
        const language = this.props.language || '';

        return (
            <div>
                <HomeSplash language={language} config={siteConfig}/>
                <div className="mainContainer">
                    <Features/>
                    {/*<FeatureCallout/>*/}
                    <EasyCrawling/>
                    <PowerfulTools/>
                    <TryOut/>
                    {/*<Showcase language={language}/>*/}
                </div>
            </div>
        );
    }
}

module.exports = Index;
