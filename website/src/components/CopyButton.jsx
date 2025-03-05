import React, { useState } from 'react';

export default function CopyButton({ copyText }) {
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
        style={{ backgroundColor: 'transparent', border: 0, cursor: 'pointer', padding: 0, margin: 0 }}>
        {copied
            ? <svg width={12} height={12} viewBox='0 0 24 24'>
                <path fill="#00d600" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z">
                </path>
            </svg>
            : <svg width={12} height={12} viewBox='0 0 24 24'>
                <path
                    fill="var(--color-icon)"
                    d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z">
                </path>
            </svg>
        }
    </button>;
}
