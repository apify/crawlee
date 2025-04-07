import React from 'react';
import Link from '@docusaurus/Link';
// eslint-disable-next-line import/no-extraneous-dependencies
import { useDocsVersion } from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const pkg = require('../../../packages/crawlee/package.json');

const [v1, v2] = pkg.version.split('.');
const stable = [v1, v2].join('.');

const ApiLink = ({ to, children }) => {
    const version = useDocsVersion();
    const { siteConfig } = useDocusaurusContext();

    if (siteConfig.presets[0][1].docs.disableVersioning || version.version === stable) {
        return (
            <Link to={`/js/api/${to}`}>{children}</Link>
        );
    }

    return (
        <Link to={`/js/api/${version.version === 'current' ? 'next' : version.version}/${to}`}>{children}</Link>
    );
};

export default ApiLink;
