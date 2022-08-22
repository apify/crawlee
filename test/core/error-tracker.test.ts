/* eslint-disable no-multi-spaces */
import exp from 'node:constants';
import { ErrorTracker } from '../../packages/utils/src/internals/error_tracker';

const random = () => Math.random().toString(36).slice(2);

const g = (error: { name?: string; message?: string; code?: string; stack?: string; cause?: any }) => {
    return {
        name: random(),
        message: random(),
        code: 'code' in error ? error.code : random(),
        stack: random(),
        ...error,
    };
};

const s = (stack: string) => {
    const evalIndex = stack.indexOf('eval at ');
    const atIndex = stack.indexOf('at ');
    const index = evalIndex === -1 ? atIndex : evalIndex;

    return stack.slice(index).split('\n').map((line) => line.trim()).join('\n');
};

// A case for
// https://github.com/microsoft/playwright/blob/99d1ad5a88c3e89360829eee92dbaa98d75beaa4/packages/playwright-core/src/server/dispatchers/dispatcher.ts#L329
const multilineError = {
    name: 'TypeError',
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
    stack: [
        'TypeError: Invalid URL',
        'foobar',
        '   eval at Foo.a (eval at Bar.z (node:url))',
        '   eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
        '   eval at Foo.a (eval at Bar.z (node:http))',
    ].join('\n'),
    cause: undefined as any,
} as const;

const error = {
    name: 'TypeError',
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
    cause: undefined as any,
} as const;

const errorNoCode = {
    name: 'TypeError',
    message: 'Invalid URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
    code: undefined as undefined,
    cause: undefined as any,
} as const;

const errorRandomCode = {
    name: 'TypeError',
    message: 'Invalid URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
    cause: undefined as any,
} as const;

const errorRandomName = {
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
    cause: undefined as any,
} as const;

const errorRandomMessage = {
    name: 'TypeError',
    code: 'ERR_INVALID_URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
    cause: undefined as any,
} as const;

const errorRandomStack = {
    name: 'TypeError',
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
    cause: undefined as any,
} as const;

test('works', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    const e = error;

    expect(tracker.result).toMatchObject({});

    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            [e.code]: {            // code
                [e.name]: {        // name
                    [e.message]: { // message
                        count: 1,
                    },
                },
            },
        },
    });

    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            [e.code]: {            // code
                [e.name]: {        // name
                    [e.message]: { // message
                        count: 2,
                    },
                },
            },
        },
    });
});

test('no code is null code', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    const e = errorNoCode;

    tracker.add(g(e));
    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {       // source
            'missing error code': { // code
                [e.name]: {         // name
                    [e.message]: {  // message
                        count: 2,
                    },
                },
            },
        },
    });
});

test('can hide error code', () => {
    const tracker = new ErrorTracker({
        showErrorCode: false,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    const e = errorRandomCode;

    tracker.add(g(errorRandomCode));
    tracker.add(g(errorRandomCode));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            [e.name]: {            // name
                [e.message]: {     // message
                    count: 2,
                },
            },
        },
    });
});

test('can hide error name', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: false,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    const e = errorRandomName;

    tracker.add(g(e));
    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            [e.code]: {            // code
                [e.message]: {     // message
                    count: 2,
                },
            },
        },
    });
});

test('can hide error message', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: false,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    const e = errorRandomMessage;

    tracker.add(g(errorRandomMessage));
    tracker.add(g(errorRandomMessage));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            [e.code]: {            // code
                [e.name]: {        // name
                    count: 2,
                },
            },
        },
    });
});

test('can hide error stack', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: false,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add(g(errorRandomStack));
    tracker.add(g(errorRandomStack));

    expect(tracker.result).toMatchObject({
        'ERR_INVALID_URL': {      // code
            'TypeError': {        // name
                'Invalid URL': {  // message
                    count: 2,
                },
            },
        },
    });
});

test('can display full stack', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: true,
        showFullMessage: true,
    });

    const e = multilineError;

    tracker.add(g(e));
    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        [s(e.stack)]: {            // source
            [e.code]: {            // code
                [e.name]: {        // name
                    [e.message]: { // message
                        count: 2,
                    },
                },
            },
        },
    });
});

