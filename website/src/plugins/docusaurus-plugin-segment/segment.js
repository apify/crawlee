import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const DEFAULT_CONSENT = {
    C0001: false,
    C0002: false,
    C0003: false,
    C0004: false,
    C0005: false,
};

function getOneTrustConsentContext() {
    const consent = { ...DEFAULT_CONSENT };
    // obtain `OptanonConsent` cookie and extract `groups` substring
    const match = document.cookie.match(/(^|;\s*)OptanonConsent=[^;]*&groups=([^;&]*)/);
    // decode the value and parse it - expected format: [C0001:1, COOO2:0,...]
    const input = decodeURIComponent(match?.[2] ?? '').split(',');

    for (const chunk of input) {
        const [name, value] = chunk.split(':');

        // we only want to update specific groups
        if (name in consent) {
            // just to be extra sure, only "1" is considered to pass
            consent[name] = value === '1';
        }
    }

    return consent;
}


export default ExecutionEnvironment.canUseDOM ? {
    onRouteUpdate({ location }) {
      // Don't track page views on development
      if (process.env.NODE_ENV === 'production' && window.analytics) {
        window.analytics.page({
          app: 'crawlee',
          path: location.pathname,
          url: location.href,
          search: location.search,
          ...getOneTrustConsentContext(),
        });
      }
    },
} : null;
