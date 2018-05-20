export const layout = (opts = {}) => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Live View Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  ${opts.refresh ? `<meta http-equiv="refresh" content="${opts.refresh}">` : ''}
</head>
<body>
${opts.body || ''}
</body>
</html>
`;

export const rootPage = (browsers) => {
    const body = `
<h1>Available live view browsers:</h1>
    ${browsers.map(b => `
    <a href="/browser/${b.id}"><p>ID: ${b.id}</p></a>
    `).join('')}
`;
    return layout({
        body,
        refresh: 3,
    });
};

export const encodeImg = (buffer) => {
    return `
<div>
    <img src="data:image/png;base64, ${buffer.toString('base64')}" alt="Page screenshot" />
</div> 
`;
};


export const imgPage = (buffer) => {
    const body = encodeImg(buffer);
    return layout({
        body,
        refresh: 1,
    });
};

export const notFoundPage = () => {
    const body = '<p>This page does not exist.</p>';
    return layout({ body });
};

export const errorPage = (message) => {
    const body = `
<p>Sorry. There was an error and Live View failed.</p>
${message ? `<p>Message: ${message}</p>` : ''}
`;
    return layout({ body });
};
