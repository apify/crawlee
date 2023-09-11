import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import CodeBlock from '@theme/CodeBlock';
import Link from '@docusaurus/Link';
import useIsBrowser from '@docusaurus/useIsBrowser';
import styles from './RunnableCodeBlock.module.css';
// import axios from 'axios';

const RunnableCodeBlock = ({ children: example, ...props }) => {
    const isBrowser = useIsBrowser();
    // let href = 'https://console.apify.com/actor/adamek~example-code-runner?runConfig={response.data.encoded}';
    let href = 'https://console.apify.com/actor/adamek~example-code-runner';
    const [hash, setHash] = useState('');

    // useEffect(() => {
    //     async function getHash() {
    //         const response = await axios.post(
    //             'https://api.apify.com/tools/encode-and-sign',
    //             { code: example },
    //             {
    //                 headers: { Authorization: '...' },
    //             },
    //         );
    //         console.log(response);
    //         console.log(response.json);
    //         const data = await response.json;
    //         console.log(data);
    //         setHash(data.access_token);
    //     }
    //
    //     // You need to restrict it at some point
    //     // This is just dummy code and should be replaced by actual
    //     if (!hash) {
    //         void getHash();
    //     }
    // }, [hash]);

    if (isBrowser) {
        // const parts = urlHash.split(CodeHashManager.SECTION_SEPARATOR)
        //     .map((part) => {
        //         return part.replace(/\+/g, '-')
        //             .replace(/\//g, '_')
        //             .replace(/=+$/m, '');
        //     });
        // href += `?runConfig=${parts.join(CodeHashManager.SECTION_SEPARATOR)}`;
    } else {
        const { CodeHashManager } = require('@apify/utilities');
        const manager = new CodeHashManager('...TODO...');
        const urlHash = manager.encode(example, 'EgPtw3oej6TaDt5qn');
        // const res = await fetch('https://api.apify.com/tools/encode-and-sign', {
        //     method: 'POST',
        //     body: {
        //         code: example,
        //     },
        // });
        // console.log(res);
        href += `?runConfig=${urlHash}`;
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
