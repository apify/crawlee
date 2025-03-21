import {
    useLockBodyScroll,
    useNavbarMobileSidebar,
    useWindowSize,
} from '@docusaurus/theme-common/internal';
import NavbarMobileSidebarHeader from '@theme/Navbar/MobileSidebar/Header';
import NavbarMobileSidebarLayout from '@theme/Navbar/MobileSidebar/Layout';
import NavbarMobileSidebarPrimaryMenu from '@theme/Navbar/MobileSidebar/PrimaryMenu';
import NavbarMobileSidebarSecondaryMenu from '@theme/Navbar/MobileSidebar/SecondaryMenu';
import React from 'react';

export default function NavbarMobileSidebar() {
    const mobileSidebar = useNavbarMobileSidebar();
    const windowSize = useWindowSize({
        desktopBreakpoint: 1200,
    });

    useLockBodyScroll(mobileSidebar.shown);
    const shouldRender = !mobileSidebar.disabled && windowSize === 'mobile';
    if (!shouldRender) {
        return null;
    }
    return (
        <NavbarMobileSidebarLayout
            header={<NavbarMobileSidebarHeader />}
            primaryMenu={<NavbarMobileSidebarPrimaryMenu />}
            secondaryMenu={<NavbarMobileSidebarSecondaryMenu />}
        />
    );
}
