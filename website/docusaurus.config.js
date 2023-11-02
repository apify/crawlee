/* eslint-disable global-require,import/no-extraneous-dependencies */
const webpack = require('webpack');
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
    title: 'Crawlee',
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
    presets: /** @type {import('@docusaurus/types').PresetConfig[]} */ ([
        [
            '@docusaurus/preset-classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    showLastUpdateAuthor: true,
                    showLastUpdateTime: true,
                    path: '../docs',
                    sidebarPath: './sidebars.js',
                    rehypePlugins: [externalLinkProcessor],
                    disableVersioning: !!process.env.CRAWLEE_DOCS_FAST,
                },
                theme: {
                    customCss: '/src/css/custom.css',
                },
            }),
        ],
    ]),
    plugins: [
        [
            'docusaurus-plugin-typedoc-api',
            {
                projectRoot: `${__dirname}/..`,
                changelogs: true,
                readmes: true,
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
                        from: '/docs',
                        to: '/docs/quick-start',
                    },
                    {
                        from: '/docs/next',
                        to: '/docs/next/quick-start',
                    },
                    {
                        from: '/docs/guides/environment-variables',
                        to: '/docs/guides/configuration',
                    },
                    {
                        from: '/docs/guides/getting-started',
                        to: '/docs/introduction',
                    },
                    {
                        from: '/docs/guides/apify-platform',
                        to: '/docs/deployment/apify-platform',
                    },
                ],
                createRedirects(existingPath) {
                    if (!existingPath.endsWith('/')) {
                        return `${existingPath}/`;
                    }

                    return undefined; // Return a falsy value: no redirect created
                },
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
    ],
    themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
        docs: {
            versionPersistence: 'localStorage',
            sidebar: {
                hideable: true,
            },
        },
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
                    type: 'docsVersionDropdown',
                    position: 'left',
                    dropdownItemsAfter: [
                        {
                            href: 'https://sdk.apify.com/docs/guides/getting-started',
                            label: '2.2',
                        },
                        {
                            href: 'https://sdk.apify.com/docs/1.3.1/guides/getting-started',
                            label: '1.3',
                        },
                    ],
                },
                {
                    href: 'https://github.com/apify/crawlee',
                    label: 'GitHub',
                    title: 'View on GitHub',
                    position: 'right',
                    className: 'icon',
                },
                {
                    href: 'https://discord.com/invite/jyEM2PRvMU',
                    label: 'Discord',
                    title: 'Chat on Discord',
                    position: 'right',
                    className: 'icon',
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
        metadata: [],
        image: 'img/crawlee-og.png',
        footer: {
            links: [
                {
                    title: 'Docs',
                    items: [
                        {
                            label: 'Guides',
                            to: 'docs/guides',
                        },
                        {
                            label: 'Examples',
                            to: 'docs/examples',
                        },
                        {
                            label: 'API reference',
                            to: 'api/core',
                        },
                        {
                            label: 'Upgrading to v3',
                            to: 'docs/upgrading/upgrading-to-v3',
                        },
                    ],
                },
                {
                    title: 'Community',
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
                    ],
                },
                {
                    title: 'More',
                    items: [
                        {
                            label: 'Apify Platform',
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
            logo: {
                src: 'img/apify_logo.svg',
                href: '/',
                width: '60px',
                height: '60px',
            },
        },
        algolia: {
            appId: '5JC94MPMLY',
            apiKey: '267679200b833c2ca1255ab276731869', // search only (public) API key
            indexName: 'crawlee',
            algoliaOptions: {
                facetFilters: ['version:VERSION'],
            },
        },
    }),
};
