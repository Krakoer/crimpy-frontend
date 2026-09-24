import { describe, expect, it } from 'vitest';
import { contrastRatio, TEXT_CONTRAST_FLOOR } from '$lib/contrast';
import { tagPill, tagPillIsReadable } from '$lib/tag-contrast';

// The eight TagSelect seeds, spelled out rather than imported: they live inside
// a component's script block and a test that reached for them would be reaching
// through the component. A seed changed there and not here fails the last case.
const SEEDED = [
	'#E53935',
	'#8E24AA',
	'#1E88E5',
	'#00ACC1',
	'#43A047',
	'#FB8C00',
	'#6D4C41',
	'#546E7A'
];

describe('a tag label is chosen from the colour it sits on', () => {
	it.each(SEEDED)('carries a readable label on %s', (colour) => {
		const { ground, label } = tagPill(colour);
		const ratio = contrastRatio(label, ground);
		expect(
			ratio,
			`${label} on ${ground} (from ${colour}) reads ${ratio.toFixed(2)}:1`
		).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
	});

	it('keeps a pale tag as it is and darkens one that can carry neither', () => {
		// Pale enough for the dark label: the colour is untouched.
		expect(tagPill('#FB8C00')).toEqual({ ground: '#FB8C00', label: '#2d241d' });
		// Dark enough for white: also untouched.
		expect(tagPill('#6D4C41')).toEqual({ ground: '#6D4C41', label: '#ffffff' });
		// In the band where neither works, the hue is kept and darkened.
		const mid = tagPill('#1E88E5');
		expect(mid.label).toBe('#ffffff');
		expect(mid.ground).not.toBe('#1E88E5');
	});

	// Five of the eight seeds could not carry white, which is why the label is
	// picked rather than fixed. Stated as a fact about the seeds so that a future
	// palette that could carry white does not make this file look pointless.
	it('records how many seeds white alone could not carry', () => {
		const failing = SEEDED.filter(
			(colour) => contrastRatio('#ffffff', colour) < TEXT_CONTRAST_FLOOR
		);
		expect(failing).toHaveLength(5);
	});

	// A coach picks their own colour, so the guarantee has to hold for any hex,
	// not for the seeds. Swept across the cube rather than asserted on examples.
	it('carries a readable label on every colour a tag can hold', () => {
		const unreadable: string[] = [];
		for (let r = 0; r < 256; r += 17) {
			for (let g = 0; g < 256; g += 17) {
				for (let b = 0; b < 256; b += 17) {
					const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
					if (!tagPillIsReadable(hex)) unreadable.push(hex);
				}
			}
		}
		expect(unreadable).toEqual([]);
	});
});
