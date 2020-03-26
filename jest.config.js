const path = require('path');

module.exports = {
    verbose: true,
    testEnvironment: 'node',
    rootDir: path.join(__dirname, './'),
    testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
        '^.+\\.js$': 'babel-jest',
    },
};
