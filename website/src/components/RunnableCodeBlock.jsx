import React from 'react';
import clsx from 'clsx';
import CodeBlock from '@theme/CodeBlock';
import Link from '@docusaurus/Link';
import styles from './RunnableCodeBlock.module.css';

const RunnableCodeBlock = ({ children, ...props }) => {
    if (!children.code || !children.runUrl) {
        throw new Error(`RunnableCodeBlock requires "code" and "runUrl" props
Make sure you are importing the code block contents with the roa-loader.`);
    }

    return (
        <div className={clsx(styles.container, 'runnable-code-block')}>
            <Link href={children.runUrl} className={styles.button} rel="follow">Run on Apify</Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block')}>
                { children.code }
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
