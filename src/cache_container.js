import * as LruCache from 'apify-shared/lru_cache';

/**
 * Used to manage all globally created caches, such as request queue cache
 * or dataset cache. Before creation of this class, those caches were
 * created as module scoped globals - untouchable. This proved problematic
 * especially in tests, where caches would prevent test separation.
 * @property {Object<string, LruCache>} caches
 * @ignore
 */
class CacheContainer {
    constructor() {
        this.caches = new Map();
    }

    /**
     * @param {string} name
     * @param {number} maxSize
     * @return {LruCache}
     */
    openCache(name, maxSize) {
        let cache = this.caches.get(name);
        if (!cache) {
            cache = new LruCache({ maxLength: maxSize });
            this.caches.set(name, cache);
        }
        return cache;
    }

    /**
     * @param {string} name
     * @return {?LruCache}
     */
    getCache(name) {
        return this.caches.get(name);
    }

    /**
     * @param {string} name
     */
    clearCache(name) {
        const cache = this.caches.get(name);
        cache.clear();
    }

    clearAllCaches() {
        this.caches.forEach((cache) => cache.clear());
    }
}

export default new CacheContainer();
