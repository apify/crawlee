import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import { useThemeConfig } from '@docusaurus/theme-common';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Logo from '@theme/Logo';
import ThemedImage from '@theme/ThemedImage';
import React from 'react';

import styles from './index.module.css';

export default function LogoWrapper(props) {
    const ArrowsIcon = require('../../../../static/img/menu-arrows.svg').default;
    const CheckIcon = require('../../../../static/img/check.svg').default;
    const { navbar: { logo } } = useThemeConfig();
    const javascriptLogo = {
        light: useBaseUrl('img/crawlee-javascript-light.svg'),
        dark: useBaseUrl('img/crawlee-javascript-dark.svg'),
    };
    const pythonLogo = {
        light: useBaseUrl('img/crawlee-python-light.svg'),
        dark: useBaseUrl('img/crawlee-python-dark.svg'),
    };
    const languageAgnosticLogo = {
        light: useBaseUrl(logo.src),
        dark: useBaseUrl(logo.srcDark || logo.src),
    };
    const location = useLocation();
    const isOnLanguageAgnosticPage = location.pathname === '/' || location.pathname.includes('/blog');
    return (
        <div className={styles.navbarLogo}>
            <div className={styles.logoWithArrows}>
                <Logo />
                <ArrowsIcon />
            </div>
            <div className={styles.menuWrapper}>
                <div className={styles.menu}>
                    <Link className={styles.menuItem} to="/javascript">
                        <ThemedImage sources={javascriptLogo} alt="Crawlee JavaScript" />
                        {!isOnLanguageAgnosticPage && <CheckIcon />}
                    </Link>
                    <Link className={styles.menuItem} href="https://crawlee.dev/python" target="_self" rel="dofollow">
                        < ThemedImage sources={pythonLogo} alt="Crawlee Python" />
                    </Link>
                    <Link className={styles.menuItem} to="/">
                        <ThemedImage sources={languageAgnosticLogo} alt="Crawlee" />
                        {isOnLanguageAgnosticPage && <CheckIcon />}
                    </Link>
                </div>
            </div>
        </div >
    );
}
