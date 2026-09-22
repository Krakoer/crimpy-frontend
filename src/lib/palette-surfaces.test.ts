import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	MARK_CONTRAST_FLOOR,
	TEXT_CONTRAST_FLOOR,
	contrastRatio,
	isLargeText
} from '$lib/contrast';

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
//   - a ground built with `color-mix()`. It names its accent, so the ground scan
//     hands the pairing to the hue scan above, and that one knows only the
//     `-lt` and `-fog` ground tokens, so neither measures it. Four hangboard
//     rules sit in exactly that shape, `.hb-pill.hb-on` in HangboardItem and
//     HangboardRepItem and two in HangboardSessionMap, where `--hb` over a 12%
//     mix on the white card reads 3.97:1. That is an accent on a tint of its own
//     hue, which is Krakoer/crimpy#119's family rather than this ticket's, and
//     it is filed on Krakoer/crimpy#137 because clearing it wants a seventh text
//     token and a decision about mirroring one the app has no counterpart for.
//   - a colour dimmed by an `opacity`, which composites to something lighter
//     than the token it names. Live, not hypothetical: the "Group into X" button
//     of ItemList.svelte declares its colour and an `opacity` on the same
//     element, so a refused grouping composites the label and its white ground
//     together against the selection bar and reads 2.43:1. The composite family
//     is Krakoer/crimpy#137's, not this scan's, but it is present rather than
//     absent and saying otherwise is what stops the next reader checking.
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

// The third shape, and the one Krakoer/crimpy#128 was opened for: an accent
// written on a neutral ground rather than on a tint of its own hue. The two
// scans above only ever look at a hue against itself, so a gold icon on a white
// card at 2.32:1 was invisible to both.
//
// Two floors, not one. WCAG 1.4.3 holds text under 18.66px bold to 4.5:1 and
// exempts large text at 3:1, and 1.4.11 sets 3:1 on anything that is not text.
// The accents are the brand marks, and every one of them except gold clears
// 3:1 on white, so an icon or a 32px figure keeps its accent while small text
// moves to the darker form. Holding the whole family to 4.5:1 would repaint the
// portal, and a 3:1 element failed here is as wrong as a 4.5:1 one passed.

const PALETTE_SOURCE = fileURLToPath(new URL('../routes/layout.css', import.meta.url));

const NEUTRAL_GROUND_TOKENS = ['panel', 'panel2', 'bg'];

// Every accent that is a mark rather than a text colour. `--hb` is listed even
// though it clears 4.5:1 on white by itself, so that darkening it later is
// measured rather than assumed.
const NEUTRAL_ACCENTS = ['pr', 'pr-dk', 'gn', 'gd', 'pl', 'rd', 'bl', 'hb'];

// The three tables that name a colour per row, with the exported names a
// surface reaches each one through. A field access is measured against the
// table it really comes from: BLOCK_PRESENTATION holds no gold, so a block icon
// must not be failed for a gold that cannot reach it, and SESSION_ACTIVITIES
// does, so a session figure must be.
const COLOUR_TABLES: Record<string, string[]> = {
	'sessions.ts': ['SESSION_ACTIVITIES', 'sessionActivityInfo'],
	'trainingTypes.ts': ['TRAINING_TYPE_INFO', 'trainingTypeInfo'],
	'block-presentation.ts': ['BLOCK_PRESENTATION', 'STRUCTURE_BLOCKS']
};

function paletteTokens(): Record<string, string> {
	const css = readFileSync(PALETTE_SOURCE, 'utf8');
	const tokens: Record<string, string> = {};
	for (const [, name, hex] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
		tokens[name] = hex.toLowerCase();
	}
	return tokens;
}

// Field name to the tokens that field can hold, read out of the object literals
// of a source. `{ color: 'var(--gd)' }` in a shared table and the inline
// `{ k: 'Programs', c: 'var(--gd)' }` an each block loops over are the same
// shape, so one reader answers both.
function colourFields(source: string): Record<string, string[]> {
	const fields: Record<string, string[]> = {};
	for (const [, field, token] of source.matchAll(/(\w+):\s*'var\(--([\w-]+)\)'/g)) {
		const held = (fields[field] ??= []);
		if (!held.includes(token)) held.push(token);
	}
	return fields;
}

