import React from 'react';
import clsx from 'clsx';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { translate } from '@docusaurus/Translate';
import IconLightMode from '../Icon/LightMode';
import IconDarkMode from '../Icon/DarkMode';
import styles from './styles.module.css';

function ColorModeToggle({
    className,
    value,
    onChange
}) {
    const isBrowser = useIsBrowser();
    const title = translate(
        {
            message: 'Switch between dark and light mode (currently {mode})',
            id: 'theme.colorToggle.ariaLabel',
            description: 'The ARIA label for the navbar color mode toggle',
        },
        {
            mode:
                value === 'dark'
                    ? translate({
                        message: 'dark mode',
                        id: 'theme.colorToggle.ariaLabel.mode.dark',
                        description: 'The name for the dark color mode',
                    })
                    : translate({
                        message: 'light mode',
                        id: 'theme.colorToggle.ariaLabel.mode.light',
                        description: 'The name for the light color mode',
                    }),
        },
    );
    return (
        <div className={clsx(styles.toggle, className)}>
            <button
                className={clsx(
                    'clean-btn',
                    styles.toggleButton,
                    !isBrowser && styles.toggleButtonDisabled,
                )}
                type="button"
                onClick={() => onChange(value === 'dark' ? 'light' : 'dark')}
                disabled={!isBrowser}
                title={title}
                aria-label={title}>
                <span>
                    <IconLightMode
                        className={clsx(styles.toggleIcon, styles.lightToggleIcon)}
                        width={14} height={14}
                    />
                    <IconDarkMode
                        className={clsx(styles.toggleIcon, styles.darkToggleIcon)}
                        width={14} height={14}
                    />
                </span>
            </button>
        </div>
    );
}

export default React.memo(ColorModeToggle);
