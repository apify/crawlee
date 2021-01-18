---
id: version-0.22.4-global-cache
title: GlobalCache
original_id: global-cache
---

<a name="globalcache"></a>

Used to manage all globally created caches, such as request queue cache or dataset cache. Before creation of this class, those caches were created as
module scoped globals - untouchable. This proved problematic especially in tests, where caches would prevent test separation.

---
