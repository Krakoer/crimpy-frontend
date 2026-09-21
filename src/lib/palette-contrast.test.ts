import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MARK_CONTRAST_FLOOR, TEXT_CONTRAST_FLOOR, contrastRatio } from '$lib/contrast';
import { BLOCK_PRESENTATION } from '$lib/block-presentation';
import { missingRatioColor, progressionColor } from '$lib/components/assessment/comparison-colors';
import { toneColor, toneMarkColor, toneTextColor } from '$lib/training-load';
import type { BandTone } from '$lib/training-load';
import { SESSION_ACTIVITIES } from '$lib/sessions';
import { TRAINING_TYPE_INFO } from '$lib/trainingTypes';
import { sessionRpe, sessionRpeColor, sessionRpeTint } from '$lib/rpe';
import { denominatorNoteColor } from '$lib/components/assessment/bodyweight-ratio';
import type { SessionResponse } from '$lib/api/client';

// The floor for text below the 18.66px bold threshold, which every pill and
// badge in this portal is: the session RPE badge is 10.5px bold on a session row
// and 9px bold in the week grid, and the type chips are 8.5px to 12px. Nothing
// here earns the 3:1 large text exemption. Surfaces that do are measured in
// palette-surfaces.test.ts, which holds both floors.
const CONTRAST_FLOOR = TEXT_CONTRAST_FLOOR;

const PALETTE_SOURCE = fileURLToPath(new URL('../routes/layout.css', import.meta.url));

function palette(): Record<string, string> {
	const css = readFileSync(PALETTE_SOURCE, 'utf8');
	const tokens: Record<string, string> = {};
	for (const [, name, hex] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
		tokens[name] = hex.toLowerCase();
	}
	return tokens;
}

// Resolves a value written as `var(--token)` against layout.css, so a pairing is
// measured on the hex the browser will actually paint rather than on a number
// copied into a test.
function resolve(value: string, tokens: Record<string, string>): string {
	const match = /^var\(--([a-z0-9-]+)\)$/.exec(value.trim());
	expect(match, `${value} is not a palette token`).not.toBeNull();
	const hex = tokens[match![1]];
	expect(hex, `--${match![1]} is not defined in layout.css`).toBeDefined();
	return hex;
}

function expectClearsFloor(
	label: string,
	foreground: string,
	background: string,
	tokens: Record<string, string>
): void {
	const fg = resolve(foreground, tokens);
	const bg = resolve(background, tokens);
	const ratio = contrastRatio(fg, bg);
	expect(
		ratio,
		`${label}: ${foreground} ${fg} on ${background} ${bg} reads ${ratio.toFixed(2)}:1, under the ${CONTRAST_FLOOR}:1 floor`
	).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
}

// Every hue whose accent is ever written as text on its own light ground carries
// a darker text token for it. The accents themselves are marks: all six are
// under the floor on their own tint, which is what Krakoer/crimpy#119 measured.
const ACCENT_TEXT_TOKENS: [hue: string, text: string, tint: string][] = [
	['terracotta', 'var(--pr-tx)', 'var(--pr-lt)'],
	['sage', 'var(--gn-tx)', 'var(--gn-lt)'],
	['gold', 'var(--gd-tx)', 'var(--gd-lt)'],
	['plum', 'var(--pl-tx)', 'var(--pl-lt)'],
	['red', 'var(--rd-tx)', 'var(--rd-lt)'],
	['blue', 'var(--bl-tx)', 'var(--bl-lt)']
];

// The same hexes as the Flutter theme, which has no way to read this file.
// Changing one side alone fails here, and in the palette test of crimpy-app, so
// the two cannot drift apart unseen.
const MIRRORED_IN_CRIMPY_APP: Record<string, string> = {
	'pr-tx': '#965134',
	'gn-tx': '#4e7154',
	'gd-tx': '#8a6220',
	'pl-tx': '#735f7b',
	'rd-tx': '#ac4747',
	'bl-tx': '#4b698a'
};

