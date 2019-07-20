---
id: call-actor
title: Call an actor
---

This example calls the [apify/send-mail](https://apify.com/apify/send-mail) actor, which allows you to send an email from within an actor.

```javascript
const Apify = require("apify");

Apify.main(async () => {
    await Apify.call("apify/send-mail", {
        to: "person@example.com",
        subject: "Hello World",
        html: "This is an example."
    });
});
```

To see what other actors are available, visit the [Apify Store](https://apify.com/store).
