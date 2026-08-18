"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LanguageInfoWidget;
const tslib_1 = require("tslib");
const theme_common_1 = require("@docusaurus/theme-common");
const ThemedImage_1 = tslib_1.__importDefault(require("@theme/ThemedImage"));
const clsx_1 = tslib_1.__importDefault(require("clsx"));
const react_1 = tslib_1.__importDefault(require("react"));
const react_github_btn_1 = tslib_1.__importDefault(require("react-github-btn"));
const Button_1 = tslib_1.__importDefault(require("../Button"));
const CopyButton_1 = tslib_1.__importDefault(require("../CopyButton"));
const LanguageInfoWidget_module_css_1 = tslib_1.__importDefault(require("./LanguageInfoWidget.module.css"));
function LanguageInfoWidget({ language, command, to, githubUrl, }) {
    const { colorMode } = (0, theme_common_1.useColorMode)();
    return (<div className={LanguageInfoWidget_module_css_1.default.languageGetStartedContainer}>
            {language === 'JavaScript' && (<ThemedImage_1.default sources={{
                light: '/img/crawlee-javascript-light.svg',
                dark: '/img/crawlee-javascript-dark.svg',
            }} alt="Crawlee JavaScript"/>)}
            {language === 'Python' && (<ThemedImage_1.default sources={{
                light: '/img/crawlee-python-light.svg',
                dark: '/img/crawlee-python-dark.svg',
            }} alt="Crawlee Python"/>)}
            <div className={(0, clsx_1.default)(LanguageInfoWidget_module_css_1.default.buttonContainer)}>
                <Button_1.default to={to}>
                    {command ? 'Learn more' : 'Get started'}
                </Button_1.default>
                <react_github_btn_1.default href={githubUrl} data-color-scheme={colorMode} data-show-count="true" aria-label="Star crawlee on GitHub" data-size="large" style={{ minHeight: '28px' }}>
                    Star
                </react_github_btn_1.default>
            </div>
            {command && (<code className={LanguageInfoWidget_module_css_1.default.commandContainer}>
                    {command} <CopyButton_1.default copyText={command} compact/>
                </code>)}
        </div>);
}
