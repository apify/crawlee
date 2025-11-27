import {
    AnthropicIcon,
    ChatGptIcon,
    CheckIcon,
    ChevronDownIcon,
    CopyIcon,
    ExternalLinkIcon,
    LoaderIcon,
    MarkdownIcon,
    PerplexityIcon,
} from '@apify/ui-icons';
import clsx from 'clsx';
import { useLocation } from '@docusaurus/router';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import styles from './LLMButtons.module.css';

const DROPDOWN_OPTIONS = [
    {
        label: 'Copy for LLM',
        description: 'Copy page as Markdown for LLMs',
        showExternalIcon: false,
        icon: CopyIcon,
        value: 'copyForLLM',
        analytics: {
            buttonText: 'Copy for LLM',
            element: 'llm-buttons.copyForLLM',
        },
    },
    {
        label: 'View as Markdown',
        description: 'View this page as plain text',
        icon: MarkdownIcon,
        value: 'viewAsMarkdown',
        showExternalIcon: true,
        analytics: {
            buttonText: 'View as Markdown',
            element: 'llm-buttons.viewAsMarkdown',
        },
    },
    {
        label: 'Open in ChatGPT',
        description: 'Ask questions about this page',
        icon: ChatGptIcon,
        value: 'openInChatGPT',
        showExternalIcon: true,
        analytics: {
            buttonText: 'Open in ChatGPT',
            element: 'llm-buttons.openInChatGPT',
        },
    },
    {
        label: 'Open in Claude',
        description: 'Ask questions about this page',
        icon: AnthropicIcon,
        value: 'openInClaude',
        showExternalIcon: true,
        analytics: {
            buttonText: 'Open in Claude',
            element: 'llm-buttons.openInClaude',
        },
    },
    {
        label: 'Open in Perplexity',
        description: 'Ask questions about this page',
        icon: PerplexityIcon,
        value: 'openInPerplexity',
        showExternalIcon: true,
        analytics: {
            buttonText: 'Open in Perplexity',
            element: 'llm-buttons.openInPerplexity',
        },
    },
];

const CHAT_GPT_BASE = 'https://chatgpt.com/?hints=search&q=';
const CLAUDE_BASE = 'https://claude.ai/new?q=';
const PERPLEXITY_BASE = 'https://www.perplexity.ai/search/new?q=';

const getPrompt = (currentUrl) => `Read from ${currentUrl} so I can ask questions about it.`;
const getMarkdownUrl = (currentUrl) => {
    const url = new URL(currentUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}.md`;
    return url.toString();
};

const trackClick = (buttonText, element) => {
    if (typeof window !== 'undefined' && window.analytics) {
        window.analytics.track('Clicked', {
            app: 'crawlee',
            button_text: buttonText,
            element,
        });
    }
};

const getOptionHref = (value, currentUrl) => {
    if (!currentUrl) {
        return undefined;
    }

    switch (value) {
        case 'viewAsMarkdown':
            return getMarkdownUrl(currentUrl);
        case 'openInChatGPT':
            return `${CHAT_GPT_BASE}${encodeURIComponent(getPrompt(currentUrl))}`;
        case 'openInClaude':
            return `${CLAUDE_BASE}${encodeURIComponent(getPrompt(currentUrl))}`;
        case 'openInPerplexity':
            return `${PERPLEXITY_BASE}${encodeURIComponent(getPrompt(currentUrl))}`;
        default:
            return undefined;
    }
};

const Menu = ({
    className,
    components = {},
    onMenuOpen,
    onSelect,
    options = [],
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(0);
    const menuRef = useRef(null);
    const menuItemRefs = useRef([]);

    const MenuBaseComponent = components.MenuBase;

    const closeMenu = useCallback(() => {
        setIsOpen(false);
        setFocusedIndex(0);
    }, []);

    const toggleMenu = useCallback(() => {
        setIsOpen((prev) => {
            if (!prev) {
                setFocusedIndex(0);
            }
            return !prev;
        });
    }, []);

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleMenu();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (!isOpen) {
                    toggleMenu();
                } else {
                    setFocusedIndex((prev) => (prev + 1) % options.length);
                }
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (isOpen) {
                    setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
                }
            }
        },
        [toggleMenu, isOpen, options.length],
    );

    const handleOptionSelect = useCallback(
        (option, event) => {
            onSelect?.(option, event);
            closeMenu();
        },
        [closeMenu, onSelect],
    );

    const handleMenuItemKeyDown = useCallback(
        (event, option, index) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
                return;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setFocusedIndex((index + 1) % options.length);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setFocusedIndex((index - 1 + options.length) % options.length);
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeMenu();
            }
        },
        [options.length, closeMenu],
    );

    useEffect(() => {
        onMenuOpen?.(isOpen);
    }, [isOpen, onMenuOpen]);

    useEffect(() => {
        if (isOpen && menuItemRefs.current[focusedIndex]) {
            menuItemRefs.current[focusedIndex].focus();
        }
    }, [isOpen, focusedIndex]);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleClickOutside = (event) => {
            if (!menuRef.current?.contains(event.target)) {
                closeMenu();
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [closeMenu, isOpen]);

    return (
        <div className={clsx(styles.menu, className)} ref={menuRef}>
            <MenuBaseComponent
                onClick={toggleMenu}
                onKeyDown={handleKeyDown}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls="llm-menu"
            />
            {isOpen && (
                <div className={styles.menuDropdown} role="menu" id="llm-menu">
                    {options.map((option, index) => {
                        const WrapperComponent = option.href ? 'a' : 'button';

                        return (
                            <WrapperComponent
                                key={option.value}
                                ref={(el) => {
                                    menuItemRefs.current[index] = el;
                                }}
                                className={styles.menuOptionWrapper}
                                role="menuitem"
                                tabIndex={0}
                                href={option.href}
                                target={option.target}
                                rel={option.rel}
                                type={option.href ? undefined : 'button'}
                                onClick={(event) => {
                                    if (!option.href) {
                                        event.preventDefault();
                                    }
                                    handleOptionSelect(option, event);
                                }}
                                onKeyDown={(e) => handleMenuItemKeyDown(e, option, index)}
                            >
                                <Option {...option} />
                            </WrapperComponent>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

function getButtonText({ status }) {
    switch (status) {
        case 'loading':
            return 'Copying...';
        case 'copied':
            return 'Copied';
        default:
            return 'Copy for LLM';
    }
}

const onCopyAsMarkdownClick = async ({ setCopyingStatus, currentUrl }) => {
    const sourceUrl = currentUrl || (typeof window !== 'undefined' ? window.location.href : '');

    if (!sourceUrl) {
        return;
    }

    trackClick('Copy for LLM', 'llm-buttons.copyForLLM');

    const markdownUrl = getMarkdownUrl(sourceUrl);

    try {
        setCopyingStatus('loading');

        const response = await fetch(markdownUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch markdown: ${response.status}`);
        }

        const markdownContent = await response.text();
        await navigator.clipboard.writeText(markdownContent);
        setCopyingStatus('copied');
    } catch (error) {
        console.error('Failed to copy markdown content:', error);
    } finally {
        setTimeout(() => setCopyingStatus('idle'), 2000);
    }
};

