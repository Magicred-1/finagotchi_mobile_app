#!/usr/bin/env node
/**
 * Secret-exposure scanner for tracked files. No dependencies.
 *
 * Flags:
 *  (a) `process.env.X` references in src/** where X is NOT EXPO_PUBLIC_*
 *      (only EXPO_PUBLIC_* vars are inlined by Expo; anything else would be
 *      undefined at runtime and suggests a server-side secret leaked in),
 *  (b) `api-key=` / `api_key=` with a non-placeholder value inside URL-ish
 *      string literals in any tracked file,
 *  (c) common key formats (sk-..., PEM private-key headers, `Bearer eyJ...`
 *      JWTs) in tracked files, excluding .env.example, Markdown docs, and
 *      this script itself,
 *  (d) a tracked `.env` file (it should be gitignored).
 *
 * Exits 1 with a readable report when anything is found, 0 when clean.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PLACEHOLDER_RE =
    /^(your[_-]?(api[_-]?)?key|<[^>]*>|x{3,}|placeholder|changeme|\*{3,})$/i;
const DOC_RE = /\.(md|mdx|rst|txt)$/i;
const SELF = 'scripts/check-secrets.mjs';
const MAX_FILE_BYTES = 1024 * 1024;

/** @type {{ file: string, line: number, rule: string, text: string }[]} */
const findings = [];

function flag(file, line, rule, text) {
    findings.push({ file, line, rule, text: text.trim().slice(0, 200) });
}

function isBinary(buffer) {
    const n = Math.min(buffer.length, 8000);
    for (let i = 0; i < n; i++) {
        if (buffer[i] === 0) return true;
    }
    return false;
}

function trackedFiles() {
    const out = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 64 * 1024 * 1024 });
    return out.toString('utf8').split('\0').filter(Boolean);
}

function scanFile(file) {
    let buffer;
    try {
        buffer = readFileSync(file);
    } catch {
        return; // Deleted between ls-files and read — nothing to scan.
    }
    if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES || isBinary(buffer)) return;
    const text = buffer.toString('utf8');
    const lines = text.split('\n');

    // (a) Non-EXPO_PUBLIC_* env references inside src/**.
    if (file.startsWith('src/')) {
        for (let i = 0; i < lines.length; i++) {
            const re = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[['"]([^'"]+)['"]\]/g;
            let m;
            while ((m = re.exec(lines[i])) !== null) {
                const name = m[1] ?? m[2];
                if (!name.startsWith('EXPO_PUBLIC_')) {
                    flag(file, i + 1, `non-EXPO_PUBLIC env var (${name}) in src/`, lines[i]);
                }
            }
        }
    }

    // (b) api-key= / api_key= with a real value inside a string literal.
    for (let i = 0; i < lines.length; i++) {
        const re = /api[-_]key=([^\s"'&)\]]*)/gi;
        let m;
        while ((m = re.exec(lines[i])) !== null) {
            const value = m[1];
            if (value === '' || PLACEHOLDER_RE.test(value)) continue;
            flag(file, i + 1, 'API key embedded in URL literal', lines[i]);
        }
    }

    // (c) Common key formats — docs, the example env file, and this scanner
    // legitimately mention these patterns.
    if (file !== '.env.example' && file !== SELF && !DOC_RE.test(file)) {
        const patterns = [
            { re: /sk-[A-Za-z0-9_-]{16,}/, rule: 'sk- style API key' },
            { re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, rule: 'PEM private key block' },
            { re: /Bearer eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, rule: 'hardcoded Bearer JWT' },
        ];
        for (let i = 0; i < lines.length; i++) {
            for (const { re, rule } of patterns) {
                if (re.test(lines[i])) {
                    flag(file, i + 1, rule, lines[i]);
                }
            }
        }
    }
}

const files = trackedFiles();

// (d) A tracked .env file should not exist (it must be gitignored).
for (const file of files) {
    if (/(^|\/)\.env$/.test(file)) {
        flag(file, 1, 'tracked .env file (should be gitignored)', file);
    }
}

for (const file of files) {
    scanFile(file);
}

if (findings.length === 0) {
    console.log(`check-secrets: clean — ${files.length} tracked files scanned, no findings.`);
    process.exit(0);
}

console.error(`check-secrets: ${findings.length} potential exposure(s) found:\n`);
for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    rule: ${f.rule}`);
    console.error(`    > ${f.text}`);
}
console.error('\nRotate any real keys above and remove them from tracked files.');
process.exit(1);
