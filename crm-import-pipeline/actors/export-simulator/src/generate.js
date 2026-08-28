/**
 * Deterministic generator for the simulated regional CRM exports.
 *
 * Everything here is driven by a single seeded PRNG, so the same `seed` always
 * produces byte-identical CSV files. That is what makes the ground truth in
 * `expected-report.json` meaningful: it describes exactly the bytes that were
 * written, not an approximation of them.
 */

import { CSV_COLUMNS } from './lib/crm-lib.js';

/** Rows per regional export. */
export const DEFAULT_ROWS_PER_REGION = 5000;
/** Number of regional exports. */
export const DEFAULT_REGION_COUNT = 8;
/** Share of rows that are a duplicate of a contact whose home is another region. */
export const DEFAULT_DUPLICATE_RATE = 0.1;
/** The one region that is deliberately bad enough to trip the importer's circuit breaker. */
export const HOT_REGION = 7;

/** Malformed-row rate bands, as fractions of a region's rows. */
const MALFORMED_RATE_BAND = { min: 0.01, max: 0.04 };
const HOT_MALFORMED_RATE_BAND = { min: 0.06, max: 0.08 };

/** Cumulative thresholds for the single per-row field-defect draw. */
const FIELD_DEFECT_THRESHOLDS = [
    { limit: 0.006, kind: 'email' },
    { limit: 0.012, kind: 'phone' },
    { limit: 0.018, kind: 'date' },
    { limit: 0.021, kind: 'missing' },
];

/** Anchor for generated `updatedAt` values; contacts are dated in the year before it. */
const DATE_ANCHOR_MS = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;
/** Days between two copies of the same contact, so no dedup contest ever ties. */
const DAYS_BETWEEN_COPIES = 13;

const FIRST_NAMES = [
    'Jan', 'Petr', 'Jakub', 'Martin', 'Tomáš', 'Lukáš', 'Ondřej', 'David', 'Filip', 'Marek',
    'Adam', 'Vojtěch', 'Michal', 'Josef', 'Daniel', 'Matěj', 'Karel', 'Štěpán', 'Radek', 'Pavel',
    'Eva', 'Jana', 'Hana', 'Lucie', 'Tereza', 'Kateřina', 'Barbora', 'Veronika', 'Markéta', 'Zuzana',
    'Klára', 'Anna', 'Nikola', 'Michaela', 'Petra', 'Simona', 'Alena', 'Iveta', 'Denisa', 'Kristýna',
];

const LAST_NAMES = [
    'Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec',
    'Pokorný', 'Marek', 'Pospíšil', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala', 'Sedláček',
    'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Vaněk', 'Urban', 'Blažek', 'Kříž', 'Kovář',
];

const EMAIL_DOMAINS = ['example.cz', 'example.com', 'mail.example.net', 'firma.example.cz'];

/**
 * xmur3 string hash - turns an arbitrary seed into a 32-bit state for mulberry32.
 *
 * @param {string} input
 * @returns {() => number}
 */
function xmur3(input) {
    let h = 1779033703 ^ input.length;

    for (let i = 0; i < input.length; i++) {
        h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }

    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    };
}

/**
 * mulberry32 PRNG - small, fast, and fully determined by its 32-bit state.
 *
 * @param {string | number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function createRng(seed) {
    const next = xmur3(String(seed));
    let state = next();

    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** @returns {number} integer in [min, max] */
function randomInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
}

/** @returns {T} */
function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
}