const COPYING_STATUS_ICON = {
    loading: <LoaderIcon size={16} />,
    copied: <CheckIcon size={16} />,
    idle: <CopyIcon size={16} />,
}

const MenuBase = React.forwardRef(({
    copyingStatus,
    setCopyingStatus,
    chevronIconRef,
    currentUrl,
    ...buttonProps
}, ref) => {
    const mergedButtonProps = {
        ...buttonProps,
        tabIndex: buttonProps.tabIndex ?? 0,
    };

    return (
        <div className={styles.llmButtonWrapper}>
            <div
                ref={ref}
                className={styles.llmButton}
                {...mergedButtonProps}
            >
                <div
                    className={styles.copyUpIconWrapper}
                    onClick={(event) => {
                        event.stopPropagation();
                        onCopyAsMarkdownClick({ setCopyingStatus, currentUrl });
                    }}
                >
                    {COPYING_STATUS_ICON[copyingStatus]}
                </div>
                <span
                    onClick={(event) => {
                        event.stopPropagation();
                        onCopyAsMarkdownClick({ setCopyingStatus, currentUrl });
                    }}
                    className={styles.llmButtonText}
                >
                    {getButtonText({ status: copyingStatus })}
                </span>
                <div className={styles.chevronIconWrapper}>
                    <ChevronDownIcon
                        size="16"
                        color="currentColor"
                        className={styles.chevronIcon}
                        ref={chevronIconRef}
                    />
                </div>
            </div>
        </div>
    );
});
MenuBase.displayName = 'MenuBase';

const Option = ({ label, description, showExternalIcon, icon }) => {
    const Icon = icon ?? CopyIcon;

    return (
        <div className={styles.menuOption}>
            <Icon size={16} className={styles.menuOptionIcon} />
            <div className={styles.menuOptionText}>
                <span className={styles.menuOptionLabel}>{label}</span>
                <span className={styles.menuOptionDescription}>{description}</span>
            </div>
            {showExternalIcon && (
                <ExternalLinkIcon
                    size={16}
                    className={styles.menuOptionExternalIcon}
                />
            )}
        </div>
    );
};

export default function LLMButtons() {
    const location = useLocation();
    const [copyingStatus, setCopyingStatus] = useState('idle');
    const [currentUrl, setCurrentUrl] = useState('');
    const chevronIconRef = useRef(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setCurrentUrl(window.location.href);
        }
    }, [location]);

    const menuOptions = useMemo(
        () =>
            DROPDOWN_OPTIONS.map((option) => {
                const href = getOptionHref(option.value, currentUrl);

                return {
                    ...option,
                    href,
                    target: href ? '_blank' : undefined,
                    rel: href ? 'noopener noreferrer' : undefined,
                };
            }),
        [currentUrl],
    );

    const onMenuOptionClick = useCallback(
        (option, event) => {
            if (!option) {
                return;
            }

            if (option.analytics) {
                trackClick(option.analytics.buttonText, option.analytics.element);
            }

            if (option.value === 'copyForLLM') {
                event?.preventDefault();
                onCopyAsMarkdownClick({ setCopyingStatus, currentUrl });
            }
        },
        [currentUrl, setCopyingStatus],
    );

    return (
        <Menu
            className={styles.llmMenu}
            onMenuOpen={(isOpen) => chevronIconRef.current?.classList.toggle(
                styles.chevronIconOpen,
                isOpen,
            )}
            components={{
                MenuBase: (props) => (
                    <MenuBase
                        copyingStatus={copyingStatus}
                        setCopyingStatus={setCopyingStatus}
                        chevronIconRef={chevronIconRef}
                        currentUrl={currentUrl}
                        {...props}
                    />
                ),
            }}
            onSelect={onMenuOptionClick}
            options={menuOptions}
        />
    );
}
