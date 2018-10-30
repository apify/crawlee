---
id: log
title: log
---
<a name="utils.log"></a>

# `utils.log` : <code>object</code>
Apify.utils contains various utilities for logging `WARNING,ERROR,OFF,DEBUG,INFO`.All logs are always kept.

**Example usage:**

```javascript
const Apify = require('apify');
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);
```

