import clsx from 'clsx';
import React from 'react';

import styles from './RiverSection.module.css';
import ArrowRightIcon from '../../../static/img/arrow_right.svg';

export default function RiverSection({ title, description, content, reversed }) {
    return (
        <div className={styles.riverWrapper}>
            <div className={clsx(styles.riverContainer, { [styles.riverReversed]: reversed })}>
                <div className={clsx(styles.riverSection, styles.riverText)}>
                    <h3 className={styles.riverTitle}>{title}</h3>
                    <p className={styles.riverDescription}>{description}</p>
                    <button className={styles.riverButton}>
                        Learn more
                        <ArrowRightIcon />
                    </button>
                </div>
                <div className={clsx(styles.riverSection, styles.riverContent)}>{content}</div>
            </div>
        </div>
    );
}
