"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const react_1 = tslib_1.__importDefault(require("react"));
const Link_1 = tslib_1.__importDefault(require("@docusaurus/Link"));
// eslint-disable-next-line import/no-extraneous-dependencies
const client_1 = require("@docusaurus/plugin-content-docs/client");
const useDocusaurusContext_1 = tslib_1.__importDefault(require("@docusaurus/useDocusaurusContext"));
const { version: packageJsonVersion } = require('../../../packages/crawlee/package.json');
const [major, minor] = packageJsonVersion.split('.');
const stable = [major, minor].join('.');
const ApiLink = ({ to, children }) => {
    const version = (0, client_1.useDocsVersion)();
    const { siteConfig } = (0, useDocusaurusContext_1.default)();
    if (siteConfig.presets[0][1].docs.disableVersioning || version.version === stable) {
        return (<Link_1.default to={`/js/api/${to}`}>{children}</Link_1.default>);
    }
    return (<Link_1.default to={`/js/api/${version.version === 'current' ? 'next' : version.version}/${to}`}>{children}</Link_1.default>);
};
exports.default = ApiLink;