const BAND_TONES: BandTone[] = ['low', 'good', 'high', 'unlabelled'];

const session = (overrides: Partial<SessionResponse>): SessionResponse =>
	({ id: 'x', rpe: null, rpe_failed: false, ...overrides }) as SessionResponse;

describe('Alpine accent text on its own tint', () => {
	const tokens = palette();

	it.each(ACCENT_TEXT_TOKENS)('holds %s at the small text floor', (hue, text, tint) => {
		expectClearsFloor(hue, text, tint, tokens);
	});

	// The accents are still marks and are deliberately not held to the text
	// floor, but a pairing that reads worse than its own accent would mean the
	// token was moved the wrong way.
	it.each(ACCENT_TEXT_TOKENS)('reads %s darker than the bare accent', (hue, text, tint) => {
		const accent = `var(--${text.slice(6, -1).replace('-tx', '')})`;
		expect(contrastRatio(resolve(text, tokens), resolve(tint, tokens))).toBeGreaterThan(
			contrastRatio(resolve(accent, tokens), resolve(tint, tokens))
		);
	});

	it('mirrors every text token in the Flutter theme', () => {
		for (const [name, hex] of Object.entries(MIRRORED_IN_CRIMPY_APP)) {
			expect(
				tokens[name],
				`--${name} moved without crimpy-app/lib/theme/crimpy_theme.dart moving with it`
			).toBe(hex);
		}
	});
});

describe('surfaces that write an accent as text on its own tint', () => {
	const tokens = palette();

	// The badge is the surface #119 was opened for. Every band of the scale is
	// checked on the ground it is drawn on, so a band moved back to a bare accent
	// fails here even if the tokens themselves are still fine.
	it.each([5, 6, 7, 8, 9, 10])('holds the session RPE badge at %i', (value) => {
		const rpe = sessionRpe(session({ rpe: value }))!;
		expectClearsFloor(`session RPE ${value}`, sessionRpeColor(rpe), sessionRpeTint(rpe), tokens);
	});

	it('holds the failed session RPE badge', () => {
		const rpe = sessionRpe(session({ rpe_failed: true }))!;
		expectClearsFloor('session RPE failure', sessionRpeColor(rpe), sessionRpeTint(rpe), tokens);
	});

	it.each(Object.entries(TRAINING_TYPE_INFO))('holds the %s training chip', (label, info) => {
		expectClearsFloor(label, info.text, info.tint, tokens);
	});

	it.each(Object.entries(SESSION_ACTIVITIES))('holds the session activity %s pill', (key, info) => {
		expectClearsFloor(info.label, info.text, info.tint, tokens);
	});

	// Why there is no ratio, written under an assessment result on the cards, the
	// history table and the session detail modal. Every one of those grounds is
	// var(--panel), a plain white panel rather than a hue's own light tint, which
	// is the shape neither guard #119 shipped was built to see: the token table
	// only pairs an accent with its own -lt ground, and the source scan only
	// recognises a ground from HUES.grounds and only a colour written as a literal
	// token, not one returned by a function the way denominatorNoteColor is. It
	// went unmeasured until a reader found it, so it is enumerated here.
	//
	// Only the two accent states. The third returns var(--tx3), the muted body
	// token this portal writes all its secondary text in, which is a typographic
	// choice across every surface rather than an accent used as text, and not
	// something to settle inside an assessment test.
	it.each([
		['a weigh-in that went stale', { missing: 'stale' as const }],
		['a weigh-in that never happened', { missing: 'no-weigh-in' as const }]
	])('holds the denominator note for %s', (label, reading) => {
		expectClearsFloor(label, denominatorNoteColor(reading), 'var(--panel)', tokens);
	});
});

