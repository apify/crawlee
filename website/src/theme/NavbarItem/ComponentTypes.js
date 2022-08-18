import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import LocaleDropdownNavbarItem from '@theme/NavbarItem/LocaleDropdownNavbarItem';
import SearchNavbarItem from '@theme/NavbarItem/SearchNavbarItem';
import HtmlNavbarItem from '@theme/NavbarItem/HtmlNavbarItem';
import DocSidebarNavbarItem from '@theme/NavbarItem/DocSidebarNavbarItem';
import DocsVersionNavbarItem from '@theme/NavbarItem/DocsVersionNavbarItem';
import DocsVersionDropdownNavbarItem from '@theme/NavbarItem/DocsVersionDropdownNavbarItem';
import React from 'react';
import { useActiveDocContext } from '@docusaurus/plugin-content-docs/client';
import { useDocsVersion, useLayoutDoc } from '@docusaurus/theme-common/internal';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const pkg = require('../../../../packages/crawlee/package.json');

const [v1, v2] = pkg.version.split('.');
const stable = [v1, v2].join('.');

function DocNavbarItem({
    docId,
    label: staticLabel,
    docsPluginId,
    ...props
}) {
    const { activeDoc } = useActiveDocContext(docsPluginId);
    const doc = useLayoutDoc(docId, docsPluginId);
    // Draft items are not displayed in the navbar.
    if (doc === null) {
        return null;
    }
    return (
        <DefaultNavbarItem
            exact
            {...props}
            isActive={() => activeDoc?.path.startsWith(doc.path)}
            label={staticLabel ?? doc.id}
            to={doc.path}
        />
    );
}

function ApiNavbarItem(ctx) {
    const { activeDoc, activeVersion } = useActiveDocContext();
    const version = useDocsVersion();
    const { siteConfig } = useDocusaurusContext();
    console.log(ctx, activeDoc, activeVersion, activeVersion?.path.replace(/^\/docs/, '/api'));
    console.log(window.location.href, version);
    // const { activeDoc } = useActiveDocContext(docsPluginId);
    // const doc = useLayoutDoc(docId, docsPluginId);
    // console.log(activeDoc, doc, (!!activeDoc?.sidebar && activeDoc.sidebar === doc.sidebar));
    // Draft items are not displayed in the navbar.
    // if (doc === null) {
    //     return null;
    // }

    if (siteConfig.presets[0][1].docs.disableVersioning || version.version === stable) {
        return (
            <DefaultNavbarItem
                exact
                {...ctx}
                isActive={() => activeDoc?.path.startsWith(activeVersion?.path.replace(/^\/docs/, '/api'))}
                label={ctx.staticLabel ?? ctx.label}
                to={`api/${ctx.to}`}
            />
        );
    }

    return (
        <DefaultNavbarItem
            exact
            {...ctx}
            isActive={() => activeDoc?.path.startsWith(activeVersion?.path.replace(/^\/docs/, '/api'))}
            label={ctx.staticLabel ?? ctx.label}
            to={`api/${version.version === 'current' ? 'next' : version.version}/${ctx.to}`}
        />
    );
}

const ComponentTypes = {
    'default': DefaultNavbarItem,
    'localeDropdown': LocaleDropdownNavbarItem,
    'search': SearchNavbarItem,
    'dropdown': DropdownNavbarItem,
    'html': HtmlNavbarItem,
    'custom-api': ApiNavbarItem,
    'doc': DocNavbarItem,
    'docSidebar': DocSidebarNavbarItem,
    'docsVersion': DocsVersionNavbarItem,
    'docsVersionDropdown': DocsVersionDropdownNavbarItem,
};
export default ComponentTypes;
