import Link from '@docusaurus/Link';
import { translate } from '@docusaurus/Translate';
import IconHome from '@theme/Icon/Home';
import React from 'react';

import styles from './styles.module.css';

export default function HomeBreadcrumbItem() {
    return (
        <li className="breadcrumbs__item">
            <Link
                aria-label={translate({
                    id: 'theme.docs.breadcrumbs.home',
                    message: 'Home page',
                    description: 'The ARIA label for the home page in the breadcrumbs',
                })}
                className="breadcrumbs__link"
                href="/js">
                <IconHome className={styles.breadcrumbHomeIcon} />
            </Link>
        </li>
    );
}
