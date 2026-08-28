/**
 * Shared CRM parsing / normalization contract.
 *
 * This module is the single source of truth for
 *   - how a raw CSV export row becomes a normalized contact,
 *   - which quarantine reason a bad row gets,
 *   - how normalized contacts are deduplicated,
 *   - how a reconciliation report is rolled up.
 *
 * Actors are deployed independently on the Apify platform, so they cannot
 * share a workspace package. Instead every Actor that needs this contract
 * ships a byte-identical copy at `src/lib/crm-lib.js`, produced by
 * `scripts/sync-shared.mjs`. `scripts/sync-shared.mjs --check` fails if a copy
 * has drifted, which is what keeps the simulator's ground truth and the
 * importer's behaviour from diverging.
 *
 * Do not edit the copies. Edit this file and re-run the sync script.
 */

/** Column layout of a well-formed export row. */
export const CSV_COLUMNS = Object.freeze(['id', 'name', 'email', 'phone', 'updatedAt', 'region']);

/** Every reason a row can be quarantined for. */
export const QUARANTINE_REASONS = Object.freeze({
    MALFORMED_ROW: 'malformed-row',
    MISSING_REQUIRED_FIELD: 'missing-required-field',
    INVALID_EMAIL: 'invalid-email',
    INVALID_PHONE: 'invalid-phone',
    INVALID_DATE: 'invalid-date',
});

/** Sorted list of all reasons, so report key sets are stable regardless of what a run happened to hit. */
export const ALL_QUARANTINE_REASONS = Object.freeze([...Object.values(QUARANTINE_REASONS)].sort());

/** A region whose malformed-row rate exceeds this trips the importer's circuit breaker. */
export const CIRCUIT_BREAKER_MALFORMED_RATE = 0.05;

/** Default country calling code applied to bare 9-digit national numbers. */
export const DEFAULT_COUNTRY_CODE = '420';

/**
 * Split a single CSV line into cells. Handles RFC4180 double-quoting even
 * though the simulator only emits unquoted values.
 *
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (inQuotes) {
            if (char !== '"') {
                current += char;
            } else if (line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = false;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            cells.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    cells.push(current);
    return cells;
}

/**
 * Parse a CSV export.
 *
 * `rowNumber` is the 1-based physical line number in the file, so the header
 * is line 1 and the first data row is line 2. That is what a human sees when
 * they open the CSV to check a quarantined row.
 *
 * @param {string} text
 * @returns {{ header: string[], rows: { rowNumber: number, raw: string, cells: string[] }[] }}
 */
export function parseCsv(text) {
    const lines = String(text ?? '')
        .replace(/^﻿/, '')
        .split(/\r?\n/);

    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length === 0) return { header: [], rows: [] };

    const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        rows.push({ rowNumber: i + 1, raw: lines[i], cells: splitCsvLine(lines[i]) });
    }

    return { header, rows };
}

/**
 * Lowercase + trim an email and reject anything that is not plausibly one.
 *
 * @param {string} raw
 * @returns {string | null} normalized email, or null when invalid
 */
export function normalizeEmail(raw) {
    const value = String(raw ?? '').trim().toLowerCase();
    if (value === '') return null;
    if (!/^[^\s@,]+@[^\s@,.]+(\.[^\s@,.]+)+$/.test(value)) return null;
    return value;
}

/**
 * Reduce a phone number to `+` followed by digits.
 *
 * The +420 rule, in order:
 *   1. a leading `+` means the number already carries a country code - keep it,
 *   2. a leading `00` is the international prefix - replace it with `+`,
 *   3. exactly 9 digits is a bare national number - prefix `+420`,
 *   4. anything else is kept as-is and only length-checked (e.g. `420777123456`).
 *
 * @param {string} raw
 * @returns {string | null} E.164-ish number, or null when invalid
 */
export function normalizePhone(raw) {
    const value = String(raw ?? '').trim();
    if (value === '') return null;

    const explicitCountryCode = value.startsWith('+');
    let digits = value.replace(/\D/g, '');
    if (digits === '') return null;

    if (!explicitCountryCode) {
        if (digits.startsWith('00')) {
            digits = digits.slice(2);
        } else if (digits.length === 9) {
            digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
        }
    }

    if (digits.length < 9 || digits.length > 15) return null;
    return `+${digits}`;
}

