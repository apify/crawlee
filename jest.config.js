const path = require('path');

module.exports = {
    testEnvironment: 'node',
    testRunner: 'jest-circus/runner',
    verbose: true,
    rootDir: path.join(__dirname, './'),
    testTimeout: 30e3,
    maxWorkers: 3,
    testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
        '^.+\\.js$': 'babel-jest',
    },
};
