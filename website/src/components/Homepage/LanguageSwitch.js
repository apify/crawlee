"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LanguageSwitch;
const tslib_1 = require("tslib");
const react_1 = tslib_1.__importStar(require("react"));
const LanguageSwitch_module_css_1 = tslib_1.__importDefault(require("./LanguageSwitch.module.css"));
const clsx_1 = tslib_1.__importDefault(require("clsx"));
function LanguageSwitch({ options = ['JavaScript', 'Python'], defaultOption = 'JavaScript', onChange, }) {
    const [activeOption, setActiveOption] = (0, react_1.useState)(defaultOption);
    const [backgroundStyle, setBackgroundStyle] = (0, react_1.useState)({});
    const optionRefs = react_1.useRef < (HTMLButtonElement | null)[] > ([]);
    const updateBackgroundStyle = (0, react_1.useCallback)(() => {
        const activeIndex = options.indexOf(activeOption);
        const activeElement = optionRefs.current[activeIndex];
        if (activeElement) {
            const { offsetLeft, offsetWidth } = activeElement;
            setBackgroundStyle({
                transform: `translateX(${offsetLeft}px)`,
                width: `${offsetWidth}px`,
            });
        }
    }, [activeOption, options]);
    (0, react_1.useEffect)(() => {
        updateBackgroundStyle();
    }, [updateBackgroundStyle]);
    const handleOptionClick = (option) => {
        setActiveOption(option);
        onChange?.(option);
    };
    return (<div className={LanguageSwitch_module_css_1.default.languageSwitch}>
            {options.map((option, index) => (<button key={option} ref={(el) => (optionRefs.current[index] = el)} className={(0, clsx_1.default)(LanguageSwitch_module_css_1.default.switchOption, option === activeOption && LanguageSwitch_module_css_1.default.active)} onClick={() => handleOptionClick(option)}>
                    {option}
                </button>))}
            <div className={LanguageSwitch_module_css_1.default.switchBackground} style={backgroundStyle}/>
        </div>);
}
