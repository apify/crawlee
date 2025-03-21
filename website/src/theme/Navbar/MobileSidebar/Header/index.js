import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import { useNavbarMobileSidebar } from '@docusaurus/theme-common/internal';
import { translate } from '@docusaurus/Translate';
import IconClose from '@theme/Icon/Close';
import NavbarLogo from '@theme/Navbar/Logo';
import SearchBar from '@theme/SearchBar';
import clsx from 'clsx';
import React from 'react';

import styles from './index.module.css';

function CloseButton() {
    const mobileSidebar = useNavbarMobileSidebar();
    return (
        <button
            type="button"
            aria-label={translate({
                id: 'theme.docs.sidebar.closeSidebarButtonAriaLabel',
                message: 'Close navigation bar',
                description: 'The ARIA label for close button of mobile sidebar',
            })}
            className="clean-btn navbar-sidebar__close"
            onClick={() => mobileSidebar.toggle()}>
            <IconClose color="var(--ifm-color-emphasis-600)" />
        </button>
    );
}
export default function NavbarMobileSidebarHeader() {
    const location = useLocation();
    const isOnLanguageAgnosticPage = location.pathname === '/' || location.pathname.includes('/blog');
    const { toggle, shown } = useNavbarMobileSidebar();
    const closeSidebar = () => shown && toggle();

    return (
        <div className="navbar-sidebar__brand">
            <div className={styles.navbarHeader}>
                <NavbarLogo />

                {!isOnLanguageAgnosticPage && <div className={clsx(styles.navbarButtonsWrapper, styles.navbarButtonsWrapperDesktop)} >
                    <div onClick={closeSidebar} >
                        <SearchBar />
                    </div>
                    <Link className={styles.getStartedButton} to="/js/docs/quick-start" onClick={closeSidebar} >
                        Get started
                    </Link>
                </div>}
                <CloseButton />
            </div>
            {!isOnLanguageAgnosticPage && <div className={clsx(styles.navbarButtonsWrapper, styles.navbarButtonsWrapperMobile)} >
                <Link className={styles.getStartedButton} to="/js/docs/quick-start" onClick={closeSidebar}>
                    Get started
                </Link>
                <div onClick={closeSidebar} >
                    <SearchBar />
                </div>
            </div>}

        </div>
    );
}
