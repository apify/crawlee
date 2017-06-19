# apify-runtime-js [![Build Status](https://travis-ci.org/Apifier/apify-runtime-js.svg)](https://travis-ci.org/Apifier/apify-runtime-js) [![npm version](https://badge.fury.io/js/apifier.svg)](http://badge.fury.io/js/apifier)

Apifier Actor runtime for JavaScript.

This is a helper package that simplifies development of Apifier acts.
It is still a work in progress, stay tuned.


## Installation

```bash
npm install apifier --save
```

This package requires Node.js 6 or higher.
It might work with lower versions too, but they are neither tested nor supported.

## Usage inside acts

Import the package to your act.

```javascript
const Apifier = require('apifier');
```

### Main function

To simplify development of acts, the Actor runtime provides the `Apifier.main()` function which does the following:

*TODO: this needs to be changed, call getValue() / setValue() explicitely*

1) Prepares the execution context object by calling `Apifier.getContext()`

2) Fetches act run input by calling `Apifier.getValue('INPUT')`

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
    // ID of the act
    actId: String,

    // ID of the act run
    actRunId: String,

    // ID of the user who started the act (might be different than the owner of the act)
    userId: String,

    // Authentication token representing privileges given to the act run,
    // it can be passed to various Apifier APIs.
    token: String,

    // Date when the act was started
    startedAt: Date,

    // Date when the act will time out
    timeoutAt: Date,

    // ID of the key-value store where input and output data of this act is stored
    defaultKeyValueStoreId: String,

    // Input data for the act as provided by Apifier.getInput()
    input: {
        body: Object,
        contentType: String,
    },

    // Port on which the act's internal web server is listening.
    // This is still work in progress, stay tuned.
    internalPort: Number,
}
```

The values of the objects are determined from process environment variables,
such as `APIFY_INTERNAL_PORT` or `APIFY_STARTED_AT`, and the input is obtained by calling the
`Apifier.getInput()` function.

The `context` object can also be obtained as follows:

```javascript
const context = await Apifier.getContext();
console.dir(context);
```

### Input and output

Each act can have an input and output data record, which is raw data
with a specific MIME content type.
Both input and output is stored in the Apifier key-value store created specifically for the act run,
under keys named `INPUT` and `OUTPUT`, respectively.
The ID of the key-value store is provided by the Actor runtime as the `APIFY_DEFAULT_KEY_VALUE_STORE_ID`
environment variable.

To obtain the input of the act, use the following code:

```javascript
const input = await Apifier.getValue('INPUT');
console.dir(`My input is: ${input}``);
```

If the input data has the `application/json` content type, it is automatically parsed into a JavaScript object,
otherwise it is left as a String or Buffer in the raw form.

Similarly, the output can be stored as follows:

```javascript
const output = {
    someValue: 123
};
await Apifier.setValue('OUTPUT', output);
```

This is especially useful if the output of the act is not a JSON,
because return value from `Apifier.main()` is always converted to JSON.
In such case, make sure the main function returns `undefined` or `null`.

### Browser

Apifier runtime optionally depends on
the [selenium-webdriver](https://www.npmjs.com/package/selenium-webdriver) package that enables
automation of a web browser.
The simplest way to launch a new web browser is using the `Apifier.browse([url,] [options,] [callback])`
function. For example:

```javascript
const browser = await Apifier.browse('https://www.example.com/');
```

or

```javascript
const browser = await Apifier.browse({
    url: 'https://www.example.com/',
    userAgent: 'MyCrawlingBot/1.23',
});
```

The `options` parameter controls settings of the web browser and it has the following properties:

```javascript
{
    // Initial URL to open. Note that the url argument in Apifier.browse() overrides this value.
    // The default value is 'about:blank'
    url: String,

    // The type of the web browser to use.
    // See https://github.com/SeleniumHQ/selenium/wiki/DesiredCapabilities for possible options.
    // The default value is 'chrome', which is currently the only fully-supported browser.
    browserName: String,

    // Indicates whether the browser should be opened in headless mode (i.e. without windows).
    // By default, this value is based on the APIFY_HEADLESS environment variable.
    headless: Boolean,

    // URL of the proxy server, e.g. 'http://username:password@1.2.3.4:55555'.
    // Currently only the 'http' proxy type is supported.
    // By default it is null, which means no proxy server is used.
    proxyUrl: String,

    // Overrides the User-Agent HTTP header of the web browser.
    // By default it is null, which means the browser uses its default User-Agent.
    userAgent: String,
}
```

The result of the `Apifier.browse()` is a new instance of the `Browser` class,
which represents a web browser instance (possibly with multiple windows or tabs).
If you pass a Node.js-style callback the `Browser` instance is passed to it,
otherwise the `Apifier.browse()` function returns a promise that resolves to the `Browser` instance.

The `Browser` class has the following properties:

```javascript
{
    // An instance of the Selenium's WebDriver class.
    webDriver: Object,

    // A method that closes the web browser and releases associated resources.
    // The method has no arguments and returns a promise that resolves when the browser was closed.
    close: Function,
}
```

The `webDriver` property can be used to manipulate the web browser:

```javascript
const url = await browser.webDriver.getCurrentUrl();
```

For more information, see [WebDriver documentation](http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebDriver.html).

When the web browser is no longer needed, it should be closed:

```javascript
await browser.close();
```


### Promises

By default, the `getContext`, `getValue`, `setValue` and `browse` functions return a promise.
However, they also accept a Node.js-style callback parameter.
If the callback is provided, the return value of the functions is not defined
and the functions only invoke the callback upon completion or error.

To set a promise dependency from an external library, use a code such as:

```javascript
const Promise = require('bluebird');
Apifier.setPromisesDependency(Promise);
```

If `Apifier.setPromisesDependency()` is not called, the runtime defaults to
native promises if they are available, or it throws an error.


### Miscellaneous

The `Apifier.client` property contains a reference to the `ApifyClient` instance
(from the [apify-client](https://www.npmjs.com/package/apify-client) NPM package),
that is used for all underlying calls to the Apifier API.
The instance is created when the `apifier` package is first imported
and it is configured using the `APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN`
environment variables.
The default settings of the instance can be overridden by calling `Apifier.client.setOptions()` function.

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

