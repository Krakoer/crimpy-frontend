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
//     something lighter than the token it names. No badge or hint in this repo
//     carries an opacity over an accent token any more, which is why the shape
//     is listed as unseen rather than as present.
//
// Four more were found and closed rather than lived with, and are recorded
// because how they were closed differs:
//
//   - a ground written as a raw hex rather than as a token. Dormant, not
//     closed. Every raw hex ground that was a light tint of an accent is gone
//     and no survivor is one today, but `src/` still holds around 180 raw hex
//     backgrounds, nearly all `#fff`. A new `#f5e2d7` would be invisible here,
//     and the rule about hardcoded colours is what has to catch it.
//   - a colour written as a quoted attribute value, `color="var(--gd)"` on an
//     `<Icon>`. Closed by detection: COLOUR_VALUE reads it now.
//   - a ground handed over by a helper, `style={authBadge('gold')}`. Closed by
//     detection: AUTH_HELPER_STYLES resolves the call to the literal it returns
//     before anything is scanned.
//   - a tint built by appending a hex alpha pair to a colour that is a token
//     rather than a hex literal, `background: {s.color}18`. It is not a colour
//     at all, so the browser drops the declaration and the surface renders with
//     no tint, or with nothing at all when the token sits inside a `border`
//     shorthand. Closed by detection: CONCATENATED_ALPHA below, which is a
//     check of its own rather than part of the ground-and-colour sweep, since
//     the defect is a colour that never arrives rather than two that clash.
//     It reads the whole file rather than a line at a time, and TOKEN_ALPHA and
//     APPENDED_ALPHA beside it cover the same defect with no property in front
//     of it and the `tint + '30'` helper form. What it still cannot see is an
//     alpha pair held in a variable, `{color}{alpha}`, one handed to a child
//     through a prop, and a declaration built as an object literal value in a
//     `.ts` file, `{ border: `1px solid ${color}30` }`, where the backtick that
//     bounds the value segment sits between the property and the pair. The
//     template literal body form, `` `background: ${tint}18;` ``, is seen.
//     See Krakoer/crimpy#129.
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

// `auth-styles.ts` hands a whole style attribute over as a helper call, so the
// ground of an auth badge never appears in the markup that carries the colour on
// it. The gold badge glyph read 2.19:1 for three rounds, and putting that defect
// back left this scan green, because `style={authBadge('gold')}` is not a
// background declaration to anything reading the file. Resolving each call to the
// string it returns is what makes the pairing visible at all.
const AUTH_STYLES_SOURCE = fileURLToPath(new URL('./components/auth-styles.ts', import.meta.url));

function authHelperStyles(): Record<string, string> {
	const source = readFileSync(AUTH_STYLES_SOURCE, 'utf8');
	const resolved: Record<string, string> = {};
	for (const [helper, table] of [
		['authBadge', 'badgeTones'],
		['authBanner', 'bannerTones']
	]) {
		const block = new RegExp(`const ${table} = \\{([^}]*)\\}`).exec(source);
		if (!block) throw new Error(`${table} is no longer a literal table in auth-styles.ts`);
		for (const [, tone, declarations] of block[1].matchAll(/(\w+):\s*'([^']*)'/g)) {
			resolved[`style={${helper}('${tone}')}`] = `style="${declarations}"`;
		}
	}
	return resolved;
}

const AUTH_HELPER_STYLES = authHelperStyles();

