import { parseValue, serializeValue } from '@crawlee/core';

describe('key_value_store_codec', () => {
    describe('serializeValue()', () => {
        test('no content type → JSON-serializes object and infers json content type', () => {
            const { value, contentType } = serializeValue({ foo: 'bar' });
            expect(value).toBe('{\n  "foo": "bar"\n}');
            expect(contentType).toBe('application/json; charset=utf-8');
        });

        test('no content type + string → text/plain passthrough', () => {
            const { value, contentType } = serializeValue('xxx');
            expect(value).toBe('xxx');
            expect(contentType).toBe('text/plain; charset=utf-8');
        });

        test('no content type + Buffer → octet-stream passthrough', () => {
            const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
            const { value, contentType } = serializeValue(buf);
            expect(value).toBe(buf);
            expect(contentType).toBe('application/octet-stream');
        });

        test('no content type + typed array → octet-stream passthrough', () => {
            const u8 = new Uint8Array([1, 2, 3]);
            const { value, contentType } = serializeValue(u8);
            expect(value).toBe(u8);
            expect(contentType).toBe('application/octet-stream');
        });

        test('no content type + stream → octet-stream passthrough', () => {
            const fakeStream = { pipe: () => {} };
            const { value, contentType } = serializeValue(fakeStream);
            expect(value).toBe(fakeStream);
            expect(contentType).toBe('application/octet-stream');
        });

        test('explicit content type → value passes through unchanged', () => {
            const { value, contentType } = serializeValue('xxx', 'text/plain; charset=utf-8');
            expect(value).toBe('xxx');
            expect(contentType).toBe('text/plain; charset=utf-8');

            const buf = Buffer.from('bytes');
            const buffered = serializeValue(buf, 'image/jpeg');
            expect(buffered.value).toBe(buf);
            expect(buffered.contentType).toBe('image/jpeg');
        });

        test('"Object is too large" remap', () => {
            const tooLong = {
                toJSON() {
                    throw new Error('Invalid string length');
                },
            };
            expect(() => serializeValue(tooLong)).toThrow(
                'The "value" parameter cannot be stringified to JSON: Object is too large',
            );
        });

        test('circular structure error is surfaced', () => {
            const obj: Record<string, unknown> = {};
            obj.self = obj;
            expect(() => serializeValue(obj)).toThrow(
                'The "value" parameter cannot be stringified to JSON: Converting circular structure to JSON',
            );
        });

        test('undefined-after-stringify guard', () => {
            expect(() => serializeValue(undefined)).toThrow(
                'The "value" parameter was stringified to JSON and returned undefined.',
            );
        });
    });

    describe('parseValue()', () => {
        test('json content type → parsed object', () => {
            const body = Buffer.from('{"foo":"bar"}');
            expect(parseValue(body, 'application/json; charset=utf-8')).toEqual({ foo: 'bar' });
        });

        test('JSON5 features (trailing commas, comments)', () => {
            const body = Buffer.from('{ foo: "bar", /* comment */ baz: 1, }');
            expect(parseValue(body, 'application/json')).toEqual({ foo: 'bar', baz: 1 });
        });

        test('text/* → string', () => {
            const body = Buffer.from('plain text');
            expect(parseValue(body, 'text/plain; charset=utf-8')).toBe('plain text');
        });

        test('application/*xml → string', () => {
            const body = Buffer.from('<root/>');
            expect(parseValue(body, 'application/xml')).toBe('<root/>');
        });

        test('unknown content type → raw buffer', () => {
            const body = Buffer.from([0, 1, 2, 3]);
            expect(parseValue(body, 'application/octet-stream')).toBe(body);
        });

        test('unknown charset → raw buffer', () => {
            const body = Buffer.from('text');
            expect(parseValue(body, 'text/plain; charset=not-a-real-charset')).toBe(body);
        });

        test('unparseable content type header → raw buffer', () => {
            const body = Buffer.from('text');
            expect(parseValue(body, '')).toBe(body);
        });

        test('ArrayBuffer input is decoded as UTF-8', () => {
            const source = Buffer.from('{"a":1}');
            const arrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
            expect(parseValue(arrayBuffer, 'application/json')).toEqual({ a: 1 });
        });
    });

    describe('round-trips', () => {
        test('object → json → object', () => {
            const original = { foo: 'bar', nested: { n: 1 } };
            const { value, contentType } = serializeValue(original);
            expect(parseValue(Buffer.from(value as string), contentType)).toEqual(original);
        });

        test('string → text → string', () => {
            const original = 'hello world';
            const { value, contentType } = serializeValue(original, 'text/plain; charset=utf-8');
            expect(parseValue(Buffer.from(value as string), contentType)).toBe(original);
        });

        test('Buffer → octet-stream → Buffer', () => {
            const original = Buffer.from([1, 2, 3, 4]);
            const { value, contentType } = serializeValue(original, 'application/octet-stream');
            expect(parseValue(value as Buffer, contentType)).toBe(original);
        });

        test('no content type: string round-trips as a string', () => {
            const original = 'hello world';
            const { value, contentType } = serializeValue(original);
            expect(parseValue(Buffer.from(value as string), contentType)).toBe(original);
        });

        test('no content type: Buffer round-trips as a Buffer (not JSON-mangled)', () => {
            const original = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
            const { value, contentType } = serializeValue(original);
            const parsed = parseValue(value as Buffer, contentType);
            expect(Buffer.isBuffer(parsed)).toBe(true);
            expect((parsed as Buffer).equals(original)).toBe(true);
        });
    });
});
