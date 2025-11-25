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
import React, {
    useCallback,
    useEffect,
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
    },
    {
        label: 'View as Markdown',
        description: 'View this page as plain text',
        icon: MarkdownIcon,
        value: 'viewAsMarkdown',
        showExternalIcon: true,
    },
    {
        label: 'Open in ChatGPT',
        description: 'Ask questions about this page',
        icon: ChatGptIcon,
        value: 'openInChatGPT',
        showExternalIcon: true,
    },
    {
        label: 'Open in Claude',
        description: 'Ask questions about this page',
        icon: AnthropicIcon,
        value: 'openInClaude',
        showExternalIcon: true,
    },
    {
        label: 'Open in Perplexity',
        description: 'Ask questions about this page',
        icon: PerplexityIcon,
        value: 'openInPerplexity',
        showExternalIcon: true,
    },
];

const getPrompt = (currentUrl) => `Read from ${currentUrl} so I can ask questions about it.`;
const getMarkdownUrl = (currentUrl) => {
    const url = new URL(currentUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}.md`;
    return url.toString();
};

const trackClick = (buttonText, element) => {
    if (window.analytics) {
        window.analytics.track('Clicked', {
            app: 'crawlee',
            button_text: buttonText,
            element,
        });
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
    const menuRef = useRef(null);

    const MenuBaseComponent = components.MenuBase;

    const closeMenu = useCallback(() => {
        setIsOpen(false);
    }, []);

    const toggleMenu = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleMenu();
            }
        },
        [toggleMenu],
    );

    const handleOptionSelect = useCallback(
        (option) => {
            onSelect?.(option);
            closeMenu();
        },
        [closeMenu, onSelect],
    );

    useEffect(() => {
        onMenuOpen?.(isOpen);
    }, [isOpen, onMenuOpen]);

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
                aria-controls={'llm-menu'}
            />
            {isOpen && (
                <div className={styles.menuDropdown} role="menu" id={'llm-menu'}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            className={styles.menuOptionWrapper}
                            role="menuitem"
                            onClick={() => handleOptionSelect(option)}
                        >
                            <Option {...option} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const onViewAsMarkdownClick = () => {
    trackClick('View as Markdown', 'llm-buttons.viewAsMarkdown');

    const markdownUrl = getMarkdownUrl(window.location.href);

    try {
        window.open(markdownUrl, '_blank');
    } catch (error) {
        console.error('Error opening markdown file:', error);
    }
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

const onOpenInChatGPTClick = () => {
    trackClick('Open in ChatGPT', 'llm-buttons.openInChatGPT');

    const prompt = getPrompt(window.location.href);

    try {
        window.open(
            `https://chatgpt.com/?hints=search&q=${encodeURIComponent(prompt)}`,
            '_blank',
        );
    } catch (error) {
        console.error('Error opening ChatGPT:', error);
    }
};

const onOpenInClaudeClick = () => {
    trackClick('Open in Claude', 'llm-buttons.openInClaude');

    const prompt = getPrompt(window.location.href);

    try {
        window.open(
            `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
            '_blank',
        );
    } catch (error) {
        console.error('Error opening Claude:', error);
    }
};

const onOpenInPerplexityClick = () => {
    trackClick('Open in Perplexity', 'llm-buttons.openInPerplexity');

    const prompt = getPrompt(window.location.href);

    try {
        window.open(
            `https://www.perplexity.ai/search/new?q=${encodeURIComponent(
                prompt,
            )}`,
            '_blank',
        );
    } catch (error) {
        console.error('Error opening Perplexity:', error);
    }
};

const onCopyAsMarkdownClick = async ({ setCopyingStatus }) => {
    trackClick('Copy for LLM', 'llm-buttons.copyForLLM');

    const markdownUrl = getMarkdownUrl(window.location.href);

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

const MenuBase = React.forwardRef(({
    copyingStatus,
    setCopyingStatus,
    chevronIconRef,
    ...props
}, ref) => (
    <div ref={ref} className={styles.llmButtonWrapper}>
        <div className={styles.llmButton}>
            <div
                className={styles.copyUpIconWrapper}
                onClick={() => onCopyAsMarkdownClick({ setCopyingStatus })}
            >
                {copyingStatus === 'loading' && <LoaderIcon size={16} />}
                {copyingStatus === 'copied' && <CheckIcon size={16} />}
                {copyingStatus === 'idle' && <CopyIcon size={16} />}
            </div>
            <span
                onClick={() => onCopyAsMarkdownClick({ setCopyingStatus })}
                className={styles.llmButtonText}
            >
                {getButtonText({ status: copyingStatus })}
            </span>
            <div {...props} className={styles.chevronIconWrapper}>
                <ChevronDownIcon
                    size="16"
                    color="currentColor"
                    className={styles.chevronIcon}
                    ref={chevronIconRef}
                />
            </div>
        </div>
    </div>
));
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
    const [copyingStatus, setCopyingStatus] = useState('idle');
    const chevronIconRef = useRef(null);

    const onMenuOptionClick = useCallback((option) => {
        switch (option?.value) {
            case 'copyForLLM':
                onCopyAsMarkdownClick({ setCopyingStatus });
                break;
            case 'viewAsMarkdown':
                onViewAsMarkdownClick();
                break;
            case 'openInChatGPT':
                onOpenInChatGPTClick();
                break;
            case 'openInClaude':
                onOpenInClaudeClick();
                break;
            case 'openInPerplexity':
                onOpenInPerplexityClick();
                break;
            default:
                break;
        }
    }, []);

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
                        {...props}
                    />
                ),
            }}
            onSelect={onMenuOptionClick}
            options={DROPDOWN_OPTIONS}
        />
    );
}
