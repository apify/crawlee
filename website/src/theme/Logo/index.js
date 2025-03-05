import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import { useThemeConfig } from '@docusaurus/theme-common';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import clsx from 'clsx';
import React from 'react';

import styles from './styles.module.css';

export default function Logo() {
    const {
        navbar: { logo },
    } = useThemeConfig();
    const javascriptLogo = {
        light: useBaseUrl('img/crawlee-javascript-light.svg'),
        dark: useBaseUrl('img/crawlee-javascript-dark.svg'),
    };
    const languageAgnosticLogo = {
        light: useBaseUrl(logo.src),
        dark: useBaseUrl(logo.srcDark || logo.src),
    };
    const location = useLocation();
    const isOnLanguageAgnosticPage = location.pathname === '/' || location.pathname.includes('/blog');
    return (
        <Link
            className={clsx(styles.logoImage, 'sidebarLogo')}
            to={isOnLanguageAgnosticPage ? '/' : '/js'}
        >
            <ThemedImage
                alt={isOnLanguageAgnosticPage ? 'Crawlee' : 'Crawlee JavaScript'}
                sources={isOnLanguageAgnosticPage ? languageAgnosticLogo : javascriptLogo}
            />
        </Link>
    );
}
