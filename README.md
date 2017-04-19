# apifier-sdk-js [![Build Status](https://travis-ci.org/camsong/babel-npm-boilerplate.svg)](https://travis-ci.org/camsong/babel-npm-boilerplate) [![npm version](https://badge.fury.io/js/babel-npm-boilerplate.svg)](http://badge.fury.io/js/babel-npm-boilerplate)

Apifier SDK for JavaScript

This package is still a work in progress, stay tuned.


## Installation

```
npm install apifier --save
```

## Usage inside acts

Import the package to your source code

```
const Apifier = require('apifier');
```

And use `Apifier.main(func)` to pass a user function that will be invoked by the Apifier actor runtime.

```
Apifier.main( (options) => {
    // my synchronous function that returns immediatelly
    console.dir(`Received: ${options.input}`);
    return 'Hello world from actor!';
});
```

If the user function returns a promise, it is considered as asynchronous.

```
Apifier.main( (options) => {
    // my asynchronous function that returns a promise
    console.dir(`Received: ${options.input}`);
    return Promise.resolve()
        .then(()=>{
            // do something here
        })
        .then(()=>{
            return 'Hello world from asynchronous actor!';
        });
});
```

The user function has a single argument `options` which is an object such as:
```
{
   input: Object, // HTTP payload parsed as JSON (if possible) or as text
}
```

Instead of the `Apifier.main()` helper function,
you can run a web server inside the act and handle the requests all by yourself.

```
const http = require('http');

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World\n');
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
receiving HTTP requests over the port specified `APIFIER_INTERNAL_PORT` environment variable.


## Package maintenance

* `npm run test` to run tests
* `npm run test-cov` to generate test coverage
* `npm run build` to transform es6/es7 to es5 by Babel
* `npm run clean` to clean `build/` directory
* `npm run lint` to lint js using ESLint in Airbnb's Javascript style
* `npm publis` to run Babel, run tests and publish the package to NPM

## License

Apache 2.0

