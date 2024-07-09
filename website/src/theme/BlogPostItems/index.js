import React from 'react';
import { BlogPostProvider } from '@docusaurus/theme-common/internal';
import BlogPostItem from '@theme/BlogPostItem';

export default function BlogPostItems({
    items,
    component: BlogPostItemComponent = BlogPostItem,
}) {
    return (
        <>
            {items.map(({ content: BlogPostContent }) => (
                <BlogPostProvider
                    key={BlogPostContent.metadata.permalink}
                    content={BlogPostContent}>
                    <BlogPostItemComponent list={true}>
                        <BlogPostContent/>
                    </BlogPostItemComponent>
                </BlogPostProvider>
            ))}
        </>
    );
}
