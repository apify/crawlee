/* eslint-disable react/prop-types */
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React from 'react';

export default function MDXA(props) {
    const { siteConfig } = useDocusaurusContext();
    if (props.href?.startsWith(siteConfig.url)) {
        const { href, ...rest } = props;
        rest.to = props.href.replace(siteConfig.url + siteConfig.baseUrl, '/');
        props = rest;
    }

    return <Link {...props} />;
}
