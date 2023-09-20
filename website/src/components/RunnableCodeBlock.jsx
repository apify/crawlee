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

    const href = `https://console.apify.com/actors/${actor ?? EXAMPLE_RUNNERS[type ?? 'playwright']}?runConfig=${hash}&asrc=run_on_apify`;

    return (
        <div className={clsx(styles.container, 'runnable-code-block')}>
            <Link href={href} className={styles.button} rel="follow">
                Run on
                <svg width="91" height="25" viewBox="0 0 91 25" fill="none" xmlns="http://www.w3.org/2000/svg" className="apify-logo-light alignMiddle_src-theme-Footer-index-module"><path d="M3.135 2.85A3.409 3.409 0 0 0 .227 6.699l2.016 14.398 8.483-19.304-7.59 1.059Z" fill="#97D700"></path><path d="M23.604 14.847 22.811 3.78a3.414 3.414 0 0 0-3.64-3.154c-.077 0-.153.014-.228.025l-3.274.452 7.192 16.124c.54-.67.805-1.52.743-2.379Z" fill="#71C5E8"></path><path d="M5.336 24.595c.58.066 1.169-.02 1.706-.248l12.35-5.211L13.514 5.97 5.336 24.595Z" fill="#FF9013"></path><path d="M33.83 5.304h3.903l5.448 14.623h-3.494l-1.022-2.994h-5.877l-1.025 2.994h-3.384L33.83 5.304Zm-.177 9.032h4.14l-2-5.994h-.086l-2.054 5.994ZM58.842 5.304h3.302v14.623h-3.302V5.304ZM64.634 5.304h10.71v2.7h-7.4v4.101h5.962v2.632h-5.963v5.186h-3.309V5.303ZM82.116 14.38l-5.498-9.076h3.748l3.428 6.016h.085l3.599-6.016H91l-5.56 9.054v5.569h-3.324v-5.548ZM51.75 5.304h-7.292v14.623h3.3v-4.634h3.993a4.995 4.995 0 1 0 0-9.99Zm-.364 7.417h-3.628V7.875h3.627a2.423 2.423 0 0 1 0 4.846Z" className="apify-logo" fill="#000"></path></svg>
            </Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block', props.title != null ? 'has-title' : 'no-title')}>
                { children.code }
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
