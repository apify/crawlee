"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = RiverSection;
const tslib_1 = require("tslib");
const Link_1 = tslib_1.__importDefault(require("@docusaurus/Link"));
const clsx_1 = tslib_1.__importDefault(require("clsx"));
const react_1 = tslib_1.__importDefault(require("react"));
const RiverSection_module_css_1 = tslib_1.__importDefault(require("./RiverSection.module.css"));
function RiverSection({ title, description, content, reversed, to }) {
    return (<div className={RiverSection_module_css_1.default.riverWrapper}>
            <div className={(0, clsx_1.default)(RiverSection_module_css_1.default.riverContainer, { [RiverSection_module_css_1.default.riverReversed]: reversed })}>
                <div className={(0, clsx_1.default)(RiverSection_module_css_1.default.riverSection, RiverSection_module_css_1.default.riverText)}>
                    <h3 className={RiverSection_module_css_1.default.riverTitle}>{title}</h3>
                    <p className={RiverSection_module_css_1.default.riverDescription}>{description}</p>
                    <Link_1.default className={RiverSection_module_css_1.default.riverButton} to={to}>
                        Learn more
                    </Link_1.default>
                </div>
                <div className={(0, clsx_1.default)(RiverSection_module_css_1.default.riverSection, RiverSection_module_css_1.default.riverContent)}>{content}</div>
            </div>
        </div>);
}
