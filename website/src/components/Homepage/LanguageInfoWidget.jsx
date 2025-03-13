import { useColorMode } from '@docusaurus/theme-common';
import ThemedImage from '@theme/ThemedImage';
import clsx from 'clsx';
import React from 'react';
import GitHubButton from 'react-github-btn';

import Button from '../Button';
import CopyButton from '../CopyButton';
import styles from './LanguageInfoWidget.module.css';

export default function LanguageInfoWidget({
    language,
    command,
    to,
    githubUrl,
}) {
    const { isDarkTheme } = useColorMode();
    return (
        <div className={styles.languageGetStartedContainer}>
            {language === 'JavaScript' && (
                <ThemedImage
                    sources={{
                        light: '/img/crawlee-javascript-light.svg',
                        dark: '/img/crawlee-javascript-dark.svg',
                    }}
                    alt="Crawlee JavaScript"
                />
            )}
            {language === 'Python' && (
                <ThemedImage
                    sources={{
                        light: '/img/crawlee-python-light.svg',
                        dark: '/img/crawlee-python-dark.svg',
                    }}
                    alt="Crawlee Python"
                />
            )}
            <div className={clsx(styles.buttonContainer)}>
                <Button to={to}>
                    {command ? 'Learn more' : 'Get started'}
                </Button>
                <GitHubButton
                    href={githubUrl}
                    data-color-scheme={isDarkTheme ? 'dark' : 'light'}
                    data-show-count="true"
                    aria-label="Star crawlee on GitHub"
                    data-size="large"
                    style={{ minHeight: '28px' }}
                >
                    Star
                </GitHubButton>
            </div>
            {command && (
                <code className={styles.commandContainer}>
                    {command} <CopyButton copyText={command} compact />
                </code>
            )}
        </div>
    );
}
