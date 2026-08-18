"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Button;
const tslib_1 = require("tslib");
const Link_1 = tslib_1.__importDefault(require("@docusaurus/Link"));
const clsx_1 = tslib_1.__importDefault(require("clsx"));
const react_1 = tslib_1.__importDefault(require("react"));
const Button_module_css_1 = tslib_1.__importDefault(require("./Button.module.css"));
const crawlee_logo_monocolor_svg_1 = tslib_1.__importDefault(require("../../static/img/crawlee-logo-monocolor.svg"));
function Button({ children, to, withIcon, type = 'primary', className, isBig }) {
    return (<Link_1.default to={to} target="_self" rel="dofollow">
            <span className={(0, clsx_1.default)(className, Button_module_css_1.default.button, type === 'primary' && Button_module_css_1.default.buttonPrimary, type === 'secondary' && Button_module_css_1.default.buttonSecondary, isBig && Button_module_css_1.default.big)}>
                {withIcon && <crawlee_logo_monocolor_svg_1.default />}
                {children}
            </span>
        </Link_1.default>);
}
