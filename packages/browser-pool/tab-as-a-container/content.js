// When in doubt, refer to https://github.com/nodejs/node/blob/main/doc/contributing/primordials.md

/* eslint-disable no-undef */
/* eslint-disable no-cond-assign */
/* eslint-disable prefer-rest-params */
/* eslint-disable no-shadow */

// TODO: https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API
// TODO: custom error messages for Firefox (for now it uses Chrome's)

// The only way to detect this "container" is to benchmark document.cookie or compare localStorage performance with sessionStorage (it's the same).

const isFirefox = navigator.userAgent.includes('Firefox');
const tabPrefix = `.${tabId}.`;

const {
    String,
    Array,
    Set,
    TypeError,
    WeakMap,
    Object,
    Number,
    Function,
    Proxy,
    IDBFactory,
    IDBDatabase,
    BroadcastChannel,
    Storage,
    // We don't have to implement StorageEvent because this implementation does not use localStorage at all.
} = globalThis;

const ObjectDefineProperty = Object.defineProperty;
const ObjectDefineProperties = Object.defineProperties;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectCreate = Object.create;
const ObjectEntries = Object.entries;
const ReflectGet = Reflect.get;
const ReflectSet = Reflect.set;
const ObjectKeys = Object.keys;
const NumberIsFinite = Number.isFinite;

const clonePrototype = (from) => {
    const target = ObjectCreate(null);
    const prototype = ObjectGetOwnPropertyDescriptors(from.prototype);

    const entries = ObjectEntries(prototype);

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        const { 0: name, 1: descriptor } = entry;
        target[name] = ObjectCreate(null);

        if ('get' in descriptor) {
            target[name].get = descriptor.get;
        }

        if ('set' in descriptor) {
            target[name].set = descriptor.set;
        }

        if ('value' in descriptor) {
            target[name] = descriptor.value;
        }
    }

    return target;
};

const StringSplitSafe = (string, separator) => {
    const result = [];
    const separatorLength = separator.length;

    if (separatorLength === 0) {
        throw new Error('Separator must not be empty');
    }

    let startFrom = 0;
    let index;
    while ((index = StringPrototype.indexOf.call(string, separator, startFrom)) !== -1) {
        ArrayPrototype.push.call(result, StringPrototype.slice.call(string, startFrom, index));

        startFrom = index + separatorLength;
    }

    const lastChunk = StringPrototype.slice.call(string, startFrom);

    ArrayPrototype.push.call(result, lastChunk);

    return result;
};

const fixStack = (error) => {
    const lines = StringSplitSafe(error.stack, '\n');

    if (isFirefox) {
        ArrayPrototype.splice.call(lines, 0, 1);
    } else {
        ArrayPrototype.splice.call(lines, 1, 1);
    }

    error.stack = ArrayPrototype.join.call(lines, '\n');

    return error;
};

const SetPrototype = clonePrototype(Set);
const WeakMapPrototype = clonePrototype(WeakMap);
const ArrayPrototype = clonePrototype(Array);
const StringPrototype = clonePrototype(String);
const IDBFactoryPrototype = clonePrototype(IDBFactory);
const IDBDatabasePrototype = clonePrototype(IDBDatabase);
const StoragePrototype = clonePrototype(Storage);

const privates = new WeakMap();

let invocable = false;

