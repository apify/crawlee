/* eslint-disable max-len */
import clsx from 'clsx';
import React, { useState } from 'react';

import styles from './CopyButton.module.css';

export default function CopyButton({ copyText, compact = false, className }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(copyText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return <button
        type="button"
        aria-label="Copy code to clipboard"
        title="Copy"
        onClick={copy}
        className={clsx(className, styles.copyButton, compact ? styles.copyButtonCompact : styles.copyButtonDefault)}
    >
        {copied
            ? <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M18.0303 5.09467C18.3232 5.38756 18.3232 5.86244 18.0303 6.15533L8.03033 16.1553C7.73744 16.4482 7.26256 16.4482 6.96967 16.1553L2.59467 11.7803C2.30178 11.4874 2.30178 11.0126 2.59467 10.7197C2.88756 10.4268 3.36244 10.4268 3.65533 10.7197L7.5 14.5643L16.9697 5.09467C17.2626 4.80178 17.7374 4.80178 18.0303 5.09467Z" />
            </svg>

            : <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M8.375 2.375C7.13236 2.375 6.125 3.38236 6.125 4.625V6.125H4.625C3.38236 6.125 2.375 7.13236 2.375 8.375V15.375C2.375 16.6176 3.38236 17.625 4.625 17.625H11.625C12.8676 17.625 13.875 16.6176 13.875 15.375V13.875H15.375C16.6176 13.875 17.625 12.8676 17.625 11.625V4.625C17.625 3.38236 16.6176 2.375 15.375 2.375H8.375ZM13.875 12.375H15.375C15.7892 12.375 16.125 12.0392 16.125 11.625V4.625C16.125 4.21079 15.7892 3.875 15.375 3.875H8.375C7.96079 3.875 7.625 4.21079 7.625 4.625V6.125H11.625C12.8676 6.125 13.875 7.13236 13.875 8.375V12.375ZM4.625 7.625C4.21079 7.625 3.875 7.96079 3.875 8.375V15.375C3.875 15.7892 4.21079 16.125 4.625 16.125H11.625C12.0392 16.125 12.375 15.7892 12.375 15.375V8.375C12.375 7.96079 12.0392 7.625 11.625 7.625H4.625Z" />
            </svg>
        }
    </button>;
}