describe('surfaces that write an accent on a neutral ground', () => {
	const tokens = palette();

	// The mark form is what a session keeps on white when it is an icon or a
	// figure large enough for the 3:1 floor, which is the session detail
	// modal's 32px duration. Only climbing moves, because only gold misses 3:1.
	it.each(Object.entries(SESSION_ACTIVITIES))('holds the %s mark on white', (key, info) => {
		const ratio = contrastRatio(resolve(info.mark, tokens), resolve('var(--panel)', tokens));
		expect(
			ratio,
			`${info.label}: ${info.mark} reads ${ratio.toFixed(2)}:1 on --panel, under the ${MARK_CONTRAST_FLOOR}:1 mark floor`
		).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
	});

	it.each(Object.entries(SESSION_ACTIVITIES))(
		'keeps the %s mark the accent unless it fails',
		(key, info) => {
			const accentClears =
				contrastRatio(resolve(info.color, tokens), resolve('var(--panel)', tokens)) >=
				MARK_CONTRAST_FLOOR;
			expect(
				info.mark,
				`${info.label} was moved off its accent although the accent clears the mark floor, or left on one that does not`
			).toBe(accentClears ? info.color : info.text);
		}
	);

	// The rep rows of the session detail modal take their accent as a prop, from
	// SessionDetailModal, and paint it at 11px bold on a white card. No source
	// scan follows a colour through a prop, so the pairing is named here.
	it.each(Object.entries(SESSION_ACTIVITIES))(
		'holds the %s rep row label on the white card',
		(key, info) => {
			expectClearsFloor(`${info.label} rep row`, info.text, 'var(--panel)', tokens);
		}
	);

	// The block palette writes its label in `text` and draws its icon in
	// `color`, on the white of the right rail and the add menu.
	it.each(Object.entries(BLOCK_PRESENTATION))('holds the %s block button label', (type, block) => {
		expectClearsFloor(block.label, block.text, 'var(--panel)', tokens);
	});

	// Colours a source scan will never see, because they come out of a function
	// rather than a token. Each one is named here instead, which is the price of
	// the guard not resolving calls.
	it.each(BAND_TONES)('holds the %s load band as a table cell', (tone) => {
		expectClearsFloor(`${tone} load cell`, toneTextColor(tone), 'var(--panel)', tokens);
	});

	it.each(BAND_TONES)('holds the %s load band as a headline figure', (tone) => {
		const ratio = contrastRatio(
			resolve(toneMarkColor(tone), tokens),
			resolve('var(--panel)', tokens)
		);
		expect(
			ratio,
			`${tone} load figure: ${toneMarkColor(tone)} reads ${ratio.toFixed(2)}:1 on --panel, under the ${MARK_CONTRAST_FLOOR}:1 mark floor`
		).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
	});

	// The load figures are 26px bold, so large text, and keep their accent
	// wherever the accent clears 3:1. Only gold moves, exactly as the session
	// activity marks do.
	it.each(BAND_TONES)('keeps the %s load figure on its accent unless it fails', (tone) => {
		const accentClears =
			contrastRatio(resolve(toneColor(tone), tokens), resolve('var(--panel)', tokens)) >=
			MARK_CONTRAST_FLOOR;
		expect(toneMarkColor(tone)).toBe(accentClears ? toneColor(tone) : toneTextColor(tone));
	});

	it.each([
		['a result that went backwards', -1],
		['a result that went forwards', 1]
	])('holds the assessment progression note for %s', (label, delta) => {
		expectClearsFloor(
			label,
			progressionColor({ hand: 'single', delta, percent: delta, unchanged: false }),
			'var(--panel)',
			tokens
		);
	});

	it.each([['stale'], ['no-weigh-in']] as const)(
		'holds the missing ratio note for a %s weigh-in',
		(missing) => {
			expectClearsFloor(missing, missingRatioColor(missing), 'var(--panel)', tokens);
		}
	);

	it.each(Object.entries(BLOCK_PRESENTATION))('holds the %s block button icon', (type, block) => {
		const ratio = contrastRatio(resolve(block.color, tokens), resolve('var(--panel)', tokens));
		expect(
			ratio,
			`${block.label}: ${block.color} reads ${ratio.toFixed(2)}:1 on --panel, under the ${MARK_CONTRAST_FLOOR}:1 mark floor`
		).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
	});
});
