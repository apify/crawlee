import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import CodeBlock from '@theme/CodeBlock';
import Link from '@docusaurus/Link';
import useIsBrowser from '@docusaurus/useIsBrowser';
import styles from './RunnableCodeBlock.module.css';
// import axios from 'axios';

const useCodeHash = (example) => {
    const [hash, setHash] = useState('');
    const isBrowser = useIsBrowser();
    useEffect(() => {
        if (isBrowser) return;
        (async () => {
            // TODO: Use proper token
            const res = await fetch('https://api.apify.com/v2/tools/encode-and-sign?token=XXX', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // TODO: Send proper payload
                body: JSON.stringify({ code: example }),
            });
            const encoded = await res.json();
            setHash(encoded);
        })();
    }, [isBrowser, example]);
    return hash;
};

const RunnableCodeBlock = ({ children: example, ...props }) => {
    // TODO: Use hash as runConfig parameter
    // let href = 'https://console.apify.com/actor/adamek~example-code-runner?runConfig={response.data.encoded}';
    let href = 'https://console.apify.com/v1/actor/adamek~example-code-runner';
    const hash = useCodeHash(example);

    return (
        <div className={clsx(styles.container, 'runnable-code-block')}>
            <code>{JSON.stringify(hash)}</code>
            <Link href={href} className={styles.button} rel="follow">Run on Apify</Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block')}>
                {example}
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