const FakeStorage = class Storage {
    constructor() {
        if (invocable) {
            throw fixStack(new TypeError('Illegal constructor'));
        }

        WeakMapPrototype.set.call(privates, this, arguments[0]);
    }

    get length() {
        const priv = WeakMapPrototype.get.call(privates, this);
        if (!priv) {
            throw fixStack(new TypeError('Illegal invocation'));
        }

        const { storage, prefix } = priv;
        const length = StoragePrototype.length.get.call(storage);

        let fakeLength = 0;
        for (let i = 0; i < length; i++) {
            const storageKey = StoragePrototype.key.call(storage, i);
            if (StringPrototype.startsWith.call(storageKey, prefix)) {
                fakeLength++;
            }
        }

        return fakeLength;
    }

    clear() {
        const priv = WeakMapPrototype.get.call(privates, this);
        if (!priv) {
            throw fixStack(new TypeError('Illegal invocation'));
        }

        const { storage, prefix } = priv;
        const length = StoragePrototype.length.get.call(storage);
        const keys = [];

        for (let i = 0; i < length; i++) {
            ArrayPrototype.push.call(keys, StoragePrototype.key.call(storage, i));
        }

        for (let i = 0; i < length; i++) {
            const storageKey = keys[i];
            if (StringPrototype.startsWith.call(storageKey, prefix)) {
                StoragePrototype.removeItem.call(storage, storageKey);
            }
        }
    }

    key(index) {
        const priv = WeakMapPrototype.get.call(privates, this);
        if (!priv) {
            throw fixStack(new TypeError('Illegal invocation'));
        }

        if (arguments.length === 0) {
            throw fixStack(
                new TypeError(`Failed to execute 'key' on 'Storage': 1 argument required, but only 0 present.`),
            );
        }

        index = NumberIsFinite(index) ? index : 0;

        const { storage, prefix } = priv;
        const length = StoragePrototype.length.get.call(storage);

        let fakeLength = 0;
        for (let i = 0; i < length; i++) {
            const storageKey = StoragePrototype.key.call(storage, i);

            if (StringPrototype.startsWith.call(storageKey, prefix)) {
                if (fakeLength === index) {
                    return StringPrototype.slice.call(storageKey, prefix.length);
                }

                fakeLength++;
            }
        }

        return null;
    }

    getItem(key) {
        const priv = WeakMapPrototype.get.call(privates, this);
        if (!priv) {
            throw fixStack(new TypeError('Illegal invocation'));
        }

        if (arguments.length === 0) {
            throw fixStack(
                new TypeError(`Failed to execute 'getItem' on 'Storage': 1 argument required, but only 0 present.`),
            );
        }

        return StoragePrototype.getItem.call(priv.storage, priv.prefix + key);
    }

    removeItem(key) {
        const priv = WeakMapPrototype.get.call(privates, this);
        if (!priv) {
            throw fixStack(new TypeError('Illegal invocation'));
        }

        if (arguments.length === 0) {
            throw fixStack(
                new TypeError(`Failed to execute 'removeItem' on 'Storage': 1 argument required, but only 0 present.`),
            );
        }

        StoragePrototype.removeItem.call(priv.storage, priv.prefix + key);
    }

    setItem(key, value) {
        const priv = WeakMapPrototype.get.call(privates, this);
        if (!priv) {
            throw fixStack(new TypeError('Illegal invocation'));
        }

        if (arguments.length === 0 || arguments.length === 1) {
            throw fixStack(
                new TypeError(
                    `Failed to execute 'setItem' on 'Storage': 2 arguments required, but only ${arguments.length} present.`,
                ),
            );
        }

        StoragePrototype.setItem.call(priv.storage, priv.prefix + key, value);
    }
};

const FakeStoragePrototype = clonePrototype(FakeStorage);

const createStorage = ({ storage, prefix }) => {
    invocable = false;
    const fake = new FakeStorage({ storage, prefix });
    invocable = true;

    const proxy = new Proxy(fake, {
        __proto__: null,
        // Default:
        // apply: (target, thisArg, args) => {},
        // construct(target, args) => {},
        // setPrototypeOf: (target, proto) => {},
        // getPrototypeOf: (target) => {},
        defineProperty: (target, key, descriptor) => {
            if ('set' in descriptor || 'get' in descriptor) {
                throw fixStack(
                    new TypeError(`Failed to set a named property on 'Storage': Accessor properties are not allowed.`),
                );
            }

            FakeStoragePrototype.setItem.call(target, key, descriptor.value);
        },
        deleteProperty: (target, key) => {
            if (typeof key === 'symbol') {
                delete target[key];
            } else {
                FakeStoragePrototype.removeItem.call(target, key);
            }

            return true;
        },
        get: (target, key) => {
            if (typeof key === 'symbol') {
                return target[key];
            }

            if (key in target) {
                return ReflectGet(target, key);
            }

            return FakeStoragePrototype.getItem.call(target, key) ?? undefined;
        },
        set: (target, key, value) => {
            if (typeof key === 'symbol') {
                ObjectDefineProperty(target, key, {
                    __proto__: null,
                    value,
                    configurable: true,
                    writable: true,
                    enumerable: false,
                });

                return true;
            }

            if (key in target) {
                return ReflectSet(target, key, value);
            }

            return FakeStoragePrototype.setItem.call(target, key, value) ?? true;
        },
        has: (target, key) => {
            if (key in target) {
                return true;
            }

            return FakeStoragePrototype.getItem.call(target, key) !== null;
        },
        isExtensible: () => {
            return true;
        },
        preventExtensions: () => {
            throw fixStack(new TypeError(`Cannot prevent extensions`));
        },
        getOwnPropertyDescriptor: (target, key) => {
            if (key in target) {
                return ObjectGetOwnPropertyDescriptor(ObjectGetPrototypeOf(target), key);
            }

            const value = FakeStoragePrototype.getItem.call(target, key);

            if (value !== null) {
                return {
                    value,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };
            }
        },
        ownKeys: (target) => {
            const keys = [];

            const { storage, prefix } = WeakMapPrototype.get.call(privates, target);
            const length = StoragePrototype.length.get.call(storage);

            for (let i = 0; i < length; i++) {
                const storageKey = StoragePrototype.key.call(storage, i);

                if (StringPrototype.startsWith.call(storageKey, prefix)) {
                    ArrayPrototype.push.call(keys, StringPrototype.slice.call(storageKey, prefix.length));
                }
            }

            ArrayPrototype.push.apply(keys, ObjectKeys(target));

            const set = new Set();

            for (let i = 0; i < keys.length; i++) {
                SetPrototype.add.call(set, keys[i]);
            }

            return ArrayPrototype.slice.call(set);
        },
    });

    privates.set(proxy, privates.get(fake));

    return proxy;
};

