import React from 'react';
import { useThemeConfig } from '@docusaurus/theme-common';
import {
    splitNavbarItems,
    useNavbarMobileSidebar,
} from '@docusaurus/theme-common/internal';
import NavbarItem from '@theme/NavbarItem';
import NavbarColorModeToggle from '@theme/Navbar/ColorModeToggle';
import SearchBar from '@theme/SearchBar';
import NavbarMobileSidebarToggle from '@theme/Navbar/MobileSidebar/Toggle';
import NavbarLogo from '@theme/Navbar/Logo';
import NavbarSearch from '@theme/Navbar/Search';
import styles from './styles.module.css';

function useNavbarItems() {
    return useThemeConfig().navbar.items;
}

function NavbarItems({ items }) {
    return (
        <>
            {items.map((item, i) => (
                <NavbarItem {...item} key={i}/>
            ))}
        </>
    );
}

function NavbarContentLayout({
    left,
    right
}) {
    return (
        <div className="navbar__inner">
            <div className="navbar__items">{left}</div>
            <div className="navbar__items navbar__items--right">{right}</div>
        </div>
    );
}

export default function NavbarContent() {
    const mobileSidebar = useNavbarMobileSidebar();
    const items = useNavbarItems();
    const [leftItems, rightItems] = splitNavbarItems(items);
    const searchBarItem = items.find((item) => item.type === 'search');
    return (
        <NavbarContentLayout
            left={
                <>
                    {!mobileSidebar.disabled && <NavbarMobileSidebarToggle/>}
                    <NavbarLogo/>
                    <NavbarItems items={leftItems}/>
                </>
            }
            right={
                <>
                    <NavbarColorModeToggle className={styles.colorModeToggle}/>
                    <NavbarItems items={rightItems}/>
                    {!searchBarItem && (
                        <NavbarSearch>
                            <SearchBar/>
                        </NavbarSearch>
                    )}
                </>
            }
        />
    );
}
