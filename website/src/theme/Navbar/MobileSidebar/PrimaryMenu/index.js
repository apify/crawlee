import { useLocation } from '@docusaurus/router';
import { useThemeConfig } from '@docusaurus/theme-common';
import { useNavbarMobileSidebar } from '@docusaurus/theme-common/internal';
import NavbarItem from '@theme/NavbarItem';
import React from 'react';

const GENERIC_PAGE_ITEMS = [{
    to: 'javascript',
    label: 'JavaScript',
    position: 'left',
}, {
    to: 'https://crawlee.dev/python',
    label: 'Python',
    rel: 'dofollow',
    target: '_self',
    position: 'left',
},
{
    to: 'blog',
    label: 'Blog',
    position: 'left',
}];

function useNavbarItems() {
    const location = useLocation();
    const defaultItems = useThemeConfig().navbar.items;
    const isOnLanguageAgnosticPage = location.pathname === '/' || location.pathname.includes('/blog');
    return isOnLanguageAgnosticPage ? GENERIC_PAGE_ITEMS : defaultItems;
}
// The primary menu displays the navbar items
export default function NavbarMobilePrimaryMenu() {
    const mobileSidebar = useNavbarMobileSidebar();
    const items = useNavbarItems();

    return (
        <ul className="menu__list">
            {items.map((item, i) => (
                <NavbarItem
                    mobile
                    {...item}
                    onClick={() => mobileSidebar.toggle()}
                    key={i}
                />
            ))}
        </ul>
    );
}