const toHide = new WeakMap();
for (const Type of [Function, Object, Array]) {
    const create = (fallback) =>
        function () {
            if (this instanceof FakeStorage) {
                return '[object Storage]';
            }

            if (WeakMapPrototype.has.call(toHide, this)) {
                return `function ${WeakMapPrototype.get.call(toHide, this)}() { [native code] }`;
            }

            return fallback.call(this);
        };

    const toString = create(Type.prototype.toString);
    const toLocaleString = create(Type.prototype.toLocaleString);

    WeakMapPrototype.set.call(toHide, toString, 'toString');
    WeakMapPrototype.set.call(toHide, toLocaleString, 'toLocaleString');

    Object.defineProperty(Type.prototype, 'toString', {
        __proto__: null,
        value: toString,
    });
    Object.defineProperty(Type.prototype, 'toLocaleString', {
        __proto__: null,
        value: toLocaleString,
    });
}

// https://stackoverflow.com/q/30481516
try {
    // We use sessionStorage as the underlying storage for localStorage.
    // This way we do not have to worry about clean up.
    const { sessionStorage } = globalThis;

    const fakeLocalStorage = createStorage({ storage: sessionStorage, prefix: 'l.' });
    const fakeSessionStorage = createStorage({ storage: sessionStorage, prefix: 's.' });

    const getLocalStorage = function localStorage() {
        return fakeLocalStorage;
    };
    const getSessionStorage = function sessionStorage() {
        return fakeSessionStorage;
    };

    WeakMapPrototype.set.call(toHide, FakeStorage, 'Storage');
    WeakMapPrototype.set.call(toHide, FakeStoragePrototype.key, 'key');
    WeakMapPrototype.set.call(toHide, FakeStoragePrototype.getItem, 'getItem');
    WeakMapPrototype.set.call(toHide, FakeStoragePrototype.setItem, 'setItem');
    WeakMapPrototype.set.call(toHide, FakeStoragePrototype.removeItem, 'removeItem');
    WeakMapPrototype.set.call(toHide, FakeStoragePrototype.clear, 'clear');
    WeakMapPrototype.set.call(toHide, getLocalStorage, 'get localStorage');
    WeakMapPrototype.set.call(toHide, getSessionStorage, 'get sessionStorage');

    ObjectDefineProperties(window, {
        __proto__: null,
        Storage: {
            __proto__: null,
            value: FakeStorage,
            configurable: true,
            enumerable: false,
            writable: true,
        },
        localStorage: {
            __proto__: null,
            configurable: true,
            enumerable: true,
            get: getLocalStorage,
            set: undefined,
        },
        sessionStorage: {
            __proto__: null,
            configurable: true,
            enumerable: true,
            get: getSessionStorage,
            set: undefined,
        },
    });
} catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
}

