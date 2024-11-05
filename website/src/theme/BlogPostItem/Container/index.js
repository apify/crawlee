import { useColorMode } from '@docusaurus/theme-common';
import Giscus from '@giscus/react';
import React from 'react';

export default function BlogPostItemContainer({ children, className, list }) {
    const { colorMode } = useColorMode();

    return <>
        <article className={className}>{children}</article>
        {!list && <Giscus
            id="giscus-comments"
            repo="apify/crawlee"
            repoId="MDEwOlJlcG9zaXRvcnk2NjY3MDgxOQ="
            category="Comments"
            categoryId="DIC_kwDOA_lQ484CQufN"
            mapping="pathname"
            reactionsEnabled="1"
            emitMetadata="0"
            inputPosition="top"
            theme={colorMode}
            lang="en"
            strict="1"
        />}
    </>;
}
