import React from 'react';

import styles from './HomepageHeroSection.module.css';
import homepageStyles from '../../pages/index.module.css';

export default function HomepageHeroSection() {
    return (
        <section className={styles.hero}>
            <h1 className={styles.heroTitle}>
                Build reliable web scrapers. Fast.
            </h1>
            <div
                className={homepageStyles.dashedSeparator}
                id={styles.separatorHeroHeader}
            />
            <p className={styles.heroSubtitle}>
                Crawlee is a web scraping library for JavaScript and Python. It
                handles blocking, crawling, proxies, and browsers for you.
            </p>
            <div
                className={homepageStyles.dashedSeparator}
                id={styles.separatorHeroHeader2}
            >
                <div
                    className={homepageStyles.dashedDecorativeCircle}
                    id={styles.heroDecorativeCircle}
                />
            </div>
        </section>
    );
}
