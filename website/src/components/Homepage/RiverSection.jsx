import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';

import styles from './RiverSection.module.css';

export default function RiverSection({ title, description, content, reversed, to }) {
    return (
        <div className={styles.riverWrapper}>
            <div className={clsx(styles.riverContainer, { [styles.riverReversed]: reversed })}>
                <div className={clsx(styles.riverSection, styles.riverText)}>
                    <h3 className={styles.riverTitle}>{title}</h3>
                    <p className={styles.riverDescription}>{description}</p>
                    <Link className={styles.riverButton} to={to}>
                        Learn more
                    </Link>
                </div>
                <div className={clsx(styles.riverSection, styles.riverContent)}>{content}</div>
            </div>
        </div>
    );
}
