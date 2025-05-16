import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default ExecutionEnvironment.canUseDOM ? {
    onRouteUpdate({ location }) {
      // Don't track page views on development
      if (process.env.NODE_ENV === 'production' && window.analytics) {
        window.analytics.page({
          app: 'crawlee',
          path: location.pathname,
          url: location.href,
          search: location.search,
        });
      }
    },
} : null;
