# apifier-sdk-js [![Build Status](https://travis-ci.org/Apifier/apifier-sdk-js.svg)](https://travis-ci.org/Apifier/apifier-sdk-js) [![npm version](https://badge.fury.io/js/apifier.svg)](http://badge.fury.io/js/apifier)

Apifier Actor runtime for JavaScript.

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

4) Stores the output of the user function by calling `Apifier.setOutput()`

5) Exits the process

If the user function throws an exception or some other error is encountered,
then `Apifier.main()` prints the details to console so that it's saved into log file.

`Apifier.main()` accepts a single argument - a user function that performs the act.
The simples use case is a syncronous user function.

```javascript
Apifier.main( (context) => {
    // my synchronous function that returns immediately
    console.dir(context);
    return 'Hello world from actor!';
});
```

If the user function returns a promise, it is considered as asynchronous.

```javascript
Apifier.main( (context) => {
    // my asynchronous function that returns a promise
    console.dir(context);
    return Promise.resolve()
        .then(() => {
            return 'Hello world from asynchronous actor!';
        });
});
```

You can also take advantage of the async/await keywords:

```javascript
const request = require('request-promise');

Apifier.main( async (context) => {
    const result = await request('http://www.example.com');
    return result;
});
```

Note that you don't need to use `Apifier.main()` function at all,
it is provided merely for user convenience. The same activity
can be performed using the lower-level functions described in the following text.


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

    // Input data for the act, as provided by Apifier.getInput()
    input: {
        body: String/Buffer,
        contentType: String,
    }
}
```

The values of the objects are determined from process environment variables,
such as `APIFY_INTERNAL_PORT` or `APIFY_STARTED_AT`, and the input is obtained by calling the
`Apifier.getInput()` function.

The `context` object can be directly obtained as follows:

```javascript
Apifier.getContext().then( (context) => {
    console.dir(context);
});
```

### Input and output

Each act can have input and output data, which can be a string or binary data associated
with a MIME content type.

To only obtain the input of the act, use the following code:

```javascript
Apifier.getInput().then( (input) => {
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
Apifier.setOutput(output).then( () => {
    console.log('Output saved!');
});
```

### Promises

Note that the `getContext`, `getInput` and `setOutput` also accept a Node.js-style callback parameter.
If the callback is not provided, they return a promise.
To set a promise dependency from an external library, use the following code:

```javascript
const Promise = require('bluebird');
Apifier.setPromisesDependency(Promise);
```

Otherwise, the runtime defaults to native promises if they are available, or an error is thrown.


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

