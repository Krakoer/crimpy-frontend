import { contrastRatio, relativeLuminance, TEXT_CONTRAST_FLOOR } from '$lib/contrast';

// A tag's colour is the coach's, not the palette's: TagSelect seeds eight hexes
// and the value is stored per tag and sent back by the API, so no token governs
// it and no palette decision can reach it. Five of the eight seeds carry white
// under the 4.5:1 floor at the 10px these pills use (#FB8C00 2.37, #00ACC1
// 2.74, #43A047 3.30, #1E88E5 3.68, #E53935 4.23), and a coach who picks their
// own can land anywhere.
//
// Picking the label from the ground is not enough on its own. Between roughly
// 0.05 and 0.18 relative luminance there is a band where neither --tx nor white
// reaches 4.5:1, and six of the eight seeds sit in or near it. So the pill
// darkens its own ground far enough to carry white, the way --pr-dk does for
// the primary button and fillOn does in crimpy-app. The hue is kept; only its
// lightness moves, so a tag still reads as the colour the coach chose.
//
// See Krakoer/crimpy#137.
const ON_DARK = '#ffffff';
const ON_LIGHT = '#2d241d'; // --tx

function channelsOf(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function hexOf(channels: number[]): string {
	return `#${channels.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// The ground and the label a tag pill paints, for any colour a tag can hold.
export function tagPill(background: string): { ground: string; label: string } {
	if (!/^#[0-9a-f]{6}$/i.test(background)) return { ground: background, label: ON_DARK };

	// A pale tag keeps its colour and takes the dark label.
	if (contrastRatio(ON_LIGHT, background) >= TEXT_CONTRAST_FLOOR) {
		return { ground: background, label: ON_LIGHT };
	}
	// A dark one keeps its colour and takes white.
	if (contrastRatio(ON_DARK, background) >= TEXT_CONTRAST_FLOOR) {
		return { ground: background, label: ON_DARK };
	}
	// Otherwise the hue is kept and darkened until white is readable on it.
	const channels = channelsOf(background);
	for (let step = 99; step >= 0; step--) {
		const darker = hexOf(channels.map((v) => (v * step) / 100));
		if (contrastRatio(ON_DARK, darker) >= TEXT_CONTRAST_FLOOR) {
			return { ground: darker, label: ON_DARK };
		}
	}
	return { ground: '#000000', label: ON_DARK };
}

// Whether the pair the helper answers with is readable. Nothing in the portal
// calls this; it is what the test asserts across every colour a tag can hold,
// so a gap in the reasoning above fails here rather than on a coach's screen.
export function tagPillIsReadable(background: string): boolean {
	const { ground, label } = tagPill(background);
	return contrastRatio(label, ground) >= TEXT_CONTRAST_FLOOR;
}

export { relativeLuminance };
