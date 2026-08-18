export default function BlogPostItems({ items, component: BlogPostItemComponent, }: {
    items: any;
    component?: typeof BlogPostItem | undefined;
}): React.JSX.Element;
import BlogPostItem from '@theme/BlogPostItem';
import React from 'react';
