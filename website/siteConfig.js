/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// See https://docusaurus.io/docs/site-config for all the possible
// site configuration options.

// List of projects/orgs using your project for the users page.
// const users = [
//     {
//         caption: 'User1',
//         // You will need to prepend the image path with your baseUrl
//         // if it is not '/', like: '/test-site/img/docusaurus.svg'.
//         image: '/img/docusaurus.svg',
//         infoLink: 'https://www.facebook.com',
//         pinned: true,
//     },
// ];
const extlink = require('remarkable-extlink');

const repoUrl = 'https://github.com/apify/apify-js';

const siteConfig = {
    title: 'Apify SDK', // Title for your website.
    // This is also used as page meta description for SEO, so write it carefully.
    // TODO: Take this from package.json
    // eslint-disable-next-line max-len
    tagline: 'The scalable web crawling, scraping and automation library for JavaScript/Node.js.',
    url: 'https://sdk.apify.com', // Your website URL
    cname: 'sdk.apify.com',
    baseUrl: '/', // Base URL for your project */
    // For github.io type URLs, you would set the url and baseUrl like:
    //   url: 'https://facebook.github.io',
    //   baseUrl: '/test-site/',

    // Used for publishing and more
    projectName: 'apify-js',
    organizationName: 'apify',
    // For top-level user or org sites, the organization is still the same.
    // e.g., for the https://JoelMarcey.github.io site, it would be set like...
    //   organizationName: 'JoelMarcey'

    // For no header links in the top nav bar -> headerLinks: [],
    headerLinks: [
        { search: true },
        { doc: 'guides/motivation', label: 'Guide' },
        { doc: 'examples/crawl-multiple-urls', label: 'Examples' },
        { doc: 'api/apify', label: 'API Reference' },
        { href: repoUrl, label: 'GitHub' },
        // { page: 'help', label: 'Help' },
        // { blog: true, label: 'Blog' },
    ],

    // If you have users set above, you add it here:
    // users,

    /* path to images for header/footer */
    headerIcon: 'img/apify_logo.svg',
    footerIcon: 'img/apify_logo.svg',
    favicon: 'img/favicon.ico',

    /* Colors for website */
    colors: {
        primaryColor: '#1157D2',
        secondaryColor: '#FF9012',
    },

    algolia: {
        // The key is search-only and safe to publish.
        apiKey: '64ce2544769e34add0e6402688c86e92',
        indexName: 'apify_sdk',
        // Optional, if provided by Algolia
        algoliaOptions: {
            facetFilters: ['version:VERSION'],
        },
    },

    /* Custom fonts for website */
    /*
  fonts: {
    myFont: [
      "Times New Roman",
      "Serif"
    ],
    myOtherFont: [
      "-apple-system",
      "system-ui"
    ]
  },
  */

    // This copyright info is used in /core/Footer.js and blog RSS/Atom feeds.
    copyright: `Copyright © ${new Date().getFullYear()} Apify Technologies s.r.o.`,

    highlight: {
    // Highlight.js theme to use for syntax highlighting in code blocks.
        theme: 'monokai-sublime',
        defaultLang: 'javascript',
    },

    // Using Prism for syntax highlighting
    usePrism: true,

    docsSideNavCollapsible: true,
    markdownOptions: {
        html: true,
    },
    markdownPlugins: [
        (md) => {
            extlink(md, {
                host: 'sdk.apify.com', // The hrefs that you DON'T want to be external
                rel: 'noopener', // We want to keep referrer and follow for analytics on apify.com
            });
        },
    ],

    gaTrackingId: 'UA-67003981-4',
    gaGtag: true,

    // Add custom scripts here that would be placed in <script> tags.
    scripts: [
        'https://buttons.github.io/buttons.js',
        'https://cdnjs.cloudflare.com/ajax/libs/clipboard.js/2.0.0/clipboard.min.js',
        '/js/code-block-buttons.js',
    ],

    // On page navigation for the current documentation page.
    onPageNav: 'separate',
    // No .html extensions for paths.
    cleanUrl: true,
    deletedDocs: {
        "1.0.0": [
            "api/puppeteer-pool",
            "typedefs/puppeteer-pool-options",
            "typedefs/launch-puppeteer-function",
            "typedefs/launch-puppeteer-options",
            "typedefs/puppeteer-goto",
            "typedefs/puppeteer-goto-inputs",
        ]
    },

    // Open Graph and Twitter card images.
    ogImage: 'img/apify_og_SDK.png',
    twitterImage: 'img/apify_og_SDK.png',

    // You may provide arbitrary config keys to be used as needed by your
    // template. For example, if you need your repo's URL...
    //   repoUrl: 'https://github.com/facebook/test-site',
    repoUrl,
};

module.exports = siteConfig;
