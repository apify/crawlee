# apifier-sdk-js [![Build Status](https://travis-ci.org/Apifier/apifier-sdk-js.svg)](https://travis-ci.org/Apifier/apifier-sdk-js) [![npm version](https://badge.fury.io/js/apifier.svg)](http://badge.fury.io/js/apifier)

Apifier SDK for JavaScript

This package is still a work in progress, stay tuned.


## Installation

```bash
npm install apifier --save
```

## Usage inside acts

Import the package to your source code

```javascript
const Apifier = require('apifier');
```

And use `Apifier.main(func)` to pass a user function that will be invoked by the Apifier actor runtime.

```javascript
Apifier.main( (options) => {
    // my synchronous function that returns immediatelly
    console.dir(`Received: ${options.input}`);
    return 'Hello world from actor!';
});
```

If the user function returns a promise, it is considered as asynchronous.

```javascript
Apifier.main( (options) => {
    // my asynchronous function that returns a promise
    console.dir(`Received: ${options.input}`);
    return Promise.resolve()
        .then(() => {
            // do something async here
        })
        .then(() => {
            return 'Hello world from asynchronous actor!';
        });
});
```

The user function has a single argument `options` which is an object such as:
```javascript
{
    input: {
        // HTTP payload body parsed using body-parser middleware:
        // * For 'application/json' content type the body is parsed from JSON to any JavaScript object
        // * For 'text/*' content types the body is passed as String
        // * For any other content type the body is passed as raw Buffer object
        body: Object|String|Buffer,

        // HTTP method used to pass the data
        method: String

        // Content-Type HTTP header
        contentType: String
    }
}
```

Instead of the `Apifier.main()` helper function,
you can run a web server inside the act and handle the requests all by yourself.

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World\n', (err) => {
        process.exit(err ? 1 : 0);
    });
});
server.listen(process.env.APIFIER_INTERNAL_PORT|0, (err) => {
    if( err ) {
        console.log(`Oops: ${err}`);
        process.exit(1);
    }
    console.log('Hey I am ready');
    Apifier.heyIAmReady();
});
```

Note that by calling `Apifier.heyIAmReady()` you tell the Actor runtime that your server is ready to start
receiving HTTP requests over the port specified by the `APIFIER_INTERNAL_PORT` environment variable.


To set a promise dependency from an external library, use the following code:
```javascript
const Promise = require('bluebird');
Apifier.setPromisesDependency(Promise);
```
Otherwise, the SDK defaults to native promises.


## Package maintenance

* `npm run test` to run tests
* `npm run test-cov` to generate test coverage
* `npm run build` to transform ES6/ES7 to ES5 by Babel
* `npm run clean` to clean `build/` directory
* `npm run lint` to lint js using ESLint in Airbnb's Javascript style
* `npm publish` to run Babel, run tests and publish the package to NPM

## License

Apache 2.0

