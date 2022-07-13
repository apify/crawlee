/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './index.module.css';

const React = require('react');

const CompLibrary = {
    Container: (props) => <div {...props}></div>,
    GridBlock: (props) => <div {...props}></div>,
    MarkdownBlock: (props) => <div {...props}></div>,
};

const { Container } = CompLibrary;

const versions = require(`../../versions.json`);

function Versions(props) {
    const { config: siteConfig } = props;
    const latestVersion = versions[0];
    const repoUrl = `https://github.com/${siteConfig.organizationName}/${siteConfig.projectName}`;
    return (
        <section className={clsx('container', styles.features)}>
            <Container className="mainContainer versionsContainer">
                <div className="post">
                    <header className="postHeader">
                        <h1>{siteConfig.title} Versions</h1>
                    </header>
                    <p>
                        New versions of Apify SDK are released once a month or
                        so. With major releases once a year.
                    </p>
                    <h3 id="latest">Current version (Stable)</h3>
                    <table className="versions">
                        <tbody>
                            <tr>
                                <th>{latestVersion}</th>
                                <td>
                                    {/* You are supposed to change this href where appropriate
                        Example: href="<baseUrl>/docs(/:language)/:id" */}
                                    <a
                                        href={`${siteConfig.baseUrl}${
                                            siteConfig.docsUrl
                                        }/${
                                            props.language
                                                ? `${props.language}/`
                                                : ''
                                        }api/apify`}
                                    >
                                        Documentation
                                    </a>
                                </td>
                                <td>
                                    <a
                                        href={`${repoUrl}/releases/tag/v${latestVersion}`}
                                    >
                                        Release Notes
                                    </a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p>
                        This is the version that is configured automatically
                        when you first install Apify SDK.
                    </p>
                    <h3 id="rc">Pre-release versions</h3>
                    <table className="versions">
                        <tbody>
                            <tr>
                                <th>master</th>
                                <td>
                                    {/* You are supposed to change this href where appropriate
                        Example: href="<baseUrl>/docs(/:language)/next/:id" */}
                                    <a
                                        href={`${siteConfig.baseUrl}${
                                            siteConfig.docsUrl
                                        }/${
                                            props.language
                                                ? `${props.language}/`
                                                : ''
                                        }next/api/apify`}
                                    >
                                        Documentation
                                    </a>
                                </td>
                                <td>
                                    <a href={repoUrl}>Source Code</a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <h3 id="archive">Past Versions</h3>
                    <p>
                        Here you can find previous versions of the
                        documentation.
                    </p>
                    <table className="versions">
                        <tbody>
                            {versions.map(
                                (version) =>
                                    version !== latestVersion && (
                                        <tr key={version}>
                                            <th>{version}</th>
                                            <td>
                                                {/* You are supposed to change this href where appropriate
                        Example: href="<baseUrl>/docs(/:language)/:version/:id" */}
                                                <a
                                                    href={`${
                                                        siteConfig.baseUrl
                                                    }${siteConfig.docsUrl}/${
                                                        props.language
                                                            ? `${props.language}/`
                                                            : ''
                                                    }${version}/api/apify`}
                                                >
                                                    Documentation
                                                </a>
                                            </td>
                                            <td>
                                                <a
                                                    href={`${repoUrl}/releases/tag/v${version}`}
                                                >
                                                    Release Notes
                                                </a>
                                            </td>
                                        </tr>
                                    ),
                            )}
                        </tbody>
                    </table>
                    <p>
                        You can find past versions of this project on{' '}
                        <a href={repoUrl}>GitHub</a>.
                    </p>
                </div>
            </Container>
        </section>
    );
}

export default (props) => (
    <Layout>
        <Versions {...props} />
    </Layout>
);
