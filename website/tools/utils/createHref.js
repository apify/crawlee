/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * The SVG used below is used from docusaurus, which is licensed under the MIT license found in the
 * LICENSE file located at: https://github.com/facebook/docusaurus
 */

exports.createHref = (url, label) => {
    return `<a href="${url}" target="_blank" class="footer__link-item">
        <span>
            ${label}
            <svg
                width="13.5"
                height="13.5"
                aria-hidden="true"
                viewBox="0 0 24 24"
                style="margin-left: 0.3rem; position: relative; top: 1px;"
                >
                <path fill="currentColor" d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z">
                </path>
            </svg>
        </span>
    </a>`;
};
