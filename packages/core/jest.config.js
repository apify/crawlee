const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    '^@crawlee/memory-storage(.*)$': '<rootDir>/../memory-storage/src$1',
    '^@crawlee/types(.*)$': '<rootDir>/../types/src$1',
    '^@crawlee/utils(.*)$': '<rootDir>/../utils/src$1', // ✅ This line
  },
  transform: {
    ...tsJestTransformCfg,
  },
};
