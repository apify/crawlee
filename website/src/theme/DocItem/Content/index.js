import { useDoc } from '@docusaurus/plugin-content-docs/client';
import { ThemeClassNames } from '@docusaurus/theme-common';
import LLMButtons from '@site/src/components/LLMButtons';
import Heading from '@theme/Heading';
import MDXContent from '@theme/MDXContent';
import clsx from 'clsx';
import React from 'react';

import styles from './styles.module.css';

function useSyntheticTitle() {
    const { metadata, frontMatter, contentTitle } = useDoc();
    const shouldRender = !frontMatter.hide_title && typeof contentTitle === 'undefined';
  
    if (!shouldRender) {
      return null;
    }
  
    return metadata.title;
  }

export default function DocItemContent({ children }) {
    const syntheticTitle = useSyntheticTitle();

    return (
        <div className={clsx(ThemeClassNames.docs.docMarkdown, 'markdown')}>
            {syntheticTitle && (
                <div className={styles.docItemContent}>
                    {syntheticTitle && <Heading as="h1">{syntheticTitle}</Heading>}
                    <LLMButtons />
                </div>
            )}
            <MDXContent>{children}</MDXContent>
        </div>
    );
}

