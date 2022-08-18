function load() {
    const versions = document.querySelectorAll('.navbar .dropdown ul a');
    const basePath = '';
    const types = [`${basePath}/docs/next`, `${basePath}/docs`];
    let i = 0;

    for (const el of versions) {
        const match = el.href.match(/\/docs\/(\d+\.\d+(\.\d+)?)$/) || el.href.match(/\/docs\/(\d+\.\d+(\.\d+)?)/);

        if (!types[i++] && !match) {
            continue;
        }

        const version = (types[i++] || match[0]).replace('/docs', '/api');

        if (el.classList.contains('api-version-bound')) {
            continue;
        }

        el.addEventListener('click', (e) => {
            if (version && window.location.pathname.startsWith(`${basePath}/api`)) {
                window.location.href = version;
                e.preventDefault();
            }
        });
        el.classList.add('api-version-bound');
    }

    // const navbarLinks = document.querySelectorAll('.navbar a.navbar__link');
    //
    // for (const el of [...navbarLinks].slice(1, 3)) {
    //     if (el.classList.contains('api-version-bound')) {
    //         continue;
    //     }
    //
    //     const url = new URL(el.href);
    //     const parts = url.pathname.split('/');
    //     parts.splice(2, 0, 'next');
    //     url.pathname = parts.join('/');
    //     el.href = url.href;
    //     el.classList.add('api-version-bound');
    //     el.addEventListener('click', (e) => {
    //         e.stopPropagation();
    //     });
    // }
}

setInterval(() => {
    if (document.querySelectorAll('.navbar .dropdown ul a').length > 0) {
        load();
    }
}, 500);
