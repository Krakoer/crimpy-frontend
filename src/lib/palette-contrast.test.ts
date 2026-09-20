import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SESSION_ACTIVITIES } from '$lib/sessions';
import { TRAINING_TYPE_INFO } from '$lib/trainingTypes';
import { sessionRpe, sessionRpeColor, sessionRpeTint } from '$lib/rpe';
import type { SessionResponse } from '$lib/api/client';

// The floor for text below the 18.66px bold threshold, which every pill and
// badge in this portal is: the session RPE badge is 10.5px bold on a session row
// and 9px bold in the week grid, and the type chips are 8.5px to 12px. Nothing
// here earns the 3:1 large text exemption.
const CONTRAST_FLOOR = 4.5;

const PALETTE_SOURCE = fileURLToPath(new URL('../routes/layout.css', import.meta.url));

function palette(): Record<string, string> {
	const css = readFileSync(PALETTE_SOURCE, 'utf8');
	const tokens: Record<string, string> = {};
	for (const [, name, hex] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
		tokens[name] = hex.toLowerCase();
	}
	return tokens;
}

function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	return (
		0.2126 * channel((n >> 16) & 0xff) +
		0.7152 * channel((n >> 8) & 0xff) +
		0.0722 * channel(n & 0xff)
	);
}

// WCAG 2.1 relative luminance contrast, (L1 + 0.05) / (L2 + 0.05).
function contrastRatio(foreground: string, background: string): number {
	const a = luminance(foreground);
	const b = luminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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
});
