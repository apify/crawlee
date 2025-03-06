import React from 'react';

import Button from '../Button';
import CopyButton from '../CopyButton';
import styles from './LanguageInfoWidget.module.css';

export default function LanguageInfoWidget({ language, command, githubUrl, to }) {
    return (
        <div className={styles.languageGetStartedContainer}>
            <div className={styles.logoContainer}>
                <img
                    alt="Crawlee Logo"
                    width={32}
                    height={32}
                    src="/img/crawlee-logo.svg"
                />
                <div className={styles.languageGetStartedContainerTitle}>
                    <span className={styles.crawleeText}>crawlee</span>
                    <span className={styles.slashText}>/</span>
                    <span className={styles.languageText}>{language}</span>
                </div>
            </div>
            <div className={styles.buttonContainer}>
                <Button to={to}>Learn more</Button>
                <iframe
                    src={githubUrl}
                    width="170"
                    height="30"
                    title="GitHub"
                ></iframe>
            </div>
            {command && (
                <code className={styles.commandContainer}>{command} <CopyButton copyText={command} compact /></code>
            )}
        </div>
    );
}
