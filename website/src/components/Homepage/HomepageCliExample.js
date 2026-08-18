"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CliExample;
const tslib_1 = require("tslib");
const react_1 = tslib_1.__importDefault(require("react"));
const CopyButton_1 = tslib_1.__importDefault(require("../CopyButton"));
const HomepageCliExample_module_css_1 = tslib_1.__importDefault(require("./HomepageCliExample.module.css"));
function CliExample({ example }) {
    return (<section className={HomepageCliExample_module_css_1.default.cliExampleSection}>
            <div className={HomepageCliExample_module_css_1.default.cliExampleTitle}>
                Or start with a template from our CLI
            </div>
            <code className={HomepageCliExample_module_css_1.default.cliExampleCodeBlock}>
                <pre>
                    <span className={HomepageCliExample_module_css_1.default.cliCommandPrefix}>$</span>
                    {example}
                    <CopyButton_1.default copyText={example}/>
                </pre>
            </code>
            <div className={HomepageCliExample_module_css_1.default.cliExampleSubtitle}>
                Built with 🤍 by Apify. Forever free and open-source.
            </div>
        </section>);
}