function readResolved(file: string): string {
	return Object.entries(AUTH_HELPER_STYLES).reduce(
		(text, [call, literal]) => text.split(call).join(literal),
		readFileSync(file, 'utf8')
	);
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
	const lines = readResolved(file).split('\n');
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

	it('resolves every auth style helper tone, since a ground can hide behind one', () => {
		expect(Object.keys(AUTH_HELPER_STYLES).sort()).toEqual([
			"style={authBadge('error')}",
			"style={authBadge('gold')}",
			"style={authBadge('primary')}",
			"style={authBadge('success')}",
			"style={authBanner('error')}",
			"style={authBanner('notice')}",
			"style={authBanner('success')}"
		]);
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

// A colour token with two hex digits welded onto it. `var(--pr)18` and
// `{s.color}18` are both a string that is not a colour: the browser parses the
// declaration, fails, and drops it, so the surface renders with no tint. Inside
// a `border` shorthand it takes the whole shorthand down with it and the
// element gets no border either, which is how three session chips in the
// program week grid went their whole life with no edge. The trick only ever
// worked while the palette was hex literals, and it has been `var()` tokens for
// longer than these lines existed.
//
// Spelled with the colon so `border` cannot match `border-radius`, and with the
// property required so a `{count}12` in prose is not read as one. The trailing
// guard keeps `{gap}10px` out.
//
// Matched over the whole file rather than line by line. Every style attribute
// on the program page is already wrapped across a dozen lines by Prettier, so a
// `border: 1px solid` whose `{color}30` sits on the next line is the same
// defect, and a line-at-a-time scan never sees it. The value segment therefore
// allows newlines and is bounded by the things that really end a declaration, a
// `;` or the attribute's own quote, plus a length cap so a stray `color:` in a
// comment cannot reach across half a file to find a hex pair.
const COLOUR_PROPERTY = [
	'background',
	'background-color',
	'border',
	'border-top',
	'border-right',
	'border-bottom',
	'border-left',
	'border-color',
	'outline',
	'outline-color',
	'color',
	'fill',
	'stroke',
	'box-shadow',
	'text-shadow',
	'column-rule',
	'caret-color',
	'accent-color',
	'text-decoration-color'
].join('|');

// `[:=]`, not just `:`. A Svelte style directive spells the same declaration
// `style:background="{color}18"`, with an `=` and an opening quote where a
// declaration has a colon, and this repo really does reach for directives:
// DroppableCell writes `style:outline=` and `style:background-color=`, DropZone
// writes `style:background=`. Consuming the opening quote is what lets the
// value segment, which cannot contain a quote, start after it.
const CONCATENATED_ALPHA = new RegExp(
	`(?<![\\w-])(?:${COLOUR_PROPERTY})\\s*[:=]\\s*["'\`]?[^;"\`]{0,200}?` +
		`(?:\\{[^{}]*\\}|var\\(--[\\w-]+\\))[0-9a-fA-F]{2}(?![\\w(-])`,
	'gs'
);

// The same defect with no property in front of it, which is how it would be
// written in a `.ts` helper that returns a colour. Unambiguous on its own: a
// `var()` reference is never followed by two hex digits in anything valid.
const TOKEN_ALPHA = /var\(--[\w-]+\)[0-9a-fA-F]{2}(?![\w(-])/g;

// The same defect spelled as string concatenation rather than interpolation,
// which is the form a `.ts` helper that returns a colour would reach for. Only
// identifiers that name a colour: a bare `n + '30'` is arithmetic somewhere
// else and none of this scan's business.
const APPENDED_ALPHA =
	/(?:var\(--[\w-]+\)['"`]|[\w.]*(?:olou?r|[Tt]int|[Aa]ccent|[Hh]ue|[Ss]hade))\s*\+\s*['"`][0-9a-fA-F]{2}['"`]/g;

interface Concatenation {
	file: string;
	line: number;
	text: string;
	// Where the hex pair ends, which is the one thing every pattern that can see
	// the same defect agrees on. `background: var(--pr)18` is matched by both
	// CONCATENATED_ALPHA and TOKEN_ALPHA, with different text, and without this
	// one defect would be reported as two lines.
	endsAt: number;
}

const ALPHA_PATTERNS = [CONCATENATED_ALPHA, TOKEN_ALPHA, APPENDED_ALPHA];

function concatenationsIn(file: string): Concatenation[] {
	const source = readFileSync(file, 'utf8');
	const found: Concatenation[] = [];
	for (const pattern of ALPHA_PATTERNS) {
		for (const match of source.matchAll(pattern)) {
			const endsAt = (match.index ?? 0) + match[0].length;
			found.push({
				file,
				// The line the hex pair sits on rather than the line the property
				// opened on, since the pair is what has to be deleted.
				line: source.slice(0, endsAt).split('\n').length,
				text: match[0].replace(/\s+/g, ' ').trim(),
				endsAt
			});
		}
	}
	// One entry per defect, keeping the fullest description of it.
	const byEnd = new Map<number, Concatenation>();
	for (const one of found) {
		const kept = byEnd.get(one.endsAt);
		if (!kept || kept.text.length < one.text.length) byEnd.set(one.endsAt, one);
	}
	return [...byEnd.values()].sort((a, b) => a.endsAt - b.endsAt);
}

describe('no surface builds a colour by concatenating a hex alpha pair onto a token', () => {
	// Written out so the scan is checked against the four shapes it exists for,
	// all of them live in `dev` when this was added. A guard that only ever
	// returns an empty list proves nothing about what it can see.
	const CAUGHT = [
		'background: {s.color}18;',
		'border: 1px solid {color}30;',
		'background: var(--pr)18;',
		'background-color: {info.tint}80',
		// Prettier wraps every long style attribute in this repo, so the property
		// and the hex pair routinely end up on different lines.
		'border: 1px solid\n\t\t\t\t{color}30;',
		// The helper form: built in a `.ts` file and handed to the markup whole.
		"const chipBorder = tint + '30';",
		// The style directive form, which is how DroppableCell and DropZone write
		// a conditional ground today.
		'<div style:background="{c}18"></div>',
		'style:border="1px solid {color}30"'
	];

	// Shapes that look like the defect and are not. A hex literal really can
	// carry an alpha pair, `border-radius` is not a colour, and a token with no
	// alpha after it is the correct spelling.
	const ALLOWED = [
		'background: #c2714f18;',
		'background: {s.tint};',
		'border: 1px solid var(--bd2);',
		'border-radius: {radius}10px;',
		'padding: {gap}12px;',
		'grid-template-columns: repeat(3, 1fr);',
		"const total = weekCount + '12';",
		// The value segment is capped, so a `color:` cannot reach across a file to
		// find a hex pair that has nothing to do with it.
		`color: var(--tx)\n${'x'.repeat(400)}\n{s.tint}18`,
		// Accepting `=` for the directive form must not make every colour prop a
		// candidate.
		'<Icon name="x" size={10} color="var(--tx3)" />',
		"style:background-color={isTarget ? 'var(--pr-fog)' : undefined}"
	];

	function hitsIn(shape: string): string[] {
		return ALPHA_PATTERNS.flatMap((pattern) => [...shape.matchAll(pattern)].map((hit) => hit[0]));
	}

	it('flags every shape it was written for', () => {
		for (const shape of CAUGHT) {
			expect(hitsIn(shape).length, `not detected: ${shape}`).toBeGreaterThan(0);
		}
	});

	it('leaves the shapes that are not the defect alone', () => {
		for (const shape of ALLOWED) {
			expect(hitsIn(shape), `false positive on: ${shape}`).toEqual([]);
		}
	});

	it('finds none in src', () => {
		const found = sourceFiles(SOURCE_ROOT).flatMap(concatenationsIn);
		const stated = found.map(
			(one) =>
				`${one.file.slice(SOURCE_ROOT.length)}:${one.line} builds a colour by concatenation: ${one.text}`
		);
		expect(
			stated,
			`a hex alpha pair appended to a colour token is not a colour, so the declaration is dropped:\n${stated.join('\n')}`
		).toEqual([]);
	});
});
