---
id: version-0.22.4-accept-user-input
title: Accept user input
original_id: accept-user-input
---

This example accepts and logs user input:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log(input);
});
```

To provide the actor with input, create a `INPUT.json` file inside the "default" key-value store:

```bash
{PROJECT_FOLDER}/apify_storage/key_value_stores/default/INPUT.json
```

Anything in this file will be available to the actor when it runs.

To learn about other ways to provide an actor with input, refer to the [Apify Platform Documentation](https://apify.com/docs/actor#run).
