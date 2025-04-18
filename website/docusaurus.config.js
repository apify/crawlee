/* eslint-disable global-require */
const { externalLinkProcessor } = require('./tools/utils/externalLink');

const packages = [
    'core',
    'browser-pool',
    'basic-crawler',
    'browser-crawler',
    'http-crawler',
    'cheerio-crawler',
    'puppeteer-crawler',
    'playwright-crawler',
    'jsdom-crawler',
    'linkedom-crawler',
    'memory-storage',
    'utils',
    'types',
];
const packagesOrder = [
    '@crawlee/core',
    '@crawlee/cheerio',
    '@crawlee/playwright',
    '@crawlee/puppeteer',
    '@crawlee/jsdom',
    '@crawlee/linkedom',
    '@crawlee/basic',
    '@crawlee/http',
    '@crawlee/browser',
    '@crawlee/memory-storage',
    '@crawlee/browser-pool',
    '@crawlee/utils',
    '@crawlee/types',
];

/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    title: 'Crawlee for JavaScript · Build reliable crawlers. Fast.',
    tagline: 'Build reliable crawlers. Fast.',
    url: 'https://crawlee.dev',
    baseUrl: '/',
    trailingSlash: false,
    organizationName: 'apify',
    projectName: 'crawlee',
    scripts: ['/js/custom.js'],
    favicon: 'img/favicon.ico',
    customFields: {
        markdownOptions: {
            html: true,
        },
        gaGtag: true,
        repoUrl: 'https://github.com/apify/crawlee',
    },
    onBrokenLinks:
    /** @type {import('@docusaurus/types').ReportingSeverity} */ ('throw'),
    onBrokenMarkdownLinks:
    /** @type {import('@docusaurus/types').ReportingSeverity} */ ('throw'),
    future: {
        experimental_faster: true,
    },
    presets: /** @type {import('@docusaurus/types').PresetConfig[]} */ ([
        [
            '@docusaurus/preset-classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    showLastUpdateAuthor: true,
                    showLastUpdateTime: true,
                    path: '../docs',
                    routeBasePath: 'js/docs',
                    sidebarPath: './sidebars.js',
                    rehypePlugins: [externalLinkProcessor],
                    disableVersioning: !!process.env.CRAWLEE_DOCS_FAST,
                    editUrl: (doc) => {
                        return `https://github.com/apify/crawlee/edit/master/website/${doc.versionDocsDirPath}/${doc.docPath}`;
                    },
                },
                blog: {
                    blogTitle: 'Crawlee Blog - learn how to build better scrapers',
                    // eslint-disable-next-line max-len
                    blogDescription: 'Guides and tutorials on using Crawlee, the most reliable open-source web scraping and browser automation library for JavaScript and Node.js developers.',
                    blogSidebarTitle: 'All posts',
                    blogSidebarCount: 'ALL',
                },
                theme: {
                    customCss: '/src/css/custom.css',
                },
            }),
        ],
    ]),
    headTags: [
        // Intercom messenger
        {
            tagName: 'script',
            innerHTML: `window.intercomSettings={api_base:"https://api-iam.intercom.io",app_id:"kod1r788"};`,
            attributes: {},
        },
        // Intercom messenger
        {
            tagName: 'script',
            innerHTML: `(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/kod1r788';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})()`,
            attributes: {},
        },
    ],
    plugins: [
        [
            '@apify/docusaurus-plugin-typedoc-api',
            {
                projectRoot: `${__dirname}/..`,
                changelogs: true,
                readmes: true,
                routeBasePath: 'js/api',
                sortPackages: (a, b) => {
                    return packagesOrder.indexOf(a.packageName) - packagesOrder.indexOf(b.packageName);
                },
                packages: packages.map((name) => ({ path: `packages/${name}` })),
                typedocOptions: {
                    excludeExternals: false,
                },
            },
        ],
        [
            '@docusaurus/plugin-client-redirects',
            {
                redirects: [
                    {
                        from: '/js/docs',
                        to: '/js/docs/quick-start',
                    },
                    {
                        from: '/js/docs/next',
                        to: '/js/docs/next/quick-start',
                    },
                    {
                        from: '/js/docs/guides/environment-variables',
                        to: '/js/docs/guides/configuration',
                    },
                    {
                        from: '/js/docs/guides/getting-started',
                        to: '/js/docs/introduction',
                    },
                    {
                        from: '/js/docs/guides/apify-platform',
                        to: '/js/docs/deployment/apify-platform',
                    },
                ],
                // createRedirects(existingPath) {
                //     if (!existingPath.endsWith('/')) {
                //         return `${existingPath}/`;
                //     }
                //
                //     return undefined; // Return a falsy value: no redirect created
                // },
            },
        ],
        [
            'docusaurus-gtm-plugin',
            {
                id: 'GTM-5P7MCS7',
            },
        ],
        async function runnableCodeBlock() {
            return {
                name: 'runnable-code-block',
                configureWebpack() {
                    return {
                        resolveLoader: {
                            alias: {
                                'roa-loader': require.resolve(`${__dirname}/roa-loader/`),
                            },
                        },
                    };
                },
            };
        },
        // skipping svgo for animated crawlee logo
        async function doNotUseSVGO() {
            return {
                name: 'docusaurus-svgo',
                configureWebpack(config) {
                    // find the svg rule
                    const svgRule = config.module.rules.find((r) => typeof r === 'object' && r.test.toString() === '/\\.svg$/i');

                    // find the svgr loader
                    const svgrLoader = svgRule?.oneOf?.[0];

                    // make copy of svgr loader and disable svgo
                    const svgrLoaderCopy = JSON.parse(JSON.stringify(svgrLoader));

                    // include only animated logo
                    svgrLoaderCopy.include = /animated-crawlee-logo/;

                    // turn off svgo
                    svgrLoaderCopy.use[0].options.svgo = false;

                    // insert the copy after the original svgr loader
                    svgRule.oneOf.splice(1, 0, svgrLoaderCopy);

                    // exclude animated logo from the first svgr loader (with svgo enabled)
                    svgrLoader.exclude = /animated-crawlee-logo/;

                    return {
                        mergeStrategy: {
                            'module.rules': 'replace',
                        },
                        module: {
                            rules: config.module.rules,
                        },
                    };
                },
            };
        },
    ],
    themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
        docs: {
            versionPersistence: 'localStorage',
            sidebar: {
                hideable: true,
            },
        },
        // announcementBar: {
        //     id: `crawlee-for-python-webinar`,
        //     content: `🎉️ <b><a href="https://crawlee.dev/python/">Crawlee for Python is open to early adopters!</a></b> 🥳️`,
        // },
        navbar: {
            hideOnScroll: true,
            title: 'Crawlee',
            logo: {
                src: 'img/crawlee-light.svg',
                srcDark: 'img/crawlee-dark.svg',
            },
            items: [
                {
                    type: 'doc',
                    docId: 'quick-start/quick-start',
                    label: 'Docs',
                    position: 'left',
                },
                {
                    type: 'doc',
                    docId: '/examples',
                    label: 'Examples',
                    position: 'left',
                },
                {
                    type: 'custom-api',
                    to: 'core',
                    label: 'API',
                    position: 'left',
                    activeBaseRegex: 'api/(?!.*/changelog)',
                },
                {
                    type: 'custom-api',
                    to: 'core/changelog',
                    label: 'Changelog',
                    position: 'left',
                    className: 'changelog',
                    activeBaseRegex: 'changelog',
                },
                {
                    to: 'blog',
                    label: 'Blog',
                    position: 'left',
                },
            ],
        },
        colorMode: {
            defaultMode: 'light',
            disableSwitch: false,
            respectPrefersColorScheme: true,
        },
        prism: {
            defaultLanguage: 'typescript',
            theme: require('prism-react-renderer').themes.github,
            darkTheme: require('prism-react-renderer').themes.dracula,
            additionalLanguages: ['docker', 'log', 'bash', 'diff', 'json'],
        },
        metadata: [
            // eslint-disable-next-line max-len
            { name: 'description', content: `Crawlee helps you build and maintain your crawlers. It's open source, but built by developers who scrape millions of pages every day for a living.` },
            // eslint-disable-next-line max-len
            { name: 'og:description', content: `Crawlee helps you build and maintain your crawlers. It's open source, but built by developers who scrape millions of pages every day for a living.` },
        ],
        image: 'img/crawlee-js-og.png',
        footer: {
            links: [
                {
                    title: 'Docs',
                    items: [
                        {
                            label: 'Guides',
                            to: 'js/docs/guides',
                        },
                        {
                            label: 'Examples',
                            to: 'js/docs/examples',
                        },
                        {
                            label: 'API reference',
                            to: 'js/api/core',
                        },
                        {
                            label: 'Changelog',
                            to: 'js/api/core/changelog',
                        },
                    ],
                },
                {
                    title: 'Product',
                    items: [
                        {
                            label: 'Discord',
                            href: 'https://discord.com/invite/jyEM2PRvMU',
                        },
                        {
                            label: 'Stack Overflow',
                            href: 'https://stackoverflow.com/questions/tagged/crawlee',
                        },
                        {
                            label: 'Twitter',
                            href: 'https://twitter.com/apify',
                        },
                        {
                            label: 'YouTube',
                            href: 'https://www.youtube.com/apify',
                        },

                    ],
                },
                {
                    title: 'More',
                    items: [
                        {
                            label: 'Apify platform',
                            href: 'https://apify.com',
                        },
                        {
                            label: 'Docusaurus',
                            href: 'https://docusaurus.io',
                        },
                        {
                            label: 'GitHub',
                            href: 'https://github.com/apify/crawlee',
                        },
                    ],
                },
            ],
        },
        algolia: {
            appId: '5JC94MPMLY',
            apiKey: '267679200b833c2ca1255ab276731869', // search only (public) API key
            indexName: 'crawlee',
            placeholder: 'Search documentation',
            algoliaOptions: {
                facetFilters: ['version:VERSION'],
            },
            translations: {
                button: {
                    buttonText: 'Search documentation...',
                },
            },
        },
    }),
};
