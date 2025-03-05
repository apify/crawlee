import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';

import styles from './Button.module.css';

export default function Button({ children, to }) {
    return (
        <Link to={to}>
            <button className={clsx(styles.button, styles.buttonPrimary)}>
                {children}
            </button>
        </Link>
    );
}
