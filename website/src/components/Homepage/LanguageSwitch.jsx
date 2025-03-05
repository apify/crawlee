import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './LanguageSwitch.module.css';
import clsx from 'clsx';

export default function LanguageSwitch({
    options = ['JavaScript', 'Python'],
    defaultOption = 'JavaScript',
    onChange,
}) {
    const [activeOption, setActiveOption] = useState(defaultOption)
    const [backgroundStyle, setBackgroundStyle] = useState({})
    const optionRefs = useRef < (HTMLButtonElement | null)[] > ([])

    const updateBackgroundStyle = useCallback(() => {
        const activeIndex = options.indexOf(activeOption)
        const activeElement = optionRefs.current[activeIndex]
        if (activeElement) {
            const { offsetLeft, offsetWidth } = activeElement
            setBackgroundStyle({
                transform: `translateX(${offsetLeft}px)`,
                width: `${offsetWidth}px`,
            })
        }
    }, [activeOption, options])

    useEffect(() => {
        updateBackgroundStyle()
    }, [updateBackgroundStyle])

    const handleOptionClick = (option) => {
        setActiveOption(option)
        onChange?.(option)
    }

    return (
        <div className={styles.languageSwitch}>
            {options.map((option, index) => (
                <button
                    key={option}
                    ref={(el) => (optionRefs.current[index] = el)}
                    className={clsx(styles.switchOption, option === activeOption && styles.active)}
                    onClick={() => handleOptionClick(option)}
                >
                    {option}
                </button>
            ))}
            <div className={styles.switchBackground} style={backgroundStyle} />
        </div>
    )
}
