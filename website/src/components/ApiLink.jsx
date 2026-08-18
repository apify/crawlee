import React from 'react';
import Link from '@docusaurus/Link';
// eslint-disable-next-line import/no-extraneous-dependencies
import { useDocsVersion } from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const versions = require('../../versions.json');

// the latest snapshot is served unversioned at /js/api, same logic as in NavbarItem/ComponentTypes.js
const stable = versions[0];

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
