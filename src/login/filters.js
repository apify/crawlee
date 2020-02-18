export const filters = [
    // 1 username patterns by priority - exact match
    // 2 password
    // 3 non-password
    ({input, inputPrior, inputAfter}, {pattern}) =>
        input.type === 'password' &&
        inputPrior &&
        inputPrior[pattern.attribute] === pattern.value &&
        (!inputAfter || inputAfter.type !== 'password'),

    // 1 username patterns by priority included in attribute
    // 2 password
    // 3 non-password
    ({input, inputPrior, inputAfter}, {pattern}) =>
        input.type === 'password' &&
        inputPrior &&
        inputPrior[pattern.attribute].includes(pattern.value) &&
        (!inputAfter || inputAfter.type !== 'password'),

    // 1 non-password
    // 2 password
    // 3 non-password
    ({input, inputPrior, inputAfter}) =>
        input.type === 'password' &&
        inputPrior &&
        inputPrior.type !== 'password' &&
        (!inputAfter || inputAfter.type !== 'password')
];