/**
 * Build an ISO 8601 UTC timestamp, rejecting impossible calendar dates
 * (`31.02.2026`) that `Date.UTC` would silently roll over.
 *
 * @returns {string | null}
 */
function toIsoUtc(year, month, day, hours = 0, minutes = 0, seconds = 0, millis = 0) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;

    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, millis));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }

    return date.toISOString();
}

const DATE_PATTERNS = [
    // 2026-03-14T09:15:00Z / 2026-03-14T09:15:00.123Z / 2026-03-14T09:15:00+02:00
    {
        regex: /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+-]\d{2}:?\d{2})$/,
        build: (m) => {
            const iso = toIsoUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0), +((m[7] ?? '0').padEnd(3, '0')));
            if (iso === null) return null;
            if (m[8] === 'Z') return iso;
            const sign = m[8][0] === '-' ? 1 : -1;
            const offsetDigits = m[8].slice(1).replace(':', '');
            const offsetMinutes = sign * (Number(offsetDigits.slice(0, 2)) * 60 + Number(offsetDigits.slice(2)));
            return new Date(Date.parse(iso) + offsetMinutes * 60_000).toISOString();
        },
    },
    // 2026-03-14 09:15:00 (no zone - read as UTC)
    {
        regex: /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
        build: (m) => toIsoUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)),
    },
    // 2026-03-14 and 2026/03/14
    {
        regex: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
        build: (m) => toIsoUtc(+m[1], +m[2], +m[3]),
    },
    // 14/03/2026 and 14/03/2026 09:15
    {
        regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
        build: (m) => toIsoUtc(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)),
    },
    // 14.3.2026 and 14. 3. 2026 (Czech long form)
    {
        regex: /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/,
        build: (m) => toIsoUtc(+m[3], +m[2], +m[1]),
    },
    // epoch seconds / epoch milliseconds
    {
        regex: /^(\d{10}|\d{13})$/,
        build: (m) => {
            const millis = m[1].length === 10 ? Number(m[1]) * 1000 : Number(m[1]);
            if (!Number.isFinite(millis)) return null;
            return new Date(millis).toISOString();
        },
    },
];

/**
 * Normalize any of the supported export date formats to ISO 8601 UTC.
 *
 * Deliberately does NOT fall back to `new Date(string)`: that parser is
 * locale- and engine-dependent and would happily accept ambiguous garbage.
 *
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeDate(raw) {
    const value = String(raw ?? '').trim();
    if (value === '') return null;

    for (const { regex, build } of DATE_PATTERNS) {
        const match = regex.exec(value);
        if (match === null) continue;
        try {
            return build(match);
        } catch {
            return null;
        }
    }

    return null;
}

/**
 * Turn one parsed CSV row into a normalized contact, or say why it cannot be.
 *
 * Check order matters: it decides which reason a row with several defects is
 * filed under, and both the simulator's ground truth and the importer depend
 * on that order being identical.
 *
 * @param {{ rowNumber: number, raw: string, cells: string[] }} row
 * @returns {{ ok: true, contact: object } | { ok: false, reason: string }}
 */
export function normalizeRow(row) {
    const cells = row.cells ?? [];

    if (cells.length !== CSV_COLUMNS.length) {
        return { ok: false, reason: QUARANTINE_REASONS.MALFORMED_ROW };
    }

    const [rawId, rawName, rawEmail, rawPhone, rawUpdatedAt, rawRegion] = cells;

    const id = rawId.trim();
    const name = rawName.trim().replace(/\s+/g, ' ');
    const region = Number(rawRegion.trim());

    if (id === '' || name === '' || !Number.isInteger(region) || region <= 0) {
        return { ok: false, reason: QUARANTINE_REASONS.MISSING_REQUIRED_FIELD };
    }

    const email = normalizeEmail(rawEmail);
    if (email === null) return { ok: false, reason: QUARANTINE_REASONS.INVALID_EMAIL };

    const phone = normalizePhone(rawPhone);
    if (phone === null) return { ok: false, reason: QUARANTINE_REASONS.INVALID_PHONE };

    const updatedAt = normalizeDate(rawUpdatedAt);
    if (updatedAt === null) return { ok: false, reason: QUARANTINE_REASONS.INVALID_DATE };

    return { ok: true, contact: { id, name, email, phone, updatedAt, region } };
}

