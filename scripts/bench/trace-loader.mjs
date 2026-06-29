// Logs every package resolved by Node's ESM loader. Used with
// `node --import data:text/javascript,... --import this-file ...` so we see exactly which
// third-party packages a target pulls at load time.
export async function resolve(specifier, context, nextResolve) {
    const r = await nextResolve(specifier, context);
    if (!specifier.startsWith('.') && !specifier.startsWith('node:') && !specifier.startsWith('file:')) {
        process.stderr.write(`R ${specifier}\n`);
    }
    return r;
}
