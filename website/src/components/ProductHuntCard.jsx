import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';

export default function ProductHuntCard({ className, style }) {
    const { colorMode } = useColorMode();
    const theme = colorMode === 'light' ? 'light' : 'neutral';
    const src = `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=356907&theme=${theme}`;
    return (
        <a
            href="https://www.producthunt.com/posts/crawlee"
            target="_blank"
            rel="noreferrer"
            className={className}
            style={{ display: 'block', width: 250, height: 54, ...style }}>
            <img
                src={src}
                alt="Crawlee - Crawlee helps you build reliable crawlers&#0046; Fast&#0046; | Product Hunt"
                style={{ width: 250, height: 54, maxWidth: 'initial' }}
                width={250}
                height={54}
            />
        </a>
    );
}
