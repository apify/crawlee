const path = require('path');

module.exports = function (context, options) {
  const { siteConfig } = context;
  const { themeConfig } = siteConfig;
  const { writeKey, allowedInDev = false } = options;

  return {
    name: 'docusaurus-plugin-segment',

    getClientModules() {
      return [path.resolve(__dirname, './segment')];
    },

    injectHtmlTags() {
      if (!writeKey) {
        throw new Error(
          'You need to specify a Segment writeKey in the plugin options'
        );
      }

      if (process.env.NODE_ENV !== 'production' && !allowedInDev) {
        return {};
      }

      return {
        headTags: [
          {
            tagName: 'script',
            innerHTML: `
              !function(){var analytics=window.analytics=window.analytics||[];if(!analytics.initialize)if(analytics.invoked)window.console&&console.error&&console.error("Segment snippet included twice.");else{analytics.invoked=!0;analytics.methods=["trackSubmit","trackClick","trackLink","trackForm","pageview","identify","reset","group","track","ready","alias","debug","page","once","off","on","addSourceMiddleware","addIntegrationMiddleware","setAnonymousId","addDestinationMiddleware"];analytics.factory=function(e){return function(){var t=Array.prototype.slice.call(arguments);t.unshift(e);analytics.push(t);return analytics}};for(var e=0;e<analytics.methods.length;e++){var key=analytics.methods[e];analytics[key]=analytics.factory(key)}analytics.load=function(key,e){var t=document.createElement("script");t.type="text/javascript";t.async=!0;t.src="https://cdn.segment.com/analytics.js/v1/" + key + "/analytics.min.js";var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(t,n);analytics._loadOptions=e};analytics._writeKey="${writeKey}";;analytics.SNIPPET_VERSION="4.15.3";
              analytics.load("${writeKey}");
              analytics.page();
            }}();
            `,
          },
        ],
      };
    },
  };
};
