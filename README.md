# apifier-sdk-js [![Build Status](https://travis-ci.org/Apifier/apifier-sdk-js.svg)](https://travis-ci.org/Apifier/apifier-sdk-js) [![npm version](https://badge.fury.io/js/apifier.svg)](http://badge.fury.io/js/apifier)

Apifier runtime for JavaScript.

This is a helper package that simplifies development of Apifier acts.
It's still a work in progress, stay tuned.


## Installation

```bash
npm install apifier --save
```

## Usage inside acts

Import the package to your act.

```javascript
const Apifier = require('apifier');
```

### Main function

To simplify development of acts, the Actor runtime provides the `Apifier.main()` function which does the following:

1) Prepares the execution context object by calling `Apifier.getContext()`

2) Fetches act run input by calling `Apifier.getInput()`

3) Waits for the user function to finish

4) Stores the return value of the user function as act output by calling `Apifier.setOutput()`

5) Exits the process

If the user function throws an exception or some other error is encountered,
then `Apifier.main()` prints the details to console so that it's saved into log file.

`Apifier.main()` accepts a single argument - a user function that performs the act.
In the simplest case, the user function is synchronous:

```javascript
Apifier.main((context) => {
    // my synchronous function that returns immediately
    console.dir(context.input);
    return 'Output from my act';
});
```

The user function accepts a single argument called `context`, which is a context object
holding information about the act run. It is described in detail in the next section.

The return value from the user function is stored as output of the act.
It must be an object that can be stringified to JSON, otherwise the act will fail.
The output record will have the MIME content type set to `application/json; charset=utf-8`.

If the user function returns a promise, it is considered as asynchronous:

```javascript
Apifier.main((context) => {
    // my asynchronous function that returns a promise
    return Promise.resolve()
        .then(() => {
            return 'Output from my act';
        });
});
```

In this case, the return value of the last function in the promise chain is considered as the act output.

To simplify your code, you can also take advantage of the async/await keywords:

```javascript
const request = require('request-promise');

Apifier.main(async (context) => {
    const result = await request('http://www.example.com');
    return result;
});
```

Note that the `Apifier.main()` function does not need to be used at all,
it is provided merely for user convenience. The same activity
can be performed using the lower-level functions described in the following sections.


### Context

The user function passed to `Apifier.main()` accepts a single
argument called `context` which is an object such as:

```javascript
{
    // Internal port on which the web server is listening
    internalPort: Number,

    // ID of the act
    actId: String,

    // ID of the act run
    actRunId: String,

    // Date when the act was started
    startedAt: Date,

    // Date when the act will time out
    timeoutAt: Date,

    // ID of the key-value store where input and output data of this act is stored
    defaultKeyValueStoreId: String,

    // Input data for the act as provided by Apifier.getInput()
    input: {
        body: String/Buffer,
        contentType: String,
    }
}
```

The values of the objects are determined from process environment variables,
such as `APIFY_INTERNAL_PORT` or `APIFY_STARTED_AT`, and the input is obtained by calling the
`Apifier.getInput()` function.

The `context` object can also be obtained as follows:

```javascript
Apifier.getContext().then((context) => {
    console.dir(context);
});
```

### Input and output

Each act can have an input and output data record, which is a string or binary buffer
with a specific MIME content type.
Both input and output is stored in the Apifier key-value store created specifically for the act run,
under keys `INPUT` and `OUTPUT`, respectively.
The ID of the key-value store is provided by the Actor runtime as the `APIFY_DEFAULT_KEY_VALUE_STORE_ID`
environment variable.

To obtain the input of the act, use the following code:

```javascript
Apifier.getInput().then((input) => {
    console.log(`Input in ${input.contentType}:`);
    console.dir(input.body);
});
```

Similarly, the output can be stored as follows:

```javascript
const output = {
    body: 'test output from act',
    contentType: 'application/text'
};
Apifier.setOutput(output).then(() => {
    console.log('Output saved!');
});
```

Note that this is especially useful if output of your act should not be a JSON,
because return value from `Apifier.main()` is always converted to JSON.


### Promises

By default, the `getContext`, `getInput` and `setOutput` functions returns a promise.
However, they also accept a Node.js-style callback parameter.
If the callback is provided, the return value of the functions is not defined
and the functions only invoke the callback upon completion or error.

To set a promise dependency from an external library, use code such as:

```javascript
const Promise = require('bluebird');
Apifier.setPromisesDependency(Promise);
```

If `Apifier.setPromisesDependency()` is not called, the runtime defaults to
native promises if they are available, or it throws an error.


### Miscellaneous

`Apifier.client` property contains a reference to `ApifyClient` instance from the
[apify-client](https://www.npmjs.com/package/apify-client) NPM package
that is used for all underlying calls to Apifier API.
You can use this to set options to the client.

`Apifier.events` property contains a reference to an `EventEmitter` instance
that is used by Actor runtime to notify your process about various events.
This will be used in the future.


### Internal web server

**TODO: this is still not finished**

You can run a web server inside the act and handle the requests all by yourself.

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World\n', (err) => {
        process.exit(err ? 1 : 0);
    });
});
server.listen(process.env.APIFY_INTERNAL_PORT|0, (err) => {
    if( err ) {
        console.log(`Oops: ${err}`);
        process.exit(1);
    }
    console.log('Hey I am ready');
    Apifier.readyFreddy();
});
```

Note that by calling `Apifier.readyFreddy()` you tell the Actor runtime that your server is ready to start
receiving HTTP requests over the port specified by the `APIFY_INTERNAL_PORT` environment variable.




## Package maintenance

* `npm run test` to run tests
* `npm run test-cov` to generate test coverage
* `npm run build` to transform ES6/ES7 to ES5 by Babel
* `npm run clean` to clean `build/` directory
* `npm run lint` to lint js using ESLint in Airbnb's Javascript style
* `npm publish` to run Babel, run tests and publish the package to NPM

## License

Apache 2.0

