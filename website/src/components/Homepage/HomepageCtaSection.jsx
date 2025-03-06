import React from 'react';

import styles from './HomepageCtaSection.module.css';
import Button from '../Button';

export default function HomepageCtaSection({ showJs, showPython }) {
    return (
        <section className={styles.ctaSection}>
            <h2 className={styles.ctaTitle}>Get started now!</h2>
            <div className={styles.ctaDescription}>
                Crawlee won’t fix broken selectors for you (yet), but it makes
                building and maintaining reliable crawlers faster and easier—so
                you can focus on what matters most.
            </div>
            <div className={styles.ctaButtonContainer}>
                {showJs && <Button to='https://crawlee.dev/js' withIcon type='secondary' isBig>Get started with JS</Button>}
                {showPython && <Button to='https://crawlee.dev/python' withIcon type='secondary' isBig>Get started with Python</Button>}
            </div>
        </section>
    );
}
