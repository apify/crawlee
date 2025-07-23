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
					<g clip-path="url(#clip0_227_3988)">
						<path d="M13.7852 0H23.6738C23.875 0 24.0381 0.162651 24.0381 0.36329V15.4372C24.0381 15.7982 23.5673 15.9382 23.369 15.6361L13.4805 0.562206C13.322 0.320589 13.4957 0 13.7852 0Z" fill="#246DFF"/>
						<path d="M10.2529 0H0.364215C0.163065 0 0 0.162651 0 0.36329V15.4372C0 15.7982 0.470785 15.9382 0.668982 15.6361L10.5576 0.562206C10.7161 0.320589 10.5423 0 10.2529 0Z" fill="#20A34E"/>
						<path d="M11.8497 12.0687L0.616209 23.3579C0.388089 23.5872 0.550887 23.9772 0.87471 23.9772H23.1728C23.4953 23.9772 23.6588 23.5899 23.4333 23.3598L12.3687 12.0706C12.2266 11.9256 11.9929 11.9247 11.8497 12.0687Z" fill="#F86606"/>
						<path d="M77.2674 3.29845H73.0596C71.743 3.29845 71.1789 3.95494 71.1789 5.15074V6.29968L77.3097 6.29986L80.8122 14.3659L84.315 6.29986H87.371L80.0364 23.1589H77.0274L79.2842 17.9535L75.0892 8.83207H71.1789V18.1644H68.17V8.83207H64.9023V6.29968H68.17V4.56465C68.17 2.26676 69.4393 0.906738 72.1427 0.906738H77.2674V3.29845Z" className="apify-logo" fill="#000"/>
						<path fill-rule="evenodd" clip-rule="evenodd" d="M53.3197 6.04187C56.4225 6.0419 58.9614 8.3633 58.9614 12.2322C58.9614 16.1245 56.4225 18.4223 53.3197 18.4223C50.7337 18.4223 49.4407 16.8279 49.2057 16.3589V23.1355H46.2437V6.29979H49.2291V8.17566C49.4407 7.73016 50.7337 6.04187 53.3197 6.04187ZM52.5437 8.66808C50.4985 8.66813 49.1822 10.1922 49.1822 12.2322C49.1822 14.2486 50.4985 15.7962 52.5437 15.7962C54.6123 15.7962 55.9288 14.2487 55.9288 12.2322C55.9288 10.1922 54.6123 8.66808 52.5437 8.66808Z" className="apify-logo" fill="#000"/>
						<path fill-rule="evenodd" clip-rule="evenodd" d="M38.4394 5.995C42.13 5.99503 44.1751 7.91772 44.1751 10.7314V14.7411C44.1751 15.4445 44.4337 15.7727 45.1154 15.8196V18.2347H44.1751C42.6943 18.2112 41.7303 17.6485 41.4013 16.5934C40.8136 17.4374 39.5912 18.4225 37.5461 18.4225C34.7487 18.4225 32.6328 16.8279 32.6328 14.4127C32.633 12.0211 34.443 10.7314 37.3814 10.7314H41.2837C41.2837 9.30116 40.1788 8.38674 38.4394 8.38672C36.7938 8.38672 36.1355 9.27765 35.971 9.58248H32.9384C33.1736 8.31629 34.7017 5.995 38.4394 5.995ZM37.8751 12.7714C36.488 12.7714 35.5947 13.2873 35.5947 14.3659C35.5949 15.5149 36.6763 16.1948 38.1807 16.1948C39.8733 16.1948 41.2837 15.3506 41.2837 13.7797V12.7714H37.8751Z" className="apify-logo" fill="#000"/>
						<path d="M63.4703 18.1644H60.4614V6.29993H63.4703V18.1644Z" className="apify-logo" fill="#000"/>
						<path d="M63.5177 4.4005H60.3911V0.836426H63.5177V4.4005Z" className="apify-logo" fill="#000"/>
					</g>
				</svg>
            </Link>
            <CodeBlock {...props} className={clsx(styles.codeBlock, 'code-block', props.title != null ? 'has-title' : 'no-title')}>
                { children.code }
            </CodeBlock>
        </div>
    );
};

export default RunnableCodeBlock;
