// const Apify = require('../build/index');

// Apify.main(async () => {
//     const store = await Apify.getOrCreateStore('my-store-test');
//     console.log(store);

//     let input = await store.getValue({ key: 'INPUT' });
//     console.log('INPUT', input);

//     const mock = {
//         name: 'Juan',
//         lastName: 'Gaitan',
//         middleName: 'Sebastian',
//     };
//     await store.setValue({ key: 'STATE', body: mock });

//     const nextInput = await store.getValue({ key: 'STATE' });
//     console.log(nextInput);
// });
