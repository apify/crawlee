module.exports = {
    testTimeout: 60e3,
    maxWorkers: 3,
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: false,
    testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: [
        '<rootDir>/packages/*/src/**/*.[jt]s',
    ],
    moduleNameMapper: {
        '^crawlee$': '<rootDir>/packages/crawlee/src',
        '^@crawlee/basic$': '<rootDir>/packages/basic-crawler/src',
        '^@crawlee/browser$': '<rootDir>/packages/browser-crawler/src',
        '^@crawlee/http$': '<rootDir>/packages/http-crawler/src',
        '^@crawlee/dom$': '<rootDir>/packages/dom-crawler/src',
        '^@crawlee/cheerio$': '<rootDir>/packages/cheerio-crawler/src',
        '^@crawlee/playwright$': '<rootDir>/packages/playwright-crawler/src',
        '^@crawlee/puppeteer$': '<rootDir>/packages/puppeteer-crawler/src',
        '^@crawlee/(.*)/(.*)$': '<rootDir>/packages/$1/$2',
        '^@crawlee/(.*)$': '<rootDir>/packages/$1/src',
        '^test/(.*)$': '<rootDir>/test/$1',
    },
    modulePathIgnorePatterns: [
        '<rootDir>/(.*)/dist',
        '<rootDir>/package.json',
    ],
    globals: {
        'ts-jest': {
            tsconfig: 'test/tsconfig.json',
        },
    },
};
