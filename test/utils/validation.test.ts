import { BasicCrawler } from '@crawlee/basic';
import { ProxyConfiguration } from '@crawlee/core';
import { ArgumentValidationError, parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';

class Foo {
    a = 1;
    b = 2;
}

const callableObject = Object.assign(() => {}, { a: 1, b: 2 });

describe('schemas', () => {
    describe('anyObject', () => {
        test.each([
            ['plain object', {}],
            ['class instance', new Foo()],
            ['array', [1, 2, 3]],
            ['function', () => {}],
            ['callable object', callableObject],
        ])('accepts %s', (_, value) => {
            expect(schemas.anyObject.safeParse(value).success).toBe(true);
        });

        test.each([
            ['null', null],
            ['undefined', undefined],
            ['string', 'foo'],
            ['number', 123],
            ['boolean', true],
            ['symbol', Symbol('foo')],
        ])('rejects %s', (_, value) => {
            expect(schemas.anyObject.safeParse(value).success).toBe(false);
        });
    });

    describe('objectWithKeys', () => {
        const schema = schemas.objectWithKeys(['a', 'b']);

        test.each([
            ['plain object with both keys', { a: 1, b: 2 }],
            ['callable object with both keys', callableObject],
            ['class instance with both keys', new Foo()],
            ['object with inherited keys', Object.create({ a: 1, b: 1 })],
        ])('accepts %s', (_, value) => {
            expect(schema.safeParse(value).success).toBe(true);
        });

        test.each([
            ['object missing a key', { a: 1 }],
            ['null', null],
            ['string', 'ab'],
            ['number', 1],
            ['boolean', true],
            ['empty array', []],
        ])('rejects %s', (_, value) => {
            expect(schema.safeParse(value).success).toBe(false);
        });
    });

    describe('anyNumber', () => {
        test.each([
            ['zero', 0],
            ['negative float', -1.5],
            ['Infinity', Infinity],
            ['-Infinity', -Infinity],
            ['Number.MAX_VALUE', Number.MAX_VALUE],
        ])('accepts %s', (_, value) => {
            expect(schemas.anyNumber.safeParse(value).success).toBe(true);
        });

        test.each([
            ['NaN', NaN],
            ['numeric string', '5'],
            ['null', null],
            ['undefined', undefined],
            ['bigint', BigInt(1)],
        ])('rejects %s', (_, value) => {
            expect(schemas.anyNumber.safeParse(value).success).toBe(false);
        });
    });

    describe('anyArray', () => {
        test.each([
            ['empty array', []],
            ['mixed array', [1, 'a', null, {}]],
        ])('accepts %s', (_, value) => {
            expect(schemas.anyArray.safeParse(value).success).toBe(true);
        });

        test.each([
            ['array-like object', { length: 0 }],
            ['string', 'abc'],
            ['null', null],
        ])('rejects %s', (_, value) => {
            expect(schemas.anyArray.safeParse(value).success).toBe(false);
        });
    });

    describe('anyFunction', () => {
        test.each([
            ['function declaration', function foo() {}],
            ['arrow function', () => {}],
            ['class', Foo],
        ])('accepts %s', (_, value) => {
            expect(schemas.anyFunction.safeParse(value).success).toBe(true);
        });

        test.each([
            ['plain object', {}],
            ['array', []],
            ['null', null],
        ])('rejects %s', (_, value) => {
            expect(schemas.anyFunction.safeParse(value).success).toBe(false);
        });
    });
});

describe('parseArgument', () => {
    test('throws ArgumentValidationError naming the received value', () => {
        let error!: ArgumentValidationError;
        try {
            parseArgument('not an object', schemas.anyObject);
        } catch (err) {
            error = err as ArgumentValidationError;
        }

        expect(error).toBeInstanceOf(ArgumentValidationError);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('ArgumentValidationError');
        expect(error.message).toBe('Invalid input: expected object, received the string `not an object`');
        expect(error.cause).toBeInstanceOf(z.ZodError);
        expect(error.issues).toBe(error.cause.issues);
        expect(error.issues.length).toBeGreaterThan(0);
    });

    test('message names the offending field and the value it received', () => {
        const schema = z
            .object({
                countryCode: z.string().regex(/^[A-Z]{2}$/),
                retries: z.number().optional(),
            })
            .strict();

        expect(() => parseArgument({ countryCode: 'CZE' }, schema)).toThrow(
            'Invalid string: must match pattern /^[A-Z]{2}$/ at `countryCode`, got `CZE`',
        );
    });

    test('message folds the received type and value into one clause', () => {
        expect(() => parseArgument({ retries: 'three' }, z.strictObject({ retries: schemas.anyNumber }))).toThrow(
            'Invalid input: expected number, received the string `three` at `retries`',
        );

        // `NaN` is named as itself, not as the self-contradictory "received number".
        expect(() => parseArgument(Number.NaN, schemas.anyNumber)).toThrow(
            'Invalid input: expected number, received NaN',
        );

        // An empty string would render as bare backticks — made visible instead.
        expect(() => parseArgument('', schemas.anyNumber)).toThrow(
            'Invalid input: expected number, received an empty string',
        );

        // Long strings are elided rather than dumped whole into the message.
        expect(() => parseArgument('a'.repeat(250), schemas.anyNumber)).toThrow(
            `Invalid input: expected number, received the string \`${'a'.repeat(200)}… (50 more characters)\``,
        );
    });

    test('arrayOf names the element type at the top level and per element', () => {
        const schema = z.strictObject({ codes: schemas.arrayOf(schemas.anyNumber, 'numbers') });

        expect(() => parseArgument({ codes: 500 }, schema)).toThrow(
            'Invalid input: expected an array of numbers, received the number `500` at `codes`',
        );
        // Element failures keep zod's per-index messages.
        expect(() => parseArgument({ codes: [500, 'x'] }, schema)).toThrow(
            'Invalid input: expected number, received the string `x` at `codes[1]`',
        );
        expect(() => parseArgument({ codes: [500] }, schema)).not.toThrow();
    });

    test('label names the validated interface on every line', () => {
        const schema = z.strictObject({ retries: schemas.anyNumber, name: z.string() });

        expect(() => parseArgument({ retries: 'three', name: 7 }, schema, 'ExampleOptions')).toThrow(
            'Invalid input: expected number, received the string `three` at `retries` in `ExampleOptions`\n' +
                'Invalid input: expected string, received the number `7` at `name` in `ExampleOptions`',
        );
    });

    test('returns its input for custom schemas', () => {
        const obj = { foo: 'bar' };
        expect(parseArgument(obj, schemas.anyObject)).toBe(obj);
        const arr = [1, 2];
        expect(parseArgument(arr, schemas.anyArray)).toBe(arr);
    });

    test('returns typed parsed output for object schemas', () => {
        const options = { desc: true, limit: 10, offset: 0 };
        const parsed: z.output<typeof schemas.datasetListItemsOptions> = parseArgument(
            options,
            schemas.datasetListItemsOptions,
        );
        expect(parsed).toEqual(options);
    });

    test('applies schema defaults in the returned value', () => {
        const schema = z.strictObject({ limit: z.number().default(42) });
        expect(parseArgument({}, schema)).toEqual({ limit: 42 });
    });
});

describe('ow parity in crawler options', () => {
    test('anyNumber accepts Infinity', () => {
        expect(schemas.anyNumber.safeParse(Infinity).success).toBe(true);
    });

    test('BasicCrawler accepts Infinity for numeric options', () => {
        expect(
            () =>
                new BasicCrawler({
                    requestHandler: async () => {},
                    maxConcurrency: Infinity,
                    maxRequestsPerMinute: Infinity,
                }),
        ).not.toThrow();
    });

    test('BasicCrawler throws ArgumentValidationError for an unknown key', () => {
        const create = () => new BasicCrawler({ unknownOption: true } as any);
        expect(create).toThrow(ArgumentValidationError);
        expect(create).toThrow('Unrecognized key: "unknownOption"');
    });

    test('BasicCrawler throws ArgumentValidationError for NaN', () => {
        const create = () => new BasicCrawler({ requestHandler: async () => {}, maxConcurrency: NaN });
        expect(create).toThrow(ArgumentValidationError);
        expect(create).toThrow('Invalid input: expected number, received NaN at `maxConcurrency`');
    });

    test('ProxyConfiguration throws ArgumentValidationError for an unknown key', () => {
        const create = () => new ProxyConfiguration({ unknownOption: true } as any);
        expect(create).toThrow(ArgumentValidationError);
        expect(create).toThrow('Unrecognized key: "unknownOption"');
    });
});
