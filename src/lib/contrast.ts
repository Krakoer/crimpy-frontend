// WCAG 2.1 relative luminance and contrast, shared by the two palette guards.
// Stated once rather than in each test: two copies of the formula can disagree,
// and a guard that measures a pairing differently from its companion is worse
// than no guard at all.

function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	return (
		0.2126 * channel((n >> 16) & 0xff) +
		0.7152 * channel((n >> 8) & 0xff) +
		0.0722 * channel(n & 0xff)
	);
}

// (L1 + 0.05) / (L2 + 0.05), the lighter of the two on top.
export function contrastRatio(foreground: string, background: string): number {
	const a = relativeLuminance(foreground);
	const b = relativeLuminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// The floor for text below the 18.66px bold / 24px regular threshold.
export const TEXT_CONTRAST_FLOOR = 4.5;

// The floor for large text and for anything that is not text: an icon, a rule,
// a mark. WCAG 1.4.3 exempts large text from the 4.5:1 floor and 1.4.11 sets
// the same 3:1 on non-text content, so the two share a number for two reasons.
export const MARK_CONTRAST_FLOOR = 3;

// Large text in WCAG terms: 24px regular, or 18.66px once it is bold.
export function isLargeText(sizePx: number, weight: number): boolean {
	return sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
}
