import ThemedImage from '@theme/ThemedImage';
import clsx from 'clsx';
import React from 'react';

import Button from '../Button';
import CopyButton from '../CopyButton';
import styles from './LanguageInfoWidget.module.css';

export default function LanguageInfoWidget({
    language,
    command,
    githubUrl,
    to,
}) {
    return (
        <div className={styles.languageGetStartedContainer}>
            {language === 'JavaScript' && (
                <ThemedImage
                    sources={{
                        light: '/img/crawlee-javascript-light.svg',
                        dark: '/img/crawlee-javascript-dark.svg',
                    }}
                    alt="Crawlee JavaScript logo"
                />
            )}
            {language === 'Python' && (
                <ThemedImage
                    sources={{
                        light: '/img/crawlee-python-light.svg',
                        dark: '/img/crawlee-python-dark.svg',
                    }}
                    alt="Crawlee Python logo"
                />
            )}
            <div
                className={clsx(
                    styles.buttonContainer,
                    command && styles.buttonContainerVertical,
                )}
            >
                <Button to={to}>Learn more</Button>
                <iframe
                    src={githubUrl}
                    width="170"
                    height="30"
                    title="GitHub"
                ></iframe>
            </div>
            {command && (
                <code className={styles.commandContainer}>
                    {command} <CopyButton copyText={command} compact />
                </code>
            )}
        </div>
    );
}
