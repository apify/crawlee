import React from 'react';

import CopyButton from '../CopyButton';
import styles from './HomepageCliExample.module.css';

export default function CliExample({ example }) {
    return (
        <section className={styles.cliExampleSection}>
            <div className={styles.cliExampleTitle}>
                Or start with a template from our CLI
            </div>
            <code className={styles.cliExampleCodeBlock}>
                <pre>
                    <span className={styles.cliCommandPrefix}>$</span>
                    {example}
                    <CopyButton copyText={example} />
                </pre>
            </code>
            <div className={styles.cliExampleSubtitle}>
                Built with 🤍 by Apify. Forever free and open-source.
            </div>
        </section>
    );
}
