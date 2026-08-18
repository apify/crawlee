"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LLMButtons;
const tslib_1 = require("tslib");
const ui_icons_1 = require("@apify/ui-icons");
const clsx_1 = tslib_1.__importDefault(require("clsx"));
const router_1 = require("@docusaurus/router");
const react_1 = tslib_1.__importStar(require("react"));
const LLMButtons_module_css_1 = tslib_1.__importDefault(require("./LLMButtons.module.css"));
const DROPDOWN_OPTIONS = [
    {
        label: 'Copy for LLM',
        description: 'Copy page as Markdown for LLMs',
        showExternalIcon: false,
        icon: ui_icons_1.CopyIcon,
        value: 'copyForLLM',
        analytics: {
            buttonText: 'Copy for LLM',
            element: 'llm-buttons.copyForLLM',
        },
    },
    {
        label: 'View as Markdown',
        description: 'View this page as plain text',
        icon: ui_icons_1.MarkdownIcon,
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
        icon: ui_icons_1.ChatGptIcon,
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
        icon: ui_icons_1.AnthropicIcon,
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
        icon: ui_icons_1.PerplexityIcon,
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
const Menu = ({ className, components = {}, onMenuOpen, onSelect, options = [], }) => {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const [focusedIndex, setFocusedIndex] = (0, react_1.useState)(0);
    const menuRef = (0, react_1.useRef)(null);
    const menuItemRefs = (0, react_1.useRef)([]);
    const MenuBaseComponent = components.MenuBase;
    const closeMenu = (0, react_1.useCallback)(() => {
        setIsOpen(false);
        setFocusedIndex(0);
    }, []);
    const toggleMenu = (0, react_1.useCallback)(() => {
        setIsOpen((prev) => {
            if (!prev) {
                setFocusedIndex(0);
            }
            return !prev;
        });
    }, []);
    const handleKeyDown = (0, react_1.useCallback)((event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleMenu();
        }
        else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen) {
                toggleMenu();
            }
            else {
                setFocusedIndex((prev) => (prev + 1) % options.length);
            }
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (isOpen) {
                setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
            }
        }
    }, [toggleMenu, isOpen, options.length]);
    const handleOptionSelect = (0, react_1.useCallback)((option, event) => {
        onSelect?.(option, event);
        closeMenu();
    }, [closeMenu, onSelect]);
    const handleMenuItemKeyDown = (0, react_1.useCallback)((event, option, index) => {
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
    }, [options.length, closeMenu]);
    (0, react_1.useEffect)(() => {
        onMenuOpen?.(isOpen);
    }, [isOpen, onMenuOpen]);
    (0, react_1.useEffect)(() => {
        if (isOpen && menuItemRefs.current[focusedIndex]) {
            menuItemRefs.current[focusedIndex].focus();
        }
    }, [isOpen, focusedIndex]);
    (0, react_1.useEffect)(() => {
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
    return (<div className={(0, clsx_1.default)(LLMButtons_module_css_1.default.menu, className)} ref={menuRef}>
            <MenuBaseComponent onClick={toggleMenu} onKeyDown={handleKeyDown} aria-haspopup="menu" aria-expanded={isOpen} aria-controls="llm-menu"/>
            {isOpen && (<div className={LLMButtons_module_css_1.default.menuDropdown} role="menu" id="llm-menu">
                    {options.map((option, index) => {
                const WrapperComponent = option.href ? 'a' : 'button';
                return (<WrapperComponent key={option.value} ref={(el) => {
                        menuItemRefs.current[index] = el;
                    }} className={LLMButtons_module_css_1.default.menuOptionWrapper} role="menuitem" tabIndex={0} href={option.href} target={option.target} rel={option.rel} type={option.href ? undefined : 'button'} onClick={(event) => {
                        if (!option.href) {
                            event.preventDefault();
                        }
                        handleOptionSelect(option, event);
                    }} onKeyDown={(e) => handleMenuItemKeyDown(e, option, index)}>
                                <Option {...option}/>
                            </WrapperComponent>);
            })}
                </div>)}
        </div>);
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
        // Safari requires clipboard writes to be created synchronously inside the user gesture.
        // We therefore pass a Promise that resolves to a Blob into ClipboardItem instead of
        // awaiting fetch first — otherwise Safari would reject the clipboard operation.
        const markdownContent = new ClipboardItem({
            'text/plain': fetch(markdownUrl)
                .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch markdown: ${response.status}`);
                }
                return response.text();
            })
                .then((content) => new Blob([content], { type: 'text/plain' })),
        });
        await navigator.clipboard.write([markdownContent]);
        // Show success feedback
        setCopyingStatus('copied');
    }
    catch (error) {
        console.error('Failed to copy markdown content:', error);
    }
    finally {
        setTimeout(() => setCopyingStatus('idle'), 2000);
    }
};
const COPYING_STATUS_ICON = {
    loading: <ui_icons_1.LoaderIcon size={16}/>,
    copied: <ui_icons_1.CheckIcon size={16}/>,
    idle: <ui_icons_1.CopyIcon size={16}/>,
};
const MenuBase = react_1.default.forwardRef(({ copyingStatus, setCopyingStatus, chevronIconRef, currentUrl, ...buttonProps }, ref) => {
    const mergedButtonProps = {
        ...buttonProps,
        tabIndex: buttonProps.tabIndex ?? 0,
    };
    return (<div className={LLMButtons_module_css_1.default.llmButtonWrapper}>
            <div ref={ref} className={LLMButtons_module_css_1.default.llmButton} {...mergedButtonProps}>
                <div className={LLMButtons_module_css_1.default.copyUpIconWrapper} onClick={(event) => {
            event.stopPropagation();
            onCopyAsMarkdownClick({ setCopyingStatus, currentUrl });
        }}>
                    {COPYING_STATUS_ICON[copyingStatus]}
                </div>
                <span onClick={(event) => {
            event.stopPropagation();
            onCopyAsMarkdownClick({ setCopyingStatus, currentUrl });
        }} className={LLMButtons_module_css_1.default.llmButtonText}>
                    {getButtonText({ status: copyingStatus })}
                </span>
                <div className={LLMButtons_module_css_1.default.chevronIconWrapper}>
                    <ui_icons_1.ChevronDownIcon size="16" color="currentColor" className={LLMButtons_module_css_1.default.chevronIcon} ref={chevronIconRef}/>
                </div>
            </div>
        </div>);
});
MenuBase.displayName = 'MenuBase';
const Option = ({ label, description, showExternalIcon, icon }) => {
    const Icon = icon ?? ui_icons_1.CopyIcon;
    return (<div className={LLMButtons_module_css_1.default.menuOption}>
            <Icon size={16} className={LLMButtons_module_css_1.default.menuOptionIcon}/>
            <div className={LLMButtons_module_css_1.default.menuOptionText}>
                <span className={LLMButtons_module_css_1.default.menuOptionLabel}>{label}</span>
                <span className={LLMButtons_module_css_1.default.menuOptionDescription}>{description}</span>
            </div>
            {showExternalIcon && (<ui_icons_1.ExternalLinkIcon size={16} className={LLMButtons_module_css_1.default.menuOptionExternalIcon}/>)}
        </div>);
};
function LLMButtons() {
    const location = (0, router_1.useLocation)();
    const [copyingStatus, setCopyingStatus] = (0, react_1.useState)('idle');
    const [currentUrl, setCurrentUrl] = (0, react_1.useState)('');
    const [isMarkdownAvailable, setIsMarkdownAvailable] = (0, react_1.useState)(false);
    const chevronIconRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        if (typeof window !== 'undefined') {
            setCurrentUrl(window.location.href);
        }
    }, [location]);
    (0, react_1.useEffect)(() => {
        if (!currentUrl) {
            setIsMarkdownAvailable(false);
            return undefined;
        }
        const controller = new AbortController();
        const markdownUrl = getMarkdownUrl(currentUrl);
        const checkMarkdownAvailability = async () => {
            try {
                const response = await fetch(markdownUrl, {
                    method: 'HEAD',
                    signal: controller.signal,
                });
                setIsMarkdownAvailable(response.ok);
            }
            catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                setIsMarkdownAvailable(false);
            }
        };
        checkMarkdownAvailability();
        return () => {
            controller.abort();
        };
    }, [currentUrl]);
    const menuOptions = (0, react_1.useMemo)(() => DROPDOWN_OPTIONS.map((option) => {
        const href = getOptionHref(option.value, currentUrl);
        if (option.value === 'viewAsMarkdown') {
            if (!isMarkdownAvailable) {
                return null;
            }
        }
        return {
            ...option,
            href,
            target: href ? '_blank' : undefined,
            rel: href ? 'noopener noreferrer' : undefined,
        };
    }).filter(Boolean), [currentUrl, isMarkdownAvailable]);
    const onMenuOptionClick = (0, react_1.useCallback)((option, event) => {
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
    }, [currentUrl, setCopyingStatus]);
    return (<Menu className={LLMButtons_module_css_1.default.llmMenu} onMenuOpen={(isOpen) => chevronIconRef.current?.classList.toggle(LLMButtons_module_css_1.default.chevronIconOpen, isOpen)} components={{
            MenuBase: (props) => (<MenuBase copyingStatus={copyingStatus} setCopyingStatus={setCopyingStatus} chevronIconRef={chevronIconRef} currentUrl={currentUrl} {...props}/>),
        }} onSelect={onMenuOptionClick} options={menuOptions}/>);
}
