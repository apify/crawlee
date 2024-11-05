import React from 'react';
import clsx from 'clsx';
import { useBlogPost } from '@docusaurus/plugin-content-blog/client';
import BlogPostItemContainer from '@theme/BlogPostItem/Container';
import BlogPostItemHeader from '@theme/BlogPostItem/Header';
import BlogPostItemContent from '@theme/BlogPostItem/Content';
import BlogPostItemFooter from '@theme/BlogPostItem/Footer';

// apply a bottom margin in list view
function useContainerClassName() {
    const { isBlogPostPage } = useBlogPost();
    return !isBlogPostPage ? 'margin-bottom--xl' : undefined;
}

export default function BlogPostItem({
    children,
    className,
    list
}) {
    const containerClassName = useContainerClassName();
    return (
        <BlogPostItemContainer className={clsx(containerClassName, className)} list={list}>
            <BlogPostItemHeader/>
            <BlogPostItemContent>{children}</BlogPostItemContent>
            <BlogPostItemFooter/>
        </BlogPostItemContainer>
    );
}
