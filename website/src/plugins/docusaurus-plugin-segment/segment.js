import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default (function () {
  if (!ExecutionEnvironment.canUseDOM) {
    return null;
  }

  return {
    onRouteUpdate({ location }) {
      // Don't track page views on development
      if (process.env.NODE_ENV === 'production' && window.analytics) {
        window.analytics.page({
          path: location.pathname,
          url: location.href,
        });
      }
    },
  };
})();
