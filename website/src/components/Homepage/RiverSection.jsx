import React from 'react';

import styles from './RiverSection.module.css';

export default function RiverSection({ title, description, content, contentOnLeft }) {
    return (
        <div className={`${styles.riverSection} ${contentOnLeft ? styles.contentLeft : styles.contentRight}`}>
            <div className={styles.riverSectionContainer}>
                <div className={styles.riverSectionText}>
                    <h3 className={styles.riverSectionTitle}>{title}</h3>
                    <p className={styles.riverSectionDescription}>{description}</p>
                    <button className={styles.riverSectionButton}>
                        Learn more <span className={styles.arrow}>→</span>
                    </button>
                </div>
                <div className={styles.riverSectionContent}>{content}</div>
            </div>
        </div>
    );
}