const TABLE_FIELDS: Record<string, Record<string, string[]>> = Object.fromEntries(
	Object.keys(COLOUR_TABLES).map((name) => [
		name,
		colourFields(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8'))
	])
);

const TABLE_BY_EXPORT: Record<string, string> = Object.fromEntries(
	Object.entries(COLOUR_TABLES).flatMap(([table, exports]) =>
		exports.map((exported) => [exported, table])
	)
);

// What each name in a file was last bound to, in the three shapes this repo
// binds a table row with: an each block, an inline const, and a script
// declaration. Enough to walk `btn` back to `allowedStructureButtons` and on to
// STRUCTURE_BLOCKS, which is the deepest chain in the tree.
function bindings(source: string): Record<string, string> {
	const bound: Record<string, string> = {};
	const remember = (name: string, expression: string) => {
		bound[name] ??= expression;
	};
	for (const [, name, expression] of source.matchAll(/\{@const\s+(\w+)\s*=\s*([^}]*)\}/g)) {
		remember(name, expression);
	}
	for (const [, expression, name] of source.matchAll(/\{#each\s+([\s\S]*?)\s+as\s+(\w+)/g)) {
		remember(name, expression);
	}
	for (const [, name, expression] of source.matchAll(
		/(?:const|let)\s+(\w+)\s*=\s*([\s\S]{0,240}?);/g
	)) {
		remember(name, expression);
	}
	return bound;
}

const BINDING_HOPS = 4;

function tableFor(identifier: string, bound: Record<string, string>): string | null {
	let expression = identifier;
	for (let hop = 0; hop < BINDING_HOPS; hop++) {
		for (const [exported, table] of Object.entries(TABLE_BY_EXPORT)) {
			if (new RegExp(`\\b${exported}\\b`).test(expression)) return table;
		}
		const next = [...expression.matchAll(/\b([A-Za-z_]\w*)\b/g)]
			.map((match) => match[1])
			.find((name) => bound[name] !== undefined && bound[name] !== expression);
		if (next === undefined) return null;
		expression = bound[next];
	}
	return null;
}

interface AccentUse {
	token: string;
	through: string;
}

// The accents a colour expression can resolve to: a literal `var(--x)`, both
// arms of a ternary, and a field access answered from the table the expression
// is rooted in, or from the file's own literals when it is rooted in none. An
// expression that resolves to nothing is a blind spot rather than a pass, and
// is listed with the other blind spots at the top of this file.
//
// Two of those blind spots live here rather than in the ground logic:
//
//   - a colour returned by a function, `toneColor(band.tone)`. Nothing is
//     resolved, and nothing is a pass. Three live defects hid behind this shape
//     through the whole of #128's first pass: the training load panel, and both
//     helpers of AssessmentComparison. The answer is not to resolve calls, which
//     would mean following `toneColor` into another module, but to name each
//     such helper as a pairing in palette-contrast.test.ts. `toneTextColor`,
//     `toneMarkColor`, `progressionColor`, `missingRatioColor` and
//     `denominatorNoteColor` are all measured there for that reason.
//   - the file-local fallback puts every `field: 'var(--x)'` literal in a file
//     into one namespace. Two record shapes in one file that both carry a
//     `color` would be merged, and a `.color` rooted in the safe one measured
//     against the union. It is the defect COLOUR_TABLES exists to prevent,
//     which the fallback does not get, and it errs towards reporting rather
//     than towards silence.
function accentsIn(
	expression: string,
	bound: Record<string, string>,
	local: Record<string, string[]>
): AccentUse[] {
	// The property is dropped before the root identifier is read, and a Svelte
	// style directive carries two separators rather than one: `style:color=`. A
	// strip that stopped at the first of them left `color` as the root, so the
	// binding walk looked up the CSS property and every field access written
	// through a directive resolved to nothing.
	// Only a real property prefix is stripped: an identifier followed by a colon,
	// or one followed immediately by an `=`. Allowing whitespace before the `=`
	// ate the first identifier of `a === b ? x.color : y.text`, which is handed
	// here raw from an Icon prop and carries no property at all, and rooted the
	// binding walk on `b`.
	const value = expression.replace(/^\s*(?:style:)?[a-zA-Z-]+(?:\s*:|=)\s*/, '');
	const found: AccentUse[] = [];
	for (const [, token] of value.matchAll(/var\(--([\w-]+)\)/g)) {
		if (NEUTRAL_ACCENTS.includes(token)) found.push({ token, through: `var(--${token})` });
	}
	const root = /\b([A-Za-z_]\w*)/.exec(value)?.[1];
	const table = root === undefined ? null : tableFor(root, bound);
	const fields = table === null ? local : TABLE_FIELDS[table];
	for (const [, field] of value.matchAll(/\.(\w+)\b/g)) {
		for (const token of fields[field] ?? []) {
			if (NEUTRAL_ACCENTS.includes(token)) found.push({ token, through: `.${field}` });
		}
	}
	return found;
}

// A gradient is not a flat ground and cannot be measured as one, so the search
// walks past it rather than reading it as either a tint or a neutral. The gold
// icon on the settings page sits under a two-stop rule naming `var(--gd)`, and
// taking that rule for the ground is what hid it.
function isFlatGround(declaration: string): boolean {
	return !/gradient\(/.test(declaration);
}

function namesTintedGround(declaration: string): boolean {
	return (
		/var\(--[\w-]+-(?:lt|fog)\)/.test(declaration) ||
		/\.tint\b/.test(declaration) ||
		NEUTRAL_ACCENTS.some((token) => namesToken(declaration, token))
	);
}

function neutralIn(declaration: string): string | null {
	const named = NEUTRAL_GROUND_TOKENS.find((token) => namesToken(declaration, token));
	if (named) return named;
	return /#fff\b|#ffffff\b/i.test(declaration) ? 'panel' : null;
}

// Which neutral a colour is painted on, or null when the pairing belongs to the
// scan above instead. Only a tinted ground declared on the element itself hands
// it over. A tinted ground further up is ignored rather than believed, because
// at that distance it is as likely to be a sibling as a parent, and reading a
// chip's tint as the ground of the label beside it is what kept two ASSESSMENT
// labels on white unmeasured through the whole of #119.
//
// Everything else is taken to sit on a neutral, and the nearest flat neutral
// opened above it decides which. Assuming a neutral where the real ground is a
// tint understates rather than overstates: a tint is darker, so the pairing
// really reads worse than reported, and the scan errs towards silence rather
// than towards a false alarm. `--hb` is the one token where that can flip a
// verdict, at 4.61 on --panel against 4.04 on --bg.
function groundFor(lines: string[], at: number, ownDeclarations: string): string | null {
	if (isFlatGround(ownDeclarations)) {
		if (namesTintedGround(ownDeclarations)) return null;
		const own = neutralIn(ownDeclarations);
		if (own) return own;
	}
	for (let back = at; back >= Math.max(0, at - GROUND_REACH); back--) {
		const declarations = (lines[back].match(/background(?:-color)?:[^;"]*/g) ?? []).join(' ');
		if (!declarations || !isFlatGround(declarations)) continue;
		const neutral = neutralIn(declarations);
		if (neutral) return neutral;
	}
	return 'panel';
}

interface NeutralOffence {
	file: string;
	line: number;
	kind: string;
	ground: string;
	through: string;
	token: string;
	ratio: number;
	floor: number;
}

// A style attribute, a Svelte style directive, and the `color` and `fill` props
// of an Icon. The Icon pass is what makes the two floors separable at all: a
// stroke icon is not text whatever font-size the button around it declares,
// and the favourite star sits in a button that declares one.
const STYLE_ATTRIBUTE = /style="[^"]*"/gs;

// The same declarations built as a string rather than written as an attribute:
// the tab button of the landing page returns a template literal, and
// auth-styles.ts holds whole style strings in single quotes. Neither is a
// `style="..."` to anything reading the file, and a colour written in one is
// painted exactly the same.
const STYLE_STRING = /`[^`]*`|'[^'\n]*'/gs;
const STYLE_DIRECTIVE = /style:(?:color|fill|stroke)=(?:"[^"]*"|\{[^}]*\})/g;
const ICON_TAG = /<Icon\b[^>]*>/gs;

// A colour handed to a child component by name. Every such prop in this repo
// paints type, `labelColor` on LatestValue and `accent` on SessionRepsCard, so
// one is measured against the text floor at the call site, where the ground is
// readable even though the painting is not. A child that painted a mark with
// one would be failed wrongly, which is the price of seeing the shape at all;
// today there is no such child. A prop that names a ground or a stroke rather
// than a foreground is excluded by name, since `backgroundColor` is the likelier
// next prop and holding a ground to the text floor would be the same mistake in
// the other direction. `<Icon>` is excluded because its own pass reads it, and
// reads it as the mark it is.
const COMPONENT_TAG = /<(?!Icon\b)[A-Z]\w*\b[^>]*>/gs;
const PROP_COLOUR =
	/\b(?:accent|(?!background|bg|tint|fill|stroke|border|surface)[a-z]\w*Color)=(?:"([^"]*)"|\{([^}]*)\})/g;

// A `<style>` block, which is plain CSS and carries none of the shapes above.
// The hangboard components write three labels there. Split on the closing brace
// so a rule's own font-size decides its floor rather than a neighbour's.
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g;
const ICON_COLOUR = /\b(?:color|fill)=(?:"([^"]*)"|\{([^}]*)\})/g;
const DECLARED_COLOUR = /(?<!-)\bcolor:\s*[^;"]*/gs;

function lineAt(source: string, index: number): number {
	return source.slice(0, index).split('\n').length;
}

function neutralOffencesIn(file: string, tokens: Record<string, string>): NeutralOffence[] {
	const source = readResolved(file);
	const lines = source.split('\n');
	const bound = bindings(source);
	const local = colourFields(source);
	const offences: NeutralOffence[] = [];

	function record(at: number, expression: string, kind: string, own: string): void {
		const floor = kind === 'text' ? TEXT_CONTRAST_FLOOR : MARK_CONTRAST_FLOOR;
		const ground = groundFor(lines, at - 1, own);
		if (ground === null) return;
		for (const { token, through } of accentsIn(expression, bound, local)) {
			const ratio = contrastRatio(tokens[token], tokens[ground]);
			if (ratio >= floor) continue;
			offences.push({ file, line: at, kind, ground, through, token, ratio, floor });
		}
	}

	for (const pattern of [STYLE_ATTRIBUTE, STYLE_STRING]) {
		for (const match of source.matchAll(pattern)) {
			const block = match[0];
			const declarations = block.match(DECLARED_COLOUR);
			if (declarations === null) continue;
			const grounds = (block.match(/background(?:-color)?:[^;"]*/gs) ?? []).join(' ');
			const size = /font-size:\s*([\d.]+)px/.exec(block);
			const weight = /font-weight:\s*(\d+|bold)/.exec(block);
			const large =
				size !== null &&
				isLargeText(
					parseFloat(size[1]),
					weight === null ? 400 : weight[1] === 'bold' ? 700 : parseInt(weight[1])
				);
			for (const declaration of declarations) {
				record(
					lineAt(source, match.index + block.indexOf(declaration)),
					declaration,
					large ? 'large text' : 'text',
					grounds
				);
			}
		}
	}

	for (const match of source.matchAll(STYLE_DIRECTIVE)) {
		record(lineAt(source, match.index), match[0], 'text', '');
	}

	for (const match of source.matchAll(ICON_TAG)) {
		for (const colour of match[0].matchAll(ICON_COLOUR)) {
			record(lineAt(source, match.index), colour[1] ?? colour[2], 'mark', '');
		}
	}

	for (const match of source.matchAll(COMPONENT_TAG)) {
		for (const colour of match[0].matchAll(PROP_COLOUR)) {
			record(lineAt(source, match.index + (colour.index ?? 0)), colour[1] ?? colour[2], 'text', '');
		}
	}

	for (const block of source.matchAll(STYLE_BLOCK)) {
		let at = block.index + block[0].indexOf(block[1]);
		for (const rule of block[1].split('}')) {
			const declarations = rule.match(DECLARED_COLOUR);
			if (declarations !== null) {
				const size = /font-size:\s*([\d.]+)px/.exec(rule);
				const weight = /font-weight:\s*(\d+|bold)/.exec(rule);
				const large =
					size !== null &&
					isLargeText(
						parseFloat(size[1]),
						weight === null ? 400 : weight[1] === 'bold' ? 700 : parseInt(weight[1])
					);
				const grounds = (rule.match(/background(?:-color)?:[^;]*/gs) ?? []).join(' ');
				for (const declaration of declarations) {
					record(
						lineAt(source, at + rule.indexOf(declaration)),
						declaration,
						large ? 'large text' : 'text',
						grounds
					);
				}
			}
			at += rule.length + 1;
		}
	}

	const seen = new Set<string>();
	return offences.filter((offence) => {
		const key = `${offence.line}:${offence.token}:${offence.kind}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

describe('no surface writes an accent under its floor on a neutral ground', () => {
	const tokens = paletteTokens();

	// Checked against the shapes it has to read and the ones it has to leave
	// alone. A guard whose only evidence is an empty list proves nothing about
	// what it can see.
	it('reads an accent through every spelling a surface uses', () => {
		const table = bindings("{@const block = BLOCK_PRESENTATION['exercise']}");
		const activity = bindings('const type = $derived(sessionActivityInfo(detail.activity));');
		const inline = colourFields("{#each [{ k: 'Programs', c: 'var(--gd)' }] as stat (stat.k)}");

		expect(accentsIn('color: var(--gd);', {}, {}).map((one) => one.token)).toEqual(['gd']);
		expect(accentsIn('color="var(--gd)"', {}, {}).map((one) => one.token)).toEqual(['gd']);
		expect(
			accentsIn("color: {failed ? 'var(--rd)' : 'var(--tx3)'};", {}, {}).map((one) => one.token)
		).toEqual(['rd']);
		// A directive carries `style:` as well as the property, and the root of the
		// binding walk has to be the expression rather than the word `color`.
		expect(accentsIn('style:color={type.color}', activity, {}).map((one) => one.token)).toContain(
			'gd'
		);
		expect(accentsIn('style:color={accent}', {}, {}).map((one) => one.token)).toEqual([]);
		expect(accentsIn('color: {type.color};', activity, {}).map((one) => one.token)).toContain('gd');
		expect(accentsIn('color: {type.text};', activity, {}).map((one) => one.token)).toEqual([]);
		expect(accentsIn('color={stat.c}', {}, inline).map((one) => one.token)).toEqual(['gd']);
		expect(accentsIn('color: var(--tx2);', {}, {}).map((one) => one.token)).toEqual([]);
		// An Icon prop value arrives with no property in front of it, so nothing
		// may be stripped off the front of it.
		expect(
			accentsIn("a === b ? 'var(--gd)' : 'var(--tx3)'", {}, {}).map((one) => one.token)
		).toEqual(['gd']);

		// The table a field comes from decides what it can hold. Gold can reach a
		// session figure and cannot reach a block button, and reading both from
		// one merged table would fail the block button for a colour it never gets.
		expect(accentsIn('color={block.color}', table, {}).map((one) => one.token)).not.toContain('gd');
	});

	// The two shapes added after round 2, checked directly: a colour handed to a
	// child by name, and a rule in a `<style>` block. Both were whole regions the
	// scan could not read, and a colour prop is how nine assessment hand labels
	// sat at 3.63:1 on a white card through the first two commits of this branch.
	it('reads a colour handed to a child component by name', () => {
		const tag = '<LatestValue label="LEFT" labelColor="var(--gn)" size={22} />';
		const prop = [...tag.matchAll(PROP_COLOUR)][0];
		expect(prop).toBeDefined();
		expect(accentsIn(prop[1], {}, {}).map((one) => one.token)).toEqual(['gn']);
		// An Icon's own colour belongs to the mark pass, not to this one.
		expect([...'<Icon name="x" color="var(--gd)" />'.matchAll(COMPONENT_TAG)]).toEqual([]);
	});

	it('leaves a ground or a stroke prop to whatever paints it', () => {
		const reads = (tag: string) => [...tag.matchAll(PROP_COLOUR)].length;
		expect(reads('<Chip labelColor="var(--gn)" />')).toBe(1);
		expect(reads('<Chip accent={type.text} />')).toBe(1);
		expect(reads('<Chip backgroundColor="var(--gd)" />')).toBe(0);
		expect(reads('<Chip bgColor="var(--gd)" />')).toBe(0);
		expect(reads('<Spark strokeColor={type.color} />')).toBe(0);
		expect(reads('<Chip borderColor="var(--pr)" />')).toBe(0);
	});

	it('reads a rule in a style block', () => {
		const block = [
			...'<style>\n.hb-tag { font-size: 10px; color: var(--hb); }\n</style>'.matchAll(STYLE_BLOCK)
		][0];
		expect(block).toBeDefined();
		expect(block[1].match(DECLARED_COLOUR)).toEqual(['color: var(--hb)']);
	});

	it('walks a binding back to the table it came from', () => {
		const bound = bindings(
			'let allowedStructureButtons = $derived(\n\tSTRUCTURE_BLOCKS.filter((b) => true)\n);\n' +
				'{#each allowedStructureButtons as btn (btn.type)}'
		);
		expect(tableFor('btn', bound)).toBe('block-presentation.ts');
		expect(tableFor('somethingElse', bound)).toBeNull();
	});

	it('separates the two floors', () => {
		expect(isLargeText(32, 700)).toBe(true);
		expect(isLargeText(20, 700)).toBe(true);
		expect(isLargeText(18, 700)).toBe(false);
		expect(isLargeText(24, 400)).toBe(true);
		expect(isLargeText(20, 400)).toBe(false);
	});

	// A gradient rule naming an accent used to be read as the ground of whatever
	// came after it, which is how a gold icon on a white card went unmeasured.
	it('does not take a gradient for a ground', () => {
		const lines = [
			'<div style="background: var(--panel);">',
			'<div style="height: 3px; background: linear-gradient(90deg, var(--gd), var(--pl));"></div>',
			'<Icon name="calendar" size={16} color="var(--gd)" />'
		];
		expect(groundFor(lines, 2, '')).toBe('panel');
	});

	// The numbers this sweep was decided on, restated so a token moved in
	// layout.css cannot quietly change which side of a floor a surface sits on.
	it('keeps gold the only accent that fails the mark floor on white', () => {
		const failing = NEUTRAL_ACCENTS.filter(
			(token) => contrastRatio(tokens[token], tokens.panel) < MARK_CONTRAST_FLOOR
		);
		expect(failing).toEqual(['gd']);
	});

	it('leaves only the two darkest accents above the text floor on white', () => {
		const clearing = NEUTRAL_ACCENTS.filter(
			(token) => contrastRatio(tokens[token], tokens.panel) >= TEXT_CONTRAST_FLOOR
		);
		expect(clearing).toEqual(['pr-dk', 'hb']);
	});

	it('finds no accent under its floor on a neutral ground', () => {
		const offences = sourceFiles(SOURCE_ROOT).flatMap((file) => neutralOffencesIn(file, tokens));
		const stated = offences.map(
			(offence) =>
				`${offence.file.slice(SOURCE_ROOT.length)}:${offence.line} writes ${offence.through} ` +
				`(--${offence.token}) as ${offence.kind} on --${offence.ground}, ` +
				`${offence.ratio.toFixed(2)}:1 against a ${offence.floor}:1 floor`
		);
		expect(stated, `accent under its floor on a neutral ground:\n${stated.join('\n')}`).toEqual([]);
	});
});
