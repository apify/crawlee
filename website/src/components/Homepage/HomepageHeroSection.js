"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HomepageHeroSection;
const tslib_1 = require("tslib");
const react_1 = tslib_1.__importDefault(require("react"));
const HomepageHeroSection_module_css_1 = tslib_1.__importDefault(require("./HomepageHeroSection.module.css"));
const index_module_css_1 = tslib_1.__importDefault(require("../../pages/index.module.css"));
function HomepageHeroSection() {
    return (<section className={HomepageHeroSection_module_css_1.default.hero}>
            <h1 className={HomepageHeroSection_module_css_1.default.heroTitle}>
                Build reliable web scrapers. Fast.
            </h1>
            <div className={index_module_css_1.default.dashedSeparator} id={HomepageHeroSection_module_css_1.default.separatorHeroHeader}/>
            <p className={HomepageHeroSection_module_css_1.default.heroSubtitle}>
                Crawlee is a web scraping library for JavaScript and Python. It
                handles blocking, crawling, proxies, and browsers for you.
            </p>
            <div className={index_module_css_1.default.dashedSeparator} id={HomepageHeroSection_module_css_1.default.separatorHeroHeader2}>
                <div className={index_module_css_1.default.dashedDecorativeCircle} id={HomepageHeroSection_module_css_1.default.heroDecorativeCircle}/>
            </div>
        </section>);
}
