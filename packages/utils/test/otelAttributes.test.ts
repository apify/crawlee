import { describe, expect, it } from 'vitest';

import { toOtelAttributeValue } from '../src/internals/otelAttributes';

describe('toOtelAttributeValue', () => {
    describe('primitive values', () => {
        it('should return string as-is', () => {
            expect(toOtelAttributeValue('hello')).toBe('hello');
            expect(toOtelAttributeValue('')).toBe('');
            expect(toOtelAttributeValue('with spaces')).toBe('with spaces');
        });

        it('should return number as-is', () => {
            expect(toOtelAttributeValue(42)).toBe(42);
            expect(toOtelAttributeValue(0)).toBe(0);
            expect(toOtelAttributeValue(-1)).toBe(-1);
            expect(toOtelAttributeValue(3.14)).toBe(3.14);
            expect(toOtelAttributeValue(Infinity)).toBe(Infinity);
            expect(toOtelAttributeValue(-Infinity)).toBe(-Infinity);
        });

        it('should return boolean as-is', () => {
            expect(toOtelAttributeValue(true)).toBe(true);
            expect(toOtelAttributeValue(false)).toBe(false);
        });
    });

    describe('valid arrays', () => {
        it('should return string arrays as-is', () => {
            const arr = ['a', 'b', 'c'];
            expect(toOtelAttributeValue(arr)).toEqual(['a', 'b', 'c']);
        });

        it('should return number arrays as-is', () => {
            const arr = [1, 2, 3];
            expect(toOtelAttributeValue(arr)).toEqual([1, 2, 3]);
        });

        it('should return boolean arrays as-is', () => {
            const arr = [true, false, true];
            expect(toOtelAttributeValue(arr)).toEqual([true, false, true]);
        });

        it('should allow null and undefined in arrays', () => {
            const stringArr = ['a', null, 'b', undefined, 'c'];
            expect(toOtelAttributeValue(stringArr)).toEqual(['a', null, 'b', undefined, 'c']);

            const numberArr = [1, null, 2, undefined, 3];
            expect(toOtelAttributeValue(numberArr)).toEqual([1, null, 2, undefined, 3]);

            const boolArr = [true, null, false, undefined];
            expect(toOtelAttributeValue(boolArr)).toEqual([true, null, false, undefined]);
        });

        it('should return empty array as-is', () => {
            expect(toOtelAttributeValue([])).toEqual([]);
        });

        it('should allow array with only null/undefined values', () => {
            expect(toOtelAttributeValue([null, undefined, null])).toEqual([null, undefined, null]);
        });
    });

    describe('invalid arrays (mixed primitive types)', () => {
        it('should JSON stringify arrays with mixed string and number types', () => {
            const arr = ['a', 1, 'b'];
            expect(toOtelAttributeValue(arr)).toBe(JSON.stringify(arr));
        });

        it('should JSON stringify arrays with mixed string and boolean types', () => {
            const arr = ['a', true, 'b'];
            expect(toOtelAttributeValue(arr)).toBe(JSON.stringify(arr));
        });

        it('should JSON stringify arrays with mixed number and boolean types', () => {
            const arr = [1, true, 2];
            expect(toOtelAttributeValue(arr)).toBe(JSON.stringify(arr));
        });

        it('should JSON stringify arrays with nested objects', () => {
            const arr = [{ a: 1 }, { b: 2 }];
            expect(toOtelAttributeValue(arr)).toBe(JSON.stringify(arr));
        });

        it('should JSON stringify arrays with nested arrays', () => {
            const arr = [[1, 2], [3, 4]];
            expect(toOtelAttributeValue(arr)).toBe(JSON.stringify(arr));
        });
    });

    describe('objects', () => {
        it('should JSON stringify plain objects', () => {
            const obj = { name: 'test', value: 42 };
            expect(toOtelAttributeValue(obj)).toBe(JSON.stringify(obj));
        });

        it('should JSON stringify nested objects', () => {
            const obj = { outer: { inner: { deep: 'value' } } };
            expect(toOtelAttributeValue(obj)).toBe(JSON.stringify(obj));
        });

        it('should JSON stringify objects with arrays', () => {
            const obj = { items: [1, 2, 3], name: 'test' };
            expect(toOtelAttributeValue(obj)).toBe(JSON.stringify(obj));
        });

        it('should JSON stringify null', () => {
            expect(toOtelAttributeValue(null)).toBe('null');
        });
    });

    describe('non-serializable values', () => {
        it('should use String() for circular references', () => {
            const obj: Record<string, unknown> = { a: 1 };
            obj.circular = obj;
            // JSON.stringify will throw, so it should fall back to String()
            expect(toOtelAttributeValue(obj)).toBe('[object Object]');
        });

        it('should use String() for BigInt values', () => {
            // BigInt cannot be serialized with JSON.stringify
            const bigInt = BigInt(9007199254740991);
            expect(toOtelAttributeValue(bigInt)).toBe('9007199254740991');
        });

        it('should handle undefined by JSON stringifying to undefined string representation', () => {
            // undefined is not a valid JSON value, but JSON.stringify returns undefined for it
            // which means the catch block will handle it
            expect(toOtelAttributeValue(undefined)).toBe('undefined');
        });

        it('should handle functions by converting to string', () => {
            const fn = () => 'test';
            // Functions are not JSON-serializable, so JSON.stringify returns undefined
            // which triggers the catch block, resulting in the function's string representation
            const result = toOtelAttributeValue(fn);
            expect(typeof result).toBe('string');
            expect(result).toContain('test');
        });

        it('should handle symbols by converting to string', () => {
            const sym = Symbol('test');
            expect(toOtelAttributeValue(sym)).toBe('Symbol(test)');
        });
    });

    describe('edge cases', () => {
        it('should handle Date objects by JSON stringifying', () => {
            const date = new Date('2024-01-01T00:00:00.000Z');
            expect(toOtelAttributeValue(date)).toBe(JSON.stringify(date));
        });

        it('should handle regex by converting to string', () => {
            const regex = /test/gi;
            // RegExp serializes to empty object in JSON
            expect(toOtelAttributeValue(regex)).toBe('{}');
        });

        it('should handle Map by converting to empty object string', () => {
            const map = new Map([['key', 'value']]);
            // Map serializes to empty object in JSON
            expect(toOtelAttributeValue(map)).toBe('{}');
        });

        it('should handle Set by converting to empty object string', () => {
            const set = new Set([1, 2, 3]);
            // Set serializes to empty object in JSON
            expect(toOtelAttributeValue(set)).toBe('{}');
        });

        it('should handle NaN as a number', () => {
            // NaN is a number in JS
            expect(toOtelAttributeValue(NaN)).toBe(NaN);
        });
    });
});
