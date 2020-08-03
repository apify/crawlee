const path = require('path');

module.exports = {
    testEnvironment: 'node',
    testRunner: 'jest-circus/runner',
    verbose: true,
    rootDir: path.join(__dirname, './'),
    testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
        '^.+\\.js$': 'babel-jest',
    },
};
