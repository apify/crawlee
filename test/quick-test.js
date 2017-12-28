// const Apify = require('../build/index');

// Apify.main(async () => {
//     const store = await Apify.getOrCreateStore('my-store-test');
//     console.log(store);

//     const mock1 = {
//         input: 'Test',
//     };
//     let input = await store.getValue('INPUT');
//     console.log('INPUT', input);
//     await store.setValue('INPUT', mock1);
//     input = await store.getValue('INPUT');
//     console.log('INPUT After', input);

//     const mock = {
//         name: 'Juan',
//         lastName: 'Gaitan',
//         middleName: 'Sebastian',
//     };
//     await store.setValue('STATE', { mock });

//     const nextInput = await store.getValue('STATE');
//     console.log(nextInput);
// });
