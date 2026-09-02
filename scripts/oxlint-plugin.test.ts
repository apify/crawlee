import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import { preferPrivateFields } from './oxlint-plugin.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

ruleTester.run('prefer-private-fields', preferPrivateFields, {
    valid: [
        'class A { #a = 1; }',
        'class A { static #a = 1; }',
        'class A { readonly #a = 1; }',
        'class A { #a() {} }',
        'class A { a = 1; }',
        'class A { protected a = 1; }',
        'class A { public a = 1; }',
        'class A { constructor(readonly a: number) {} }',
        'abstract class A { protected abstract a(): void; }',
    ],
    invalid: [
        { name: 'field', code: 'class A { private a = 1; }', errors: [{ messageId: 'preferHash' }] },
        { name: 'static field', code: 'class A { private static a = 1; }', errors: [{ messageId: 'preferHash' }] },
        { name: 'readonly field', code: 'class A { private readonly a = 1; }', errors: [{ messageId: 'preferHash' }] },
        { name: 'method', code: 'class A { private a() {} }', errors: [{ messageId: 'preferHash' }] },
        { name: 'getter', code: 'class A { private get a() { return 1; } }', errors: [{ messageId: 'preferHash' }] },
        {
            name: 'parameter property',
            code: 'class A { constructor(private a: number) {} }',
            errors: [{ messageId: 'preferHash' }],
        },
        {
            name: 'abstract member',
            code: 'abstract class A { private abstract a(): void; }',
            errors: [{ messageId: 'preferHash' }],
        },
    ],
});
