import React from 'react';
import clsx from 'clsx';
// eslint-disable-next-line import/no-extraneous-dependencies
import { useThemeConfig } from '@docusaurus/theme-common';
import LinkItem from '@theme/Footer/LinkItem';
import styles from './index.module.css';

function FooterLinksColumn({ column }) {
    return (
        <>
            <div className={styles.footerTitle}>{column.title}</div>
            <ul className={clsx(styles.footerItem, 'clean-list')}>
                {column.items.map((item, i) => (
                    <li key={i} className="footer__item">
                        <LinkItem item={item} />
                    </li>
                ))}
            </ul>
        </>
    );
}

function Footer() {
    const { footer } = useThemeConfig();
    if (!footer) {
        return null;
    }
    const { links, style } = footer;
    const OpenSourceIcon = require('../../../static/img/footer-open-source.svg').default;
    const ApifyLogo = require('../../../static/img/footer-apify-logo.svg').default;
    return (
        <footer className={clsx(styles.footer, style)}>
            <div className="container padding-horiz--lg">
                <div className="row">
                    <div className="col col--5">
                        <div className="row">
                            <div className="col col--6">
                                <FooterLinksColumn column={links[0]} />
                            </div>
                            <div className="col col--6">
                                <FooterLinksColumn column={links[1]} />
                            </div>
                        </div>
                    </div>
                    <div className="col col--7">
                        <div className="row">
                            <div className="col col--3 col--offset-9">
                                <FooterLinksColumn column={links[2]} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="row padding-vert--md padding-top--lg">
                    <div className="col padding-vert--md col--6">
                        <div className={styles.freeAndOpenSource}>
                            <OpenSourceIcon className={styles.alignMiddle} />
                            <span className={styles.alignMiddle}>Crawlee is free and open source</span>
                        </div>
                    </div>
                    <div className="col padding-vert--md col--6 text--right">
                        <span className={styles.builtBy}>
                            <span className={styles.alignMiddle}>Built by</span>
                            <a href="https://apify.com"><ApifyLogo className={styles.alignMiddle} /></a>
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export default React.memo(Footer);
