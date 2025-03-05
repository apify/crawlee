import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';

import styles from './Button.module.css';
import CrawleeSvg from '../../static/img/crawlee-logo-monocolor.svg';

export default function Button({ children, to, withIcon, type = 'primary', className, isBig }) {
    return (
        <Link to={to}>
            <button className={clsx(
                className,
                styles.button,
                type === 'primary' && styles.buttonPrimary,
                type === 'secondary' && styles.buttonSecondary,
                isBig && styles.big,
            )}>
                {withIcon && <CrawleeSvg />}
                {children}
            </button>
        </Link>
    );
}
