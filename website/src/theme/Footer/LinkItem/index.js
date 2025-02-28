import isInternalUrl from '@docusaurus/isInternalUrl';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import clsx from 'clsx';
import React from 'react';

import styles from './index.module.css';

export default function FooterLinkItem({ item }) {
    const ExternalLinkIcon = require('../../../../static/img/external-link.svg').default;

    const { to, href, label, prependBaseUrlToHref, className, ...props } = item;
    const toUrl = useBaseUrl(to);
    const normalizedHref = useBaseUrl(href, { forcePrependBaseUrl: true });

    return (
        <Link
            className={clsx('footer__link-item', className, styles.footerLink)}
            {...(href
                ? {
                    href: prependBaseUrlToHref ? normalizedHref : href,
                }
                : {
                    to: toUrl,
                })}
            {...props}>
            {label}
            {href && !isInternalUrl(href) && <ExternalLinkIcon className={styles.externalLinkIcon} />}
        </Link>
    );
}
