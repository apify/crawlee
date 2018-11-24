---
id: social
title: social
---
<a name="social"></a>

A namespace that contains various utilities to help you extract social handles
from text, URLs and and HTML documents.

**Example usage:**

```javascript
const Apify = require('apify');

const emails = Apify.utils.social.emailsFromText('alice@example.com bob@example.com');
```

