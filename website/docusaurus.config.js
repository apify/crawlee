/* eslint-disable global-require,import/no-extraneous-dependencies */
const { createHref } = require('./tools/utils/createHref');
const { externalLinkProcessor } = require('./tools/utils/externalLink');

/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    title: 'Crawlee',
    tagline: 'The scalable web crawling, scraping and automation library for JavaScript/Node.js',
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
                    disableVersioning: true,
                    lastVersion: 'current',
                    versions: {
                        current: {
                            label: '3.0.0',
                        },
                    },
                    showLastUpdateAuthor: true,
                    showLastUpdateTime: true,
                    path: '../docs',
                    sidebarPath: './sidebars.js',
                    rehypePlugins: [externalLinkProcessor],
                },
                theme: {
                    customCss: '/src/css/customTheme.css',
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
                packages: [
                    {
                        path: 'packages/core',
                    },
                    {
                        path: 'packages/browser-pool',
                    },
                    {
                        path: 'packages/basic-crawler',
                    },
                    {
                        path: 'packages/browser-crawler',
                    },
                    {
                        path: 'packages/cheerio-crawler',
                    },
                    {
                        path: 'packages/puppeteer-crawler',
                    },
                    {
                        path: 'packages/playwright-crawler',
                    },
                    {
                        path: 'packages/memory-storage',
                    },
                    {
                        path: 'packages/utils',
                    },
                    {
                        path: 'packages/types',
                    },
                ],
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
                //     {
                //         from: '/docs/next',
                //         to: '/docs/next/quick-start',
                //     },
                ],
            },
        ],
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
                    type: 'docsVersion',
                    to: 'docs/quick-start',
                    label: 'Docs',
                    position: 'left',
                },
                {
                    type: 'docsVersion',
                    to: 'docs/examples',
                    label: 'Examples',
                    position: 'left',
                },
                {
                    type: 'docsVersion',
                    to: 'api/core',
                    label: 'API reference',
                    position: 'left',
                    activeBaseRegex: 'api/(?!core/changelog)',
                },
                {
                    to: 'api/core/changelog',
                    label: 'Changelog',
                    position: 'left',
                    className: 'changelog',
                },
                {
                    type: 'docsVersionDropdown',
                    position: 'right',
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
            theme: require('prism-react-renderer/themes/github'),
            darkTheme: require('prism-react-renderer/themes/dracula'),
            additionalLanguages: ['docker', 'log'],
        },
        metadata: [],
        image: 'img/apify_og_SDK.png',
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
                        {
                            label: 'Facebook',
                            href: 'https://www.facebook.com/apifytech',
                        },
                    ],
                },
                {
                    title: 'More',
                    items: [
                        {
                            html: createHref(
                                'https://apify.com',
                                'Apify Platform',
                            ),
                        },
                        {
                            html: createHref(
                                'https://docusaurus.io',
                                'Docusaurus',
                            ),
                        },
                        {
                            html: createHref(
                                'https://github.com/apify/crawlee',
                                'GitHub',
                            ),
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Apify Technologies s.r.o.`,
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
        gaGtag: {
            trackingID: 'UA-67003981-4',
        },
    }),
};
