import { BasicCrawler } from '@crawlee/basic';
import { ProxyConfiguration } from '@crawlee/core';
import { ArgumentValidationError, parseArgument, schemas } from '@crawlee/utils';
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
    test('throws ArgumentValidationError with label and prettified issues', () => {
        let error!: ArgumentValidationError;
        try {
            parseArgument('not an object', 'myArg', schemas.anyObject);
        } catch (err) {
            error = err as ArgumentValidationError;
        }

        expect(error).toBeInstanceOf(ArgumentValidationError);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('ArgumentValidationError');
        expect(error.message).toContain("Validation of argument 'myArg' failed:");
        expect(error.message).toContain('expected object');
        expect(error.validationError).toBeInstanceOf(z.ZodError);
        expect(error.validationError.issues.length).toBeGreaterThan(0);
        expect(error.cause).toBe(error.validationError);
    });

    test('returns its input for custom schemas', () => {
        const obj = { foo: 'bar' };
        expect(parseArgument(obj, 'x', schemas.anyObject)).toBe(obj);
        const arr = [1, 2];
        expect(parseArgument(arr, 'x', schemas.anyArray)).toBe(arr);
    });

    test('returns typed parsed output for object schemas', () => {
        const options = { desc: true, limit: 10, offset: 0 };
        const parsed: z.output<typeof schemas.datasetListItemsOptions> = parseArgument(
            options,
            'options',
            schemas.datasetListItemsOptions,
        );
        expect(parsed).toEqual(options);
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
        expect(create).toThrow("Validation of argument 'BasicCrawlerOptions' failed");
    });

    test('BasicCrawler throws ArgumentValidationError for NaN', () => {
        const create = () => new BasicCrawler({ requestHandler: async () => {}, maxConcurrency: NaN });
        expect(create).toThrow(ArgumentValidationError);
        expect(create).toThrow("Validation of argument 'BasicCrawlerOptions' failed");
    });

    test('ProxyConfiguration throws ArgumentValidationError for an unknown key', () => {
        const create = () => new ProxyConfiguration({ unknownOption: true } as any);
        expect(create).toThrow(ArgumentValidationError);
        expect(create).toThrow("Validation of argument 'options' failed");
    });
});
