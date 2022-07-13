import React from 'react';
import Link from '@docusaurus/Link';
// eslint-disable-next-line import/no-extraneous-dependencies
import { useDocsVersion } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const ApiLink = ({ to, children }) => {
    const version = useDocsVersion();
    const { siteConfig } = useDocusaurusContext();

    if (siteConfig.presets[0][1].docs.disableVersioning) {
        return (
            <Link to={`/api/${to}`}>{children}</Link>
        );
    }

    return (
        <Link to={`/api/${version.version === 'current' ? 'next' : version.version}/${to}`}>{children}</Link>
    );
};

export default ApiLink;
