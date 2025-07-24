import React from 'react';
import clsx from 'clsx';
import CodeBlock from '@theme/CodeBlock';
import Link from '@docusaurus/Link';
import styles from './RunnableCodeBlock.module.css';

const EXAMPLE_RUNNERS = {
    python: 'HH9rhkFXiZbheuq1V',
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

    const href = `https://console.apify.com/actors/${actor ?? EXAMPLE_RUNNERS[type ?? 'playwright']}?runConfig=${hash}&asrc=run_on_apify`;

    return (
        <div className={clsx(styles.container, 'runnable-code-block')}>
            <Link href={href} className={styles.button} rel="follow">
                Run on
                <svg width="91" height="25" viewBox="0 0 91 25" fill="none" xmlns="http://www.w3.org/2000/svg" className="apify-logo-light alignMiddle_src-theme-Footer-index-module">
                    <path fill="#246DFF" d="M13.785 0h9.889c.201 0 .364.163.364.363v15.074c0 .361-.47.501-.669.2L13.48.561A.363.363 0 0 1 13.785 0Z"/><path fill="#20A34E" d="M10.253 0H.364A.364.364 0 0 0 0 .363v15.074c0 .361.47.501.669.2L10.558.561A.363.363 0 0 0 10.253 0Z"/><path fill="#F86606" d="M11.85 12.069.616 23.358a.363.363 0 0 0 .259.62h22.298a.363.363 0 0 0 .26-.618L12.37 12.07a.365.365 0 0 0-.52-.001Z"/><path className="apify-logo" fill="#000" d="M77.267 3.298H73.06c-1.317 0-1.881.657-1.881 1.853V6.3h6.13l3.503 8.066L84.315 6.3h3.056l-7.335 16.859h-3.009l2.257-5.206-4.195-9.12h-3.91v9.331H68.17V8.832h-3.268V6.3h3.268V4.565c0-2.298 1.27-3.658 3.973-3.658h5.124v2.391Z"/><path className="apify-logo" fill="#000" fill-rule="evenodd" d="M53.32 6.042c3.102 0 5.641 2.321 5.641 6.19 0 3.893-2.538 6.19-5.641 6.19-2.586 0-3.88-1.594-4.114-2.063v6.776h-2.962V6.3h2.985v1.876c.212-.446 1.505-2.134 4.09-2.134Zm-.776 2.626c-2.045 0-3.362 1.524-3.362 3.564 0 2.017 1.316 3.564 3.362 3.564 2.068 0 3.385-1.547 3.385-3.564 0-2.04-1.317-3.564-3.385-3.564ZM38.44 5.995c3.69 0 5.735 1.923 5.735 4.736v4.01c0 .704.259 1.032.94 1.079v2.415h-.94c-1.48-.024-2.445-.587-2.774-1.642-.587.844-1.81 1.83-3.855 1.83-2.797 0-4.913-1.595-4.913-4.01 0-2.392 1.81-3.682 4.748-3.682h3.903c0-1.43-1.105-2.344-2.845-2.344-1.645 0-2.303.89-2.468 1.195h-3.033c.236-1.266 1.764-3.587 5.501-3.587Zm-.565 6.776c-1.387 0-2.28.516-2.28 1.595 0 1.149 1.081 1.829 2.586 1.829 1.692 0 3.103-.844 3.103-2.415V12.77h-3.409Z" clip-rule="evenodd"/><path className="apify-logo" fill="#000" d="M63.47 18.164h-3.009V6.3h3.01v11.864ZM63.518 4.4H60.39V.837h3.127v3.565Z"/>
                </svg>
            </Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block', props.title != null ? 'has-title' : 'no-title')}>
                { children.code }
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
