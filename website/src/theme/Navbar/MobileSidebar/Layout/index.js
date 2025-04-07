import { useNavbarSecondaryMenu } from '@docusaurus/theme-common/internal';
import clsx from 'clsx';
import React from 'react';

export default function NavbarMobileSidebarLayout({
    header,
    primaryMenu,
    secondaryMenu,
}) {
    const { shown: secondaryMenuShown } = useNavbarSecondaryMenu();
    return (
        <div className="navbar-sidebar">
            {header}
            <div
                className={clsx('navbar-sidebar__items', {
                    'navbar-sidebar__items--show-secondary': secondaryMenuShown,
                })}>
                <div className="navbar-sidebar__item menu menu-primary">{primaryMenu}</div>
                <div className="navbar-sidebar__item menu menu-secondary">{secondaryMenu}</div>
            </div>
        </div>
    );
}
