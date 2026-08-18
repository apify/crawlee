"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HomepageCtaSection;
const tslib_1 = require("tslib");
const theme_common_1 = require("@docusaurus/theme-common");
const clsx_1 = tslib_1.__importDefault(require("clsx"));
const react_1 = tslib_1.__importDefault(require("react"));
const animated_crawlee_logo_dark_svg_1 = tslib_1.__importDefault(require("./animated-crawlee-logo-dark.svg"));
const animated_crawlee_logo_light_svg_1 = tslib_1.__importDefault(require("./animated-crawlee-logo-light.svg"));
const HomepageCtaSection_module_css_1 = tslib_1.__importDefault(require("./HomepageCtaSection.module.css"));
const index_module_css_1 = tslib_1.__importDefault(require("../../pages/index.module.css"));
const Button_1 = tslib_1.__importDefault(require("../Button"));
function HomepageCtaSection({ showJs, showPython }) {
    const { colorMode } = (0, theme_common_1.useColorMode)();
    return (<section className={HomepageCtaSection_module_css_1.default.ctaSection}>
            <h2 className={HomepageCtaSection_module_css_1.default.ctaTitle}>Get started now!</h2>
            <div className={HomepageCtaSection_module_css_1.default.ctaDescription}>
                Crawlee won’t fix broken selectors for you (yet), but it makes
                building and maintaining reliable crawlers faster and easier—so
                you can focus on what matters most.
            </div>
            <div className={(0, clsx_1.default)(HomepageCtaSection_module_css_1.default.ctaButtonContainer, {
            [HomepageCtaSection_module_css_1.default.ctaButtonContainerFullWidth]: showJs && showPython,
        })}>
                {showJs && (<Button_1.default to={showPython ? '/js' : '/js/docs/quick-start'} withIcon type={showJs && showPython ? 'secondary' : 'primary'} isBig>
                        {showPython ? 'Get started with JS' : 'Get started'}
                    </Button_1.default>)}
                {showPython && (<Button_1.default to="https://crawlee.dev/python" withIcon type="secondary" isBig>
                        {showJs ? 'Get started with Python' : 'Get started'}
                    </Button_1.default>)}
            </div>

            <div className={index_module_css_1.default.fadedOutSeparator} id={HomepageCtaSection_module_css_1.default.ctaFadedOutSeparator}/>
            <div className={index_module_css_1.default.fadedOutSeparatorVertical} id={HomepageCtaSection_module_css_1.default.fadedOutSeparatorVerticalLeft}/>
            <div className={index_module_css_1.default.fadedOutSeparatorVertical} id={HomepageCtaSection_module_css_1.default.fadedOutSeparatorVerticalRight}/>
            <div className={index_module_css_1.default.dashedDecorativeCircle} id={HomepageCtaSection_module_css_1.default.ctaDashedCircleRight}/>
            {colorMode === 'dark' ? (<animated_crawlee_logo_dark_svg_1.default className={HomepageCtaSection_module_css_1.default.ctaImage}/>) : (<animated_crawlee_logo_light_svg_1.default className={HomepageCtaSection_module_css_1.default.ctaImage}/>)}
        </section>);
}
