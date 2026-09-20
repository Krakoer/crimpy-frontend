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

// How far a ground reaches. A tinted card and the label inside it are within a
// couple of dozen lines of each other in every component of this repo, and
// widening the window past that starts reporting siblings rather than children,
// which is worse than missing one: a guard nobody believes gets switched off.
//
// The pass over whole style attributes below has no such limit, so this window
// only decides how far a ground reaches into the elements nested after it.
//
// Three shapes the scan therefore cannot see, named here so a reader does not
// take its silence for proof:
//
//   - a ground and a colour in different elements further apart than this,
//     which is the week grid cell whose empty-state hint sits eighty lines
//     below its ground;
//   - a ground handed to a child component through a prop;
//   - a colour dimmed by an `opacity` on an inner element, which composites to
//     something lighter than the token it names. That one is why no badge in
//     this repo carries an opacity on its own glyphs any more.
//
// Two more were found and closed rather than lived with, and are recorded
// because how they were closed differs:
//
//   - a ground written as a raw hex rather than as a token. Closed by removal,
//     not by detection: there are no raw hex backgrounds in `src/` any more. If
//     one comes back this scan will not see it, and the rule about hardcoded
//     colours is what has to catch it.
//   - a colour written as a quoted attribute value, `color="var(--gd)"` on an
//     `<Icon>`. Closed by detection: COLOUR_VALUE reads it now.
//
// This list is what is known, not what exists. Every entry on it was found by
// a reader rather than by this scan, which is the honest summary of how much
// the scan is worth on its own.
const GROUND_REACH = 24;

function scopeFrom(lines: string[], start: number): number[] {
	const last = Math.min(lines.length, start + GROUND_REACH);
	return Array.from({ length: last - start }, (_, offset) => start + offset);
}

// `.ts` as well as `.svelte`: `auth-styles.ts` builds grounds and colours in a
// table and hands them over as a `style` attribute, so a defect written there
// never appears in any component's own markup.
function sourceFiles(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...sourceFiles(path));
		else if (entry.name.endsWith('.svelte')) found.push(path);
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(path);
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

// A colour, however it is spelled: a `color:` declaration, a `color={expr}`
// prop, or a `color="var(--x)"` prop. The last one used to fall out of the
// scan, because a class that stops at the first quote matches only `color=`,
// and that is how a gold icon sat on a gold fog ground for three rounds.
const COLOUR_VALUE = /(?<!-)\bcolor[:=]\s*(?:"[^"]*"|\{[^}]*\}|[^;"]*)/g;

function namesToken(text: string, token: string): boolean {
	return new RegExp(`var\\(--${token}\\)`).test(text);
}

// A `background` naming a light ground of one hue, with a `color` naming that
// hue's mark form close enough after it to be sitting on it.
function offencesIn(file: string): Offence[] {
	const lines = readFileSync(file, 'utf8').split('\n');
	const offences: Offence[] = [];

	// A ground and a colour written in the same style attribute, in either
	// order. The line window below only looks forward, and several pills in this
	// repo declare their colour above their background.
	const source = lines.join('\n');
	for (const match of source.matchAll(/style="[^"]*"/gs)) {
		const attribute = match[0];
		// The position of this attribute, not of the first one that looks like it:
		// two byte-identical style attributes in one file would otherwise both
		// report the line of the earlier one.
		const at = source.slice(0, match.index).split('\n').length;
		// Matched on the whole attribute rather than line by line, because
		// Prettier wraps a long conditional across lines and a line-at-a-time
		// match never sees the token on the continuation.
		const grounds = (attribute.match(/background(?:-color)?:[^;"]*/gs) ?? []).join(' ');
		const colours = (attribute.match(/(?<!-)\bcolor:\s*[^;"]*/gs) ?? []).join(' ');
		// `style="..."` cannot hold a nested quote, so the attribute pass keeps the
		// declaration form; the line pass below also has to read `color="var(--x)"`
		// on an `<Icon>`, which is what COLOUR_VALUE adds.
		if (!grounds || !colours) continue;
		for (const [hue, { grounds: tints, unreadable }] of Object.entries(HUES)) {
			const ground = tints.find((token) => namesToken(grounds, token));
			const mark = ground && unreadable.find((token) => namesToken(colours, token));
			if (ground && mark) {
				offences.push({
					file,
					groundLine: at,
					colourLine: at,
					hue,
					ground: `--${ground}`,
					colour: `--${mark}`
				});
			}
		}
	}

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const backgrounds = line.match(/background(?:-color)?:[^;"]*/g) ?? [];
		if (backgrounds.length === 0) continue;
		const declaration = backgrounds.join(' ');

		for (const [hue, { grounds, unreadable }] of Object.entries(HUES)) {
			const ground = grounds.find((token) => namesToken(declaration, token));
			if (!ground) continue;
			for (const ahead of scopeFrom(lines, index)) {
				const colours = (lines[ahead].match(COLOUR_VALUE) ?? []).join(' ');
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
		for (const ahead of scopeFrom(lines, index)) {
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

	const seen = new Set<string>();
	return offences.filter((offence) => {
		const key = `${offence.colourLine}:${offence.colour}:${offence.ground}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
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
