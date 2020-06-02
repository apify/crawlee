/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const React = require('react');

class Footer extends React.Component {
    docUrl(doc, language) {
        const baseUrl = this.props.config.baseUrl;
        // return `${baseUrl}docs/${language ? `${language}/` : ''}${doc}`;
        return `${baseUrl}docs/${doc}`;
    }

    pageUrl(doc, language) {
        const baseUrl = this.props.config.baseUrl;
        // return baseUrl + (language ? `${language}/` : '') + doc;
        return baseUrl + doc;
    }

    render() {
        return (
            <footer className="nav-footer" id="footer">
                <section className="sitemap">
                    <a href={this.props.config.baseUrl} className="nav-home">
                        {this.props.config.footerIcon && (
                            <img
                                src={this.props.config.baseUrl + this.props.config.footerIcon}
                                alt={this.props.config.title}
                                width="66"
                                height="58"
                            />
                        )}
                    </a>
                    <div>
                        <h5>Docs</h5>
                        <a href={this.docUrl('guides/motivation', this.props.language)}>
                            Guide
                        </a>
                        <a href={this.docUrl('examples/crawl-multiple-urls', this.props.language)}>
                            Examples
                        </a>
                        <a href={this.docUrl('api/apify', this.props.language)}>
                            API Reference
                        </a>
                    </div>
                    <div>
                        <h5>Community</h5>
                        {/*<a href={this.pageUrl('users.html', this.props.language)}>*/}
                        {/*User Showcase*/}
                        {/*</a>*/}
                        <a
                            href="https://stackoverflow.com/questions/tagged/apify"
                            target="_blank"
                            rel="noreferrer noopener">
                            Stack Overflow
                        </a>
                        {/*<a href="https://discordapp.com/">Project Chat</a>*/}
                        <a
                            href="https://twitter.com/apify"
                            target="_blank"
                            rel="noreferrer noopener">
                            Twitter
                        </a>
                        <a
                            href="https://www.facebook.com/apifytech"
                            target="_blank"
                            rel="noreferrer noopener">
                            Facebook
                        </a>
                    </div>
                    <div>
                        <h5>More</h5>
                        <a href="https://apify.com" target="_blank">Apify Cloud</a>
                        <a href="https://docusaurus.io" target="_blank">Docusaurus</a>
                        <a href={this.props.config.repoUrl} target="_blank">GitHub</a>
                    </div>
                </section>

                {/*<a*/}
                    {/*href="https://docusaurus.io"*/}
                    {/*target="_blank"*/}
                    {/*rel="noreferrer noopener"*/}
                    {/*className="fbOpenSource">*/}
                    {/*<img*/}
                        {/*src={`${this.props.config.baseUrl}img/docusaurus.svg`}*/}
                        {/*alt="Docusaurus"*/}
                        {/*width="80"*/}
                        {/*height="80"*/}
                    {/*/>*/}
                {/*</a>*/}
                <section className="copyright">{this.props.config.copyright}</section>
            </footer>
        );
    }
}

module.exports = Footer;
