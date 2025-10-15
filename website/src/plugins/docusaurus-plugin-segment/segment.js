import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default ExecutionEnvironment.canUseDOM ? {
    onRouteUpdate() {
        // this forces deferred execution that ensures `window.location` is in sync
        setTimeout(() => {
            // Don't track page views on development
            if (process.env.NODE_ENV === 'production' && window.analytics) {
                window.analytics.page({
                    app: 'crawlee',
                    path: window.location.pathname,
                    url: window.location.href,
                    search: window.location.search,
                });
            }
        }, 0);
    },
} : null;