{
    const { Document } = globalThis;

    const realGetCookie = ObjectGetOwnPropertyDescriptor(Document.prototype, 'cookie').get;
    const realSetCookie = ObjectGetOwnPropertyDescriptor(Document.prototype, 'cookie').set;

    const getCookie = function cookie() {
        try {
            const cookies = StringSplitSafe(realGetCookie.call(this), '; ');
            const filtered = ArrayPrototype.filter.call(cookies, (cookie) =>
                StringPrototype.startsWith.call(cookie, tabPrefix),
            );
            const mapped = ArrayPrototype.map.call(filtered, (cookie) => {
                const result = StringPrototype.slice.call(cookie, tabPrefix.length);

                if (result[0] === '=') {
                    return StringPrototype.slice.call(result, 1);
                }

                return result;
            });

            return ArrayPrototype.join.call(mapped, '; ');
        } catch (error) {
            throw fixStack(error);
        }
    };

    const setCookie = function cookie(cookieString) {
        cookieString = StringPrototype.trimStart.call(String(cookieString));

        const delimiterIndex = StringPrototype.indexOf.call(cookieString, ';');
        const equalsIndex = StringPrototype.indexOf.call(cookieString, '=');
        if (equalsIndex === -1 || (delimiterIndex !== -1 && equalsIndex > delimiterIndex)) {
            cookieString = `=${cookieString}`;
        }

        try {
            realSetCookie.call(this, tabPrefix + cookieString);
        } catch (error) {
            throw fixStack(error);
        }
    };

    WeakMapPrototype.set.call(toHide, getCookie, 'get cookie');
    WeakMapPrototype.set.call(toHide, setCookie, 'set cookie');

    ObjectDefineProperty(Document.prototype, 'cookie', {
        __proto__: null,
        configurable: true,
        enumerable: true,
        get: getCookie,
        set: setCookie,
    });
}

{
    const openDatabase = function open(name) {
        try {
            return IDBFactoryPrototype.open.call(this, tabPrefix + name);
        } catch (error) {
            throw fixStack(error);
        }
    };

    const deleteDatabase = function deleteDatabase(name) {
        try {
            return IDBFactoryPrototype.deleteDatabase.call(this, tabPrefix + name);
        } catch (error) {
            throw fixStack(error);
        }
    };

    const databaseName = function name() {
        try {
            return StringPrototype.slice.call(IDBDatabasePrototype.name.get.call(this), tabPrefix.length);
        } catch (error) {
            throw fixStack(error);
        }
    };

    WeakMapPrototype.set.call(toHide, openDatabase, 'open');
    WeakMapPrototype.set.call(toHide, deleteDatabase, 'deleteDatabase');
    WeakMapPrototype.set.call(toHide, databaseName, 'get name');

    ObjectDefineProperties(IDBFactory.prototype, {
        __proto__: null,
        open: {
            __proto__: null,
            writable: true,
            configurable: true,
            enumerable: true,
            value: openDatabase,
        },
        deleteDatabase: {
            __proto__: null,
            writable: true,
            configurable: true,
            enumerable: true,
            value: deleteDatabase,
        },
        name: {
            __proto__: null,
            configurable: true,
            enumerable: true,
            get: databaseName,
            set: undefined,
        },
    });
}

{
    ObjectDefineProperty(window, 'BroadcastChannel', {
        __proto__: null,
        configurable: true,
        enumerable: false,
        writable: true,
        value: new Proxy(BroadcastChannel, {
            __proto__: null,
            construct: (Target, name) => {
                return new Target(tabPrefix + name);
            },
        }),
    });

    WeakMapPrototype.set.call(toHide, window.BroadcastChannel, 'BroadcastChannel');

    const getBroadcastChannelName = ObjectGetOwnPropertyDescriptor(BroadcastChannel.prototype, 'name').get;
    const broadcastChannelName = function name() {
        try {
            const realName = getBroadcastChannelName.call(this);

            if (StringPrototype.startsWith.call(realName, tabPrefix)) {
                return StringPrototype.slice.call(realName, tabPrefix.length);
            }

            return realName;
        } catch (error) {
            throw fixStack(error);
        }
    };

    WeakMapPrototype.set.call(toHide, broadcastChannelName, 'get name');

    ObjectDefineProperty(BroadcastChannel.prototype, 'name', {
        __proto__: null,
        configurable: true,
        enumerable: true,
        get: broadcastChannelName,
        set: undefined,
    });
}
