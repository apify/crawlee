import tsEslint from 'typescript-eslint';
import tsStylistic from '@stylistic/eslint-plugin-ts';
import apify from '@apify/eslint-config/ts';
import prettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['**/dist', 'node_modules', 'coverage', 'website/{build,.docusaurus}', '**/*.d.ts'],
    },
    ...apify,
    prettier,
    {
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                project: 'tsconfig.eslint.json',
            },
        },
    },
    {
        plugins: {
            '@typescript-eslint': tsEslint.plugin,
            '@stylistic': tsStylistic,
        },
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'max-classes-per-file': 'off',
            'no-empty-function': 'off',
            'import/order': 'off', // TODO
            'no-use-before-define': 'off', // TODO
            'no-param-reassign': 'off',
            'no-void': 'off',
            'no-underscore-dangle': 'off',
            'no-console': 'off',
            'import/no-extraneous-dependencies': 'off',
            'import/extensions': 'off',
            'import/no-default-export': 'off',
            '@typescript-eslint/array-type': 'error',
            '@typescript-eslint/ban-ts-comment': 0,
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    'disallowTypeAnnotations': false,
                },
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@stylistic/member-delimiter-style': [
                'error',
                {
                    'multiline': { 'delimiter': 'semi', 'requireLast': true },
                    'singleline': { 'delimiter': 'semi', 'requireLast': false },
                },
            ],
            '@typescript-eslint/no-empty-interface': 'off',
            '@typescript-eslint/promise-function-async': 'off',
            'no-promise-executor-return': 'off',
            '@typescript-eslint/prefer-destructuring': 'off',
            'prefer-destructuring': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unused-vars': 'off',
            '@stylistic/comma-dangle': ['error', 'always-multiline'],
        },
    },
    {
        files: ['packages/templates/**/*'],
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    {
        files: ['website/**/*'],
        rules: {
            '@typescript-eslint/no-shadow': 'off',
            'no-console': 'off',
            'no-undef': 'off',
        },
    },
];
