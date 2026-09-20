import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The companion of palette-contrast.test.ts. That one asks whether the tokens
// clear the floor; this one asks whether the surfaces use them. A pairing
// written across two elements, the ground on a header and the label on a child
// inside it, is invisible to a check that only reads the token table, and that
// is exactly where the first round of #119 left two headers at 2.05:1.

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Every hue, with the ground tokens that are a light form of it and the colours
// that are too pale to be read as text on one of them.
const HUES: Record<string, { grounds: string[]; unreadable: string[] }> = {
	terracotta: { grounds: ['pr-lt', 'pr-fog'], unreadable: ['pr', 'pr-dk'] },
	sage: { grounds: ['gn-lt', 'gn-fog'], unreadable: ['gn'] },
	gold: { grounds: ['gd-lt', 'gd-fog'], unreadable: ['gd'] },
	plum: { grounds: ['pl-lt', 'pl-fog'], unreadable: ['pl'] },
	red: { grounds: ['rd-lt'], unreadable: ['rd'] },
	blue: { grounds: ['bl-lt'], unreadable: ['bl'] }
};

// An accent carried through a variable rather than named. `tint` is the ground
// of the info records, `color` the mark form, `text` the readable form. A
// `color` reached inside a `tint` ground is the same defect spelled with
// property access.
const MARK_FIELDS = ['color'];

// How far a ground reaches. A tinted header and the label inside it are within
// a handful of lines of each other in every component of this repo; beyond
// that the ground has almost always closed.
const GROUND_REACH = 24;

function sourceFiles(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...sourceFiles(path));
		else if (entry.name.endsWith('.svelte')) found.push(path);
	}
	return found;
}

interface Offence {
	file: string;
	groundLine: number;
	colourLine: number;
	hue: string;
	ground: string;
	colour: string;
}

function namesToken(text: string, token: string): boolean {
	return new RegExp(`var\\(--${token}\\)`).test(text);
}

// A `background` naming a light ground of one hue, with a `color` naming that
// hue's mark form close enough after it to be sitting on it.
function offencesIn(file: string): Offence[] {
	const lines = readFileSync(file, 'utf8').split('\n');
	const offences: Offence[] = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const backgrounds = line.match(/background(?:-color)?:[^;"]*/g) ?? [];
		if (backgrounds.length === 0) continue;
		const declaration = backgrounds.join(' ');

		for (const [hue, { grounds, unreadable }] of Object.entries(HUES)) {
			const ground = grounds.find((token) => namesToken(declaration, token));
			if (!ground) continue;
			for (let ahead = index; ahead < Math.min(lines.length, index + GROUND_REACH); ahead++) {
				const colours = (lines[ahead].match(/(?<!-)\bcolor[:=]\s*[^;"]*/g) ?? []).join(' ');
				if (!colours) continue;
				const mark = unreadable.find((token) => namesToken(colours, token));
				if (mark) {
					offences.push({
						file,
						groundLine: index + 1,
						colourLine: ahead + 1,
						hue,
						ground: `--${ground}`,
						colour: `--${mark}`
					});
				}
			}
		}

		// The same pairing spelled through an info record: `background: {x.tint}`
		// with `{x.color}` inside it, where `x.text` is the readable form.
		const tintMatch = /background(?:-color)?:\s*\{([A-Za-z0-9_.?[\] ]*?)\.tint\}/.exec(declaration);
		if (!tintMatch) continue;
		for (let ahead = index; ahead < Math.min(lines.length, index + GROUND_REACH); ahead++) {
			for (const field of MARK_FIELDS) {
				const spelled = new RegExp(`\\bcolor[:=]\\s*\\{[^}]*\\.${field}\\}`);
				if (spelled.test(lines[ahead])) {
					offences.push({
						file,
						groundLine: index + 1,
						colourLine: ahead + 1,
						hue: 'accent record',
						ground: `${tintMatch[1]}.tint`,
						colour: `.${field}`
					});
				}
			}
		}
	}

	return offences;
}

describe('no surface writes a bare accent on a light ground of its own hue', () => {
	// Listed by hand so the scan is checked against a case it must catch. Both
	// were live at 2.05:1 for a climbing session when the sweep was first
	// written, and both were found by a reader rather than by the token table.
	const KNOWN_SHAPES = [
		'components/session/SessionDetailModal.svelte',
		'components/program/SessionOverridesModal.svelte'
	];

	const files = sourceFiles(SOURCE_ROOT);

	it('has sources to scan, including the ones this guard was written for', () => {
		expect(files.length).toBeGreaterThan(20);
		for (const shape of KNOWN_SHAPES) {
			expect(files.some((file) => file.endsWith(shape))).toBe(true);
		}
	});

	it('finds no accent written as text on its own tint or fog', () => {
		const offences = files.flatMap(offencesIn);
		const stated = offences.map(
			(offence) =>
				`${offence.file.slice(SOURCE_ROOT.length)}:${offence.colourLine} writes ${offence.colour} ` +
				`on the ${offence.ground} ground opened at line ${offence.groundLine}`
		);
		expect(stated, `accent as text on its own ground:\n${stated.join('\n')}`).toEqual([]);
	});
});