/** In-place Fisher-Yates using the seeded PRNG. */
function shuffle(rng, items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

/** Strip diacritics so `Tomáš Růžička` yields the email local part `tomas.ruzicka`. */
function slug(value) {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

/** Two-digit zero padding. */
function pad2(value) {
    return String(value).padStart(2, '0');
}

/**
 * Build the pool of distinct people, each one at home in exactly one region.
 *
 * @returns {{ index: number, homeRegion: number, firstName: string, lastName: string,
 *             email: string, phoneDigits: string, baseDay: number, copies: number }[]}
 */
function createPeople(rng, { regionCount, uniquePerRegion }) {
    const people = [];

    for (let region = 1; region <= regionCount; region++) {
        for (let i = 0; i < uniquePerRegion; i++) {
            const index = people.length;
            const firstName = pick(rng, FIRST_NAMES);
            const lastName = pick(rng, LAST_NAMES);

            people.push({
                index,
                homeRegion: region,
                firstName,
                lastName,
                // The index keeps every address unique, which makes "one email == one
                // person" true by construction and the expected unique count exact.
                email: `${slug(firstName)}.${slug(lastName)}${index}@${pick(rng, EMAIL_DOMAINS)}`,
                phoneDigits: `7${randomInt(rng, 0, 99999999).toString().padStart(8, '0')}`,
                baseDay: randomInt(rng, 1, 330),
                copies: 0,
            });
        }
    }

    return people;
}

/**
 * Assign every row slot in every region to a person.
 *
 * Each region gets `uniquePerRegion` of its own people plus `duplicatesPerRegion`
 * copies of people who live in *other* regions - that is the cross-region
 * duplication a real multi-region CRM export suffers from.
 */
function assignRowSlots(rng, people, { regionCount, duplicatesPerRegion }) {
    /** @type {Map<number, { person: object, copyIndex: number }[]>} */
    const slotsByRegion = new Map();

    for (let region = 1; region <= regionCount; region++) {
        const slots = people
            .filter((person) => person.homeRegion === region)
            .map((person) => ({ person, copyIndex: person.copies++ }));

        slotsByRegion.set(region, slots);
    }

    for (let region = 1; region <= regionCount; region++) {
        const slots = slotsByRegion.get(region);

        for (let i = 0; i < duplicatesPerRegion; i++) {
            let person = people[Math.floor(rng() * people.length)];
            // Re-draw until we land on someone from another region: a duplicate that
            // stays inside its home region would not exercise cross-region merging.
            while (person.homeRegion === region) {
                person = people[Math.floor(rng() * people.length)];
            }

            slots.push({ person, copyIndex: person.copies++ });
        }

        shuffle(rng, slots);
    }

    return slotsByRegion;
}

/** How many rows of this region get a broken column count. */
function malformedCountFor(rng, region, rowsPerRegion) {
    const band = region === HOT_REGION ? HOT_MALFORMED_RATE_BAND : MALFORMED_RATE_BAND;
    const rate = band.min + rng() * (band.max - band.min);
    return Math.round(rowsPerRegion * rate);
}

/** Which field defect, if any, this row carries. */
function drawFieldDefect(rng) {
    const draw = rng();
    for (const { limit, kind } of FIELD_DEFECT_THRESHOLDS) {
        if (draw < limit) return kind;
    }
    return null;
}

function renderName(rng, person) {
    const canonical = `${person.firstName} ${person.lastName}`;

    switch (randomInt(rng, 0, 4)) {
        case 0: return canonical;
        case 1: return canonical.toUpperCase();
        case 2: return canonical.toLowerCase();
        case 3: return `${person.firstName}  ${person.lastName}`;
        default: return ` ${canonical} `;
    }
}

function renderEmail(rng, person) {
    const [local, domain] = person.email.split('@');

    switch (randomInt(rng, 0, 3)) {
        case 0: return person.email;
        case 1: return person.email.toUpperCase();
        case 2: return `${local[0].toUpperCase()}${local.slice(1)}@${domain}`;
        default: return ` ${person.email} `;
    }
}

function renderPhone(rng, person) {
    const d = person.phoneDigits;
    const grouped = `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;

    switch (randomInt(rng, 0, 5)) {
        case 0: return `+420${d}`;
        case 1: return `+420 ${grouped}`;
        case 2: return d;
        case 3: return grouped;
        case 4: return `00420${d}`;
        default: return `420 ${grouped}`;
    }
}

function renderDate(rng, timestampMs) {
    const date = new Date(timestampMs);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();

    switch (randomInt(rng, 0, 5)) {
        case 0: return date.toISOString();
        case 1: return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
        case 2: return `${pad2(day)}/${pad2(month)}/${year}`;
        case 3: return `${day}.${month}.${year}`;
        case 4: return `${year}/${pad2(month)}/${pad2(day)}`;
        default: return String(timestampMs);
    }
}

const INVALID_EMAILS = ['jan.novak(at)example.cz', 'broken@', '@example.cz', '', 'no-at-sign.example.cz'];
const INVALID_PHONES = ['12345', 'n/a', '', '+', 'volejte pozdeji'];
const INVALID_DATES = ['not-a-date', '31.02.2026', '14/13/2026', 'yesterday', ''];

/**
 * Render one CSV line for a row slot.
 *
 * @returns {string}
 */
function renderRow(rng, { person, copyIndex }, { region, id, malformedKind }) {
    const dayOffset = person.baseDay + copyIndex * DAYS_BETWEEN_COPIES;
    const timestampMs = DATE_ANCHOR_MS
        + dayOffset * DAY_MS
        + randomInt(rng, 0, 23) * 3_600_000
        + randomInt(rng, 0, 59) * 60_000
        + randomInt(rng, 0, 59) * 1000;

    let name = renderName(rng, person);
    let email = renderEmail(rng, person);
    let phone = renderPhone(rng, person);
    let updatedAt = renderDate(rng, timestampMs);
    let rowId = id;
    let regionCell = String(region);

    const fieldDefect = drawFieldDefect(rng);

    switch (fieldDefect) {
        case 'email': email = pick(rng, INVALID_EMAILS); break;
        case 'phone': phone = pick(rng, INVALID_PHONES); break;
        case 'date': updatedAt = pick(rng, INVALID_DATES); break;
        case 'missing':
            // Blank exactly one of the fields the importer treats as required.
            switch (randomInt(rng, 0, 2)) {
                case 0: rowId = ''; break;
                case 1: name = '   '; break;
                default: regionCell = ''; break;
            }
            break;
        default: break;
    }

    const cells = [rowId, name, email, phone, updatedAt, regionCell];

    if (malformedKind === 'missing-column') {
        // A regional system that simply never emitted the phone column.
        cells.splice(3, 1);
    } else if (malformedKind === 'extra-column') {
        // An unescaped comma inside the name, the classic CSV export bug.
        cells[1] = `${person.lastName}, ${person.firstName}`;
    }

    return cells.join(',');
}

/**
 * Generate all regional exports for a seed.
 *
 * @param {{ seed: string | number, regionCount?: number, rowsPerRegion?: number, duplicateRate?: number }} options
 * @returns {{ files: { region: number, key: string, csv: string, rowCount: number,
 *                      malformedRows: number, malformedRate: number }[],
 *             duplicateRows: number, totalRows: number, people: number }}
 */
export function generateExports({
    seed,
    regionCount = DEFAULT_REGION_COUNT,
    rowsPerRegion = DEFAULT_ROWS_PER_REGION,
    duplicateRate = DEFAULT_DUPLICATE_RATE,
} = {}) {
    const rng = createRng(seed);
    const duplicatesPerRegion = Math.round(rowsPerRegion * duplicateRate);
    const uniquePerRegion = rowsPerRegion - duplicatesPerRegion;

    if (uniquePerRegion <= 0) throw new Error('duplicateRate must leave room for unique contacts');
    if (regionCount < 2) throw new Error('cross-region duplicates need at least two regions');

    const people = createPeople(rng, { regionCount, uniquePerRegion });
    const slotsByRegion = assignRowSlots(rng, people, { regionCount, duplicatesPerRegion });

    const files = [];

    for (let region = 1; region <= regionCount; region++) {
        const slots = slotsByRegion.get(region);
        const malformedRows = malformedCountFor(rng, region, rowsPerRegion);

        // Pick exactly `malformedRows` distinct row positions, so the resulting rate
        // is an exact property of the seed rather than the outcome of per-row coin flips.
        const positions = shuffle(rng, [...slots.keys()]).slice(0, malformedRows);
        const malformedKinds = new Map(positions.map((position) => [position, rng() < 0.5 ? 'missing-column' : 'extra-column']));

        const lines = [CSV_COLUMNS.join(',')];

        for (const [position, slot] of slots.entries()) {
            const id = `R${region}-${String(position + 1).padStart(5, '0')}`;
            lines.push(renderRow(rng, slot, { region, id, malformedKind: malformedKinds.get(position) ?? null }));
        }

        files.push({
            region,
            key: `region-${region}.csv`,
            csv: `${lines.join('\n')}\n`,
            rowCount: slots.length,
            malformedRows,
            malformedRate: malformedRows / slots.length,
        });
    }

    return {
        files,
        duplicateRows: duplicatesPerRegion * regionCount,
        totalRows: rowsPerRegion * regionCount,
        people: people.length,
    };
}
