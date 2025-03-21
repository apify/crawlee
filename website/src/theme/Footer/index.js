import Link from '@docusaurus/Link';
import { useThemeConfig } from '@docusaurus/theme-common';
import LinkItem from '@theme/Footer/LinkItem';
import NavbarColorModeToggle from '@theme/Navbar/ColorModeToggle';
import ThemedImage from '@theme/ThemedImage';
import clsx from 'clsx';
import React from 'react';

import styles from './index.module.css';

function FooterLinksColumn({ column }) {
    return (
        <div>
            <div className={styles.footerTitle}>{column.title}</div>
            <ul className={clsx(styles.footerList, 'clean-list')}>
                {column.items.map((item, i) => (
                    <li key={i}>
                        <LinkItem item={item} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Footer() {
    const { footer } = useThemeConfig();
    if (!footer) {
        return null;
    }
    const { links, style } = footer;
    const HearthIcon = require('../../../static/img/hearth.svg').default;

    return (
        <footer className={clsx(styles.footer, style)}>
            <div className={styles.footerTop}>
                <div className={styles.footerTopRow}>
                    <div className={styles.footerTopRowLeft}>
                        <Link to="/" width="120" className={styles.footerLogo}>
                            <ThemedImage
                                width="120"
                                alt="Docusaurus themed image"
                                sources={{
                                    light: '/img/crawlee-light.svg',
                                    dark: '/img/crawlee-dark.svg',
                                }}
                            />
                        </Link>
                        <NavbarColorModeToggle />
                    </div>
                    <div className={styles.footerTopRowRight}>
                        <FooterLinksColumn column={links[0]} />
                        <FooterLinksColumn column={links[1]} />
                        <FooterLinksColumn column={links[2]} />
                    </div>
                </div>
            </div>

            <div className={styles.footerBottom}>
                <div className={styles.footerBottomRow}>
                    <div>
                        <HearthIcon className={styles.hearthIcon} />
                        Crawlee is forever free and open source
                    </div>
                    <div>© {new Date().getFullYear()} Apify</div>
                </div>
            </div>
        </footer>
    );
}

export default React.memo(Footer);
