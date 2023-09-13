import React from 'react';
import clsx from 'clsx';
import CodeBlock from '@theme/CodeBlock';
import Link from '@docusaurus/Link';
import styles from './RunnableCodeBlock.module.css';

const EXAMPLE_RUNNERS = {
    playwright: '6i5QsHBMtm3hKph70',
    puppeteer: '7tWSD8hrYzuc9Lte7',
    cheerio: 'kk67IcZkKSSBTslXI',
};

const RunnableCodeBlock = ({ children, actor, hash, type, ...props }) => {
    hash = hash ?? children.hash;

    if (!children.code) {
        throw new Error(`RunnableCodeBlock requires "code" and "hash" props
Make sure you are importing the code block contents with the roa-loader.`);
    }

    if (!hash) {
        return (
            <CodeBlock {...props}>
                { children.code }
            </CodeBlock>
        );
    }

    const href = `https://console.apify.com/actors/${actor ?? EXAMPLE_RUNNERS[type ?? 'playwright']}?runConfig=${hash}`;

    return (
        <div className={clsx(styles.container, 'runnable-code-block')}>
            <Link href={href} className={styles.button} rel="follow">Run on Apify</Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block')}>
                { children.code }
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