test('stack looks for user files first', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    const e = multilineError;

    tracker.add(g(e));
    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            [e.code]: {            // code
                [e.name]: {        // name
                    [e.message]: { // message
                        count: 2,
                    },
                },
            },
        },
    });
});

test('can shorten the message to the first line', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: false,
    });

    const e = g(multilineError);

    tracker.add(e);

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {                     // source
            [e.code]: {                           // code
                [e.name]: {                       // name
                    [e.message.split('\n')[0]]: { // message
                        count: 1,
                    },
                },
            },
        },
    });
});

test('supports error.cause', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: false,
    });

    const e = g(multilineError);
    e.cause = g(errorRandomMessage);

    tracker.add(e);

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {                     // source
            [e.code]: {                           // code
                [e.name]: {                       // name
                    [e.message.split('\n')[0]]: { // message
                        count: 1,
                    },
                    [e.cause.message]: {
                        count: 1,
                    },
                },
            },
        },
    });
});

test('placeholder #1', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: 'Expected boolean, got number',
    });

    tracker.add({
        name: 'Error',
        message: 'Expected boolean, got string',
    });

    tracker.add({
        name: 'Error',
        message: 'Expected boolean, got undefined',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                 // source
            'missing error code': {              // code
                Error: {                         // name
                    'Expected boolean, got _': { // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #2', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `number`',
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `string`',
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `undefined`',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                   // source
            'missing error code': {                // code
                Error: {                           // name
                    'Expected `boolean`, got _': { // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #3', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: '1 2 3',
    });

    tracker.add({
        name: 'Error',
        message: '1 4 3',
    });

    tracker.add({
        name: 'Error',
        message: '1 5 3',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                   // source
            'missing error code': {                // code
                Error: {                           // name
                    '1 _ 3': {                     // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #4', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: '1 2 3',
    });

    tracker.add({
        name: 'Error',
        message: '1 2 4',
    });

    tracker.add({
        name: 'Error',
        message: '1 2 5',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                   // source
            'missing error code': {                // code
                Error: {                           // name
                    '1 2 _': {                     // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #5', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: '1 2 3',
    });

    tracker.add({
        name: 'Error',
        message: '4 2 3',
    });

    tracker.add({
        name: 'Error',
        message: '5 2 3',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                   // source
            'missing error code': {                // code
                Error: {                           // name
                    '_ 2 3': {                     // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #6', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: 'The weather is sunny today, but the grass is wet.',
    });

    tracker.add({
        name: 'Error',
        message: 'The weather is rainy today, but the grass is still dry.',
    });

    tracker.add({
        name: 'Error',
        message: 'The weather is wild today, however the grass is yellow.',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                                  // source
            'missing error code': {                               // code
                Error: {                                          // name
                    'The weather is _ today, _ the grass is _': { // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #7', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `number`',
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `number`',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                          // source
            'missing error code': {                       // code
                Error: {                                  // name
                    'Expected `boolean`, got `number`': { // message
                        count: 2,
                    },
                },
            },
        },
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `falsy value`',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                   // source
            'missing error code': {                // code
                Error: {                           // name
                    'Expected `boolean`, got _': { // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #8', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `boolean`, got `number`',
    });

    tracker.add({
        name: 'Error',
        message: 'Expected `string`, got `null`',
    });

    expect(tracker.result).toMatchObject({
        'missing stack trace': {                          // source
            'missing error code': {                       // code
                Error: {                                  // name
                    'Expected `boolean`, got `number`': { // message
                        count: 1,
                    },
                    'Expected `string`, got `null`': {
                        count: 1,
                    },
                },
            },
        },
    });
});

test('placeholder #9', () => {
    const tracker = new ErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
        showFullMessage: true,
    });

    tracker.add({
        name: 'Error',
        message: 'Unexpected `show` property in `options` object',
    });

    tracker.add({
        name: 'Error',
        message: 'Missing `display` in style',
    });

    const expected = {
        'missing stack trace': {                                         // source
            'missing error code': {                                      // code
                Error: {                                                 // name
                    'Unexpected `show` property in `options` object': { // message
                        count: 1,
                    },
                    'Missing `display` in style': {
                        count: 1,
                    },
                },
            },
        },
    };

    expect(tracker.result).toMatchObject(expected);
});
