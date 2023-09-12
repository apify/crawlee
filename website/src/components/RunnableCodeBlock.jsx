import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import CodeBlock from '@theme/CodeBlock';
import Link from '@docusaurus/Link';
import useIsBrowser from '@docusaurus/useIsBrowser';
import styles from './RunnableCodeBlock.module.css';

const useCodeHash = (example) => {
    const [hash, setHash] = useState('');
    const isBrowser = useIsBrowser();
    useEffect(() => {
        console.log('wut', { isBrowser });
        if (isBrowser) return;
        (async () => {
            const token = process.env.APIFY_ADMIN_TOKEN;
            console.log('wtf', token, process.env);
            const res = await fetch(`https://api.apify.com/v2/tools/encode-and-sign?token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: JSON.stringify({ code: example }),
                    options: { contentType: 'application/json', timeout: 300, memory: 1024, maxItems: 1000 },
                }),
            });
            const encoded = await res.json();
            setHash(encoded);
        })();
    }, [isBrowser, example]);
    return hash;
};

const RunnableCodeBlock = ({ children: example, ...props }) => {
    let href = 'https://console.apify.com/actors/1ZCFfY19U64UYWwS0';
    const hash = useCodeHash(example);

    if (hash) {
        href += `?runConfig=${hash.data.encoded}`;
    } else {
        href += `?runConfig=invalid-token`;
    }

    return (
        <div className={clsx(styles.container, 'runnable-code-block')}>
            <Link href={href} className={styles.button} rel="follow">Run on Apify</Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block')}>
                {example}
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
