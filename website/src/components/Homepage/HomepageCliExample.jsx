import CodeBlock from '@theme/CodeBlock';
import React from 'react';

import styles from './HomepageCliExample.module.css';

const cliCommand = `npx crawlee create my-crawler`;

export default function CliExample() {
    return (
        <section className={styles.cliExampleSection}>
            <div className={styles.cliExampleTitle}>
                Or start with a template from our CLI
            </div>
            <CodeBlock className="language-bash">
                {cliCommand}
            </CodeBlock>
            <div className={styles.cliExampleSubtitle}>
                Built with 🤍 by Apify. Forever free and open-source.
            </div>
        </section>
    );
}