/**
 * Parse and normalize a whole regional export.
 *
 * @param {string} csvText
 * @param {number} region
 * @returns {{ totalRows: number, malformedRows: number, malformedRate: number,
 *             contacts: object[], quarantined: { region: number, rowNumber: number, reason: string, raw: string }[] }}
 */
export function normalizeExport(csvText, region) {
    const { rows } = parseCsv(csvText);
    const contacts = [];
    const quarantined = [];
    let malformedRows = 0;

    for (const row of rows) {
        const result = normalizeRow(row);

        if (result.ok) {
            contacts.push(result.contact);
            continue;
        }

        if (result.reason === QUARANTINE_REASONS.MALFORMED_ROW) malformedRows++;
        quarantined.push({ region, rowNumber: row.rowNumber, reason: result.reason, raw: row.raw });
    }

    return {
        totalRows: rows.length,
        malformedRows,
        malformedRate: rows.length === 0 ? 0 : malformedRows / rows.length,
        contacts,
        quarantined,
    };
}

/**
 * True when `candidate` should win a dedup contest against `incumbent`.
 *
 * Later `updatedAt` wins. Equal timestamps fall back to the lower contact id
 * so the outcome does not depend on the order rows happen to arrive in - the
 * importers run concurrently, so dataset order is not deterministic.
 */
function winsDedup(candidate, incumbent) {
    if (candidate.updatedAt !== incumbent.updatedAt) return candidate.updatedAt > incumbent.updatedAt;
    return String(candidate.id) < String(incumbent.id);
}

/**
 * Deduplicate contacts by normalized email, keeping the latest `updatedAt`.
 *
 * @param {object[]} contacts
 * @returns {{ master: object[], duplicatesMerged: number }} master is sorted by email
 */
export function deduplicateContacts(contacts) {
    const byEmail = new Map();

    for (const contact of contacts) {
        const incumbent = byEmail.get(contact.email);
        if (incumbent === undefined || winsDedup(contact, incumbent)) byEmail.set(contact.email, contact);
    }

    const master = [...byEmail.values()].sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
    return { master, duplicatesMerged: contacts.length - master.length };
}

/**
 * Count quarantine records by reason, always emitting every known reason so
 * that two reports are comparable key by key.
 *
 * @param {{ reason: string }[]} quarantined
 * @returns {Record<string, number>}
 */
export function summarizeQuarantine(quarantined) {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const reason of ALL_QUARANTINE_REASONS) counts[reason] = 0;

    for (const record of quarantined) {
        counts[record.reason] = (counts[record.reason] ?? 0) + 1;
    }

    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Roll contacts + quarantine records up into the reconciliation report shape.
 *
 * The simulator runs this over everything it generated (ground truth) and the
 * reporter runs it over what actually landed in the datasets. A correct
 * pipeline makes the two identical.
 *
 * @param {{ contacts: object[], quarantined: { reason: string }[] }} input
 * @returns {{ totalRows: number, imported: number, quarantinedByReason: Record<string, number>,
 *             duplicatesMerged: number, uniqueContacts: number, master: object[] }}
 */
export function buildReport({ contacts, quarantined }) {
    const { master, duplicatesMerged } = deduplicateContacts(contacts);

    return {
        totalRows: contacts.length + quarantined.length,
        imported: contacts.length,
        quarantinedByReason: summarizeQuarantine(quarantined),
        duplicatesMerged,
        uniqueContacts: master.length,
        master,
    };
}

/** Fields of the report that the supervisor reconciles field by field. */
export const RECONCILED_FIELDS = Object.freeze([
    'totalRows',
    'imported',
    'quarantinedByReason',
    'duplicatesMerged',
    'uniqueContacts',
]);
