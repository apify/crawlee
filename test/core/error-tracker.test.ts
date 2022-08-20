/* eslint-disable no-multi-spaces */
import { createErrorTracker } from '../../packages/basic-crawler/src/internals/error-tracker';

const g = (error: { name?: string; message?: string; code?: string; stack?: string }) => {
    return {
        name: Math.random().toString(36).slice(2),
        message: Math.random().toString(36).slice(2),
        code: 'code' in error ? error.code : Math.random().toString(36).slice(2),
        stack: Math.random().toString(36).slice(2),
        ...error,
    };
};

const s = (stack: string) => {
    const evalIndex = stack.indexOf('eval at ');
    const atIndex = stack.indexOf('at ');
    const index = evalIndex === -1 ? atIndex : evalIndex;

    return stack.slice(index).split('\n').map((line) => line.trim()).join('\n');
};

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
};

const error = {
    name: 'TypeError',
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
};

const errorNoCode = {
    name: 'TypeError',
    message: 'Invalid URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
    code: undefined as undefined,
};

const errorRandomCode = {
    name: 'TypeError',
    message: 'Invalid URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
};

const errorRandomName = {
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
};

const errorRandomMessage = {
    name: 'TypeError',
    code: 'ERR_INVALID_URL',
    stack: 'eval at Foo.a (eval at Bar.z (myscript.js:10:3))',
};

const errorRandomStack = {
    name: 'TypeError',
    message: 'Invalid URL',
    code: 'ERR_INVALID_URL',
};

test('works', () => {
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
    });

    const e = errorNoCode;

    tracker.add(g(e));
    tracker.add(g(e));

    expect(tracker.result).toMatchObject({
        'myscript.js:10:3': {      // source
            null: {                // code
                [e.name]: {        // name
                    [e.message]: { // message
                        count: 2,
                    },
                },
            },
        },
    });
});

test('can hide error code', () => {
    const tracker = createErrorTracker({
        showErrorCode: false,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: false,
        showStackTrace: true,
        showFullStack: false,
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: false,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: false,
        showFullStack: false,
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: true,
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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

test('placeholder #1', () => {
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                  // source
            null: {                              // code
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                    // source
            null: {                                // code
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                    // source
            null: {                                // code
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                    // source
            null: {                                // code
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                    // source
            null: {                                // code
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
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                                     // source
            null: {                                                 // code
                Error: {                                            // name
                    'The weather is _ today, _ the grass is _': { // message
                        count: 3,
                    },
                },
            },
        },
    });
});

test('placeholder #7', () => {
    const tracker = createErrorTracker({
        showErrorCode: true,
        showErrorMessage: true,
        showErrorName: true,
        showStackTrace: true,
        showFullStack: false,
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
        null: {                                           // source
            null: {                                       // code
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
        null: {                                    // source
            null: {                                // code
                Error: {                           // name
                    'Expected `boolean`, got _': { // message
                        count: 3,
                    },
                },
            },
        },
    });
});
