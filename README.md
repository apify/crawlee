# apify: Apify runtime for JavaScript

[![npm version](https://badge.fury.io/js/apify.svg)](http://badge.fury.io/js/apify)
[![Build Status](https://travis-ci.org/Apifier/apify-runtime-js.svg)](https://travis-ci.org/Apifier/apify-runtime-js)

Helper package that simplifies development of Apify acts. See https://www.apifier.com for details.
This is still work in progress, things might change and break.

If you're looking for the API documentation package previously published as **apify**,
please go to [jsdocify](https://www.npmjs.com/package/jsdocify).
Big kudos to [jbalsas](https://www.npmjs.com/~jbalsas) for giving away this package name!


## Installation

```bash
npm install apify --save
```

This package requires Node.js 6 or higher.
It might work with lower versions too, but they are neither tested nor supported.

## Usage inside acts

Import the package to your act.

```javascript
const Apify = require('apify');
```

### Main function

To simplify development of acts, the runtime provides the `Apify.main(func)` function which does the following:

1) Invokes the user function `func`

2) If the function returned a promise, waits for it to resolve

3) Exits the process

If the user function throws an exception or some other error is encountered,
then `Apify.main()` prints the details to console so that they are stored to the log file.

`Apify.main()` accepts a single argument - the user function that performs the operation of the act.
In the simplest case, the user function is synchronous:

```javascript
Apify.main(() => {
    // my synchronous function that returns immediately
});
```

If the user function returns a promise, it is considered as asynchronous:

```javascript
const request = require('request-promise');

Apify.main(() => {
    // my asynchronous function that returns a promise
    return Promise.resolve()
        .then(() => {
            return request('http://www.example.com');
        })
        .then((html) => {
            console.log(html);
        });
});
```

To simplify your code, you can take advantage of the `async`/`await` keywords:

```javascript
const request = require('request-promise');

Apify.main(async () => {
    const html = await request('http://www.example.com');
    console.log(html);
});
```

Note that the `Apify.main()` function does not need to be used at all,
it is provided merely for user convenience.


### Environment

When running on the Apify platform, the act process is executed with several environment variables.
To simplify access to these variables, you can use the `Apify.getEnv()` function,
which returns an object with the following properties:

```javascript
{
    // ID of the act.
    // Environment variable: APIFY_ACT_ID
    actId: String,

    // ID of the act run
    // Environment variable: APIFY_ACT_RUN_ID
    actRunId: String,

    // ID of the user who started the act (might be different than the owner of the act)
    // Environment variable: APIFY_USER_ID
    userId: String,

    // Authentication token representing privileges given to the act run,
    // it can be passed to various Apify APIs.
    // Environment variable: APIFY_TOKEN
    token: String,

    // Date when the act was started
    // Environment variable: APIFY_STARTED_AT
    startedAt: Date,

    // Date when the act will time out
    // Environment variable: APIFY_TIMEOUT_AT
    timeoutAt: Date,

    // ID of the key-value store where input and output data of this act is stored
    // Environment variable: APIFY_DEFAULT_KEY_VALUE_STORE_ID
    defaultKeyValueStoreId: String,

    // Port on which the act's internal web server is listening.
    // This is still work in progress, stay tuned.
    // Environment variable: APIFY_INTERNAL_PORT
    internalPort: Number,
}
```


### Input and output

Each act can have an input and output data record, which is raw data
with a specific MIME content type.
Both input and output is stored in the Apify key-value store created specifically for the act run,
under keys named `INPUT` and `OUTPUT`, respectively.
The ID of the key-value store is provided by the Actor runtime as the `APIFY_DEFAULT_KEY_VALUE_STORE_ID`
environment variable.

Use the `Apify.getValue(key, [, callback])` function to obtain the input of your act:

```javascript
const input = await Apify.getValue('INPUT');
console.log('My input:');
console.dir(input);
```

If the input data has the `application/json` content type, it is automatically parsed into a JavaScript object.
For the `text/plain` content type the result is a string.
For other content types, the result is raw Buffer.

Similarly, the output can be stored using the `Apify.setValue(key, value [, options] [, callback])` function as follows:

```javascript
const output = {
    someValue: 123
};
await Apify.setValue('OUTPUT', output);
```

By default, the value is converted to JSON and stored with the `application/json` content type.
If you want to store your data with another content type, pass it in the options as follows:

```javascript
await Apify.setValue('OUTPUT', 'my text data', { contentType: 'text/plain' });
```

In this case, the value must be a string or Buffer.

**IMPORTANT: Do not forget to use the `await` keyword when calling `Apify.setValue()`,
otherwise the act process might finish before the output is stored and/or storage errors will not be reported!**

Besides the key `INPUT` and `OUTPUT`, you can use arbitrary keys
to store any data from your act, such as its state or larger results.


### Browser

Apify runtime optionally depends on
the [selenium-webdriver](https://www.npmjs.com/package/selenium-webdriver) package that enables
automation of a web browser.
The simplest way to launch a new web browser is using the `Apify.browse([url,] [options,] [callback])`
function. For example:

```javascript
const browser = await Apify.browse('https://www.example.com/');
```

or

```javascript
const browser = await Apify.browse({
    url: 'https://www.example.com/',
    userAgent: 'MyCrawlingBot/1.23',
});
```

The `options` parameter controls settings of the web browser and it has the following properties:

```javascript
{
    // Initial URL to open. Note that the url argument in Apify.browse() overrides this value.
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

The result of the `Apify.browse()` is a new instance of the `Browser` class,
which represents a web browser instance (possibly with multiple windows or tabs).
If you pass a Node.js-style callback the `Browser` instance is passed to it,
otherwise the `Apify.browse()` function returns a promise that resolves to the `Browser` instance.

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

By default, the `getValue`, `setValue` and `browse` functions return a promise.
However, they also accept a Node.js-style callback parameter.
If the callback is provided, the return value of the functions is not defined
and the functions only invoke the callback upon completion or error.

To set a promise dependency from an external library, use a code such as:

```javascript
const Promise = require('bluebird');
Apify.setPromisesDependency(Promise);
```

If `Apify.setPromisesDependency()` is not called, the runtime defaults to
native promises if they are available, or it throws an error.


### Miscellaneous

The `Apify.client` property contains a reference to the `ApifyClient` instance
(from the [apify-client](https://www.npmjs.com/package/apify-client) NPM package),
that is used for all underlying calls to the Apify API.
The instance is created when the `apify` package is first imported
and it is configured using the `APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN`
environment variables.
The default settings of the instance can be overridden by calling `Apify.client.setOptions()` function.

`Apify.events` property contains a reference to an `EventEmitter` instance
that is used by Actor runtime to notify your process about various events.
This will be used in the future.

`Apify.call` function can be used to quickly execute other act and get it's output. Example use:

```javascript
const data = await Apify.call('john23/my-favourite-act', {
    timeoutSecs: 300,
    body: 'SOME_INPUT_DATA',
    contentType: 'text/plain',
})
```


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
    Apify.readyFreddy();
});
```

Note that by calling `Apify.readyFreddy()` you tell the Actor runtime that your server is ready to start
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

