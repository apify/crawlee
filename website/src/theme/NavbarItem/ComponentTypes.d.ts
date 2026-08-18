export default ComponentTypes;
declare const ComponentTypes: {
    default: typeof DefaultNavbarItem;
    localeDropdown: typeof LocaleDropdownNavbarItem;
    search: typeof SearchNavbarItem;
    dropdown: typeof DropdownNavbarItem;
    html: typeof HtmlNavbarItem;
    'custom-api': typeof ApiNavbarItem;
    doc: typeof DocNavbarItem;
    docSidebar: typeof DocSidebarNavbarItem;
    docsVersion: typeof DocsVersionNavbarItem;
    docsVersionDropdown: typeof DocsVersionDropdownNavbarItem;
};
import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';
import LocaleDropdownNavbarItem from '@theme/NavbarItem/LocaleDropdownNavbarItem';
import SearchNavbarItem from '@theme/NavbarItem/SearchNavbarItem';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import HtmlNavbarItem from '@theme/NavbarItem/HtmlNavbarItem';
declare function ApiNavbarItem(ctx: any): React.JSX.Element;
declare function DocNavbarItem({ docId, label: staticLabel, docsPluginId, ...props }: {
    [x: string]: any;
    docId: any;
    label: any;
    docsPluginId: any;
}): React.JSX.Element | null;
import DocSidebarNavbarItem from '@theme/NavbarItem/DocSidebarNavbarItem';
import DocsVersionNavbarItem from '@theme/NavbarItem/DocsVersionNavbarItem';
import DocsVersionDropdownNavbarItem from '@theme/NavbarItem/DocsVersionDropdownNavbarItem';
import React from 'react';
