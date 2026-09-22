import type { TrainingItemType } from '$lib/api/client';

// How every block type is named and drawn. The right-rail palette and the add
// menu of an item list both create the same blocks, so they read their label,
// icon and colour from here rather than from a table of their own: the two
// drifted apart and showed the same block under two different icons.
export interface BlockPresentation {
	label: string;
	icon: string;
	color: string;
	// The same colour carried far enough down to be read as a label on a white
	// ground. `color` is the mark form and is what the icon beside the label
	// keeps: --pr reads 3.64:1 on white, over the 3:1 floor a stroke icon
	// answers to and under the 4.5:1 one a 12px button label does.
	// See Krakoer/crimpy#128.
	text: string;
}

export const BLOCK_PRESENTATION: Record<TrainingItemType, BlockPresentation> = {
	exercise: { label: 'Exercise', icon: 'dumbbell', color: 'var(--pr)', text: 'var(--pr-tx)' },
	circuit: { label: 'Circuit', icon: 'link', color: 'var(--pr)', text: 'var(--pr-tx)' },
	emom: { label: 'EMOM', icon: 'clock', color: 'var(--pr)', text: 'var(--pr-tx)' },
	group: { label: 'Group', icon: 'layers', color: 'var(--tx2)', text: 'var(--tx2)' },
	repeater: { label: 'Hangboard', icon: 'grip', color: 'var(--hb)', text: 'var(--hb)' },
	hangboard_rep: { label: 'Hang rep', icon: 'clock', color: 'var(--hb)', text: 'var(--hb)' },
	free: { label: 'Note', icon: 'edit', color: 'var(--tx2)', text: 'var(--tx2)' }
};

// The containers, hangboard blocks and notes the right rail offers, in the
// order it shows them. Exercises are added through their own picker, not from
// here.
export const STRUCTURE_BLOCK_TYPES: TrainingItemType[] = [
	'circuit',
	'emom',
	'group',
	'repeater',
	'hangboard_rep',
	'free'
];

export const STRUCTURE_BLOCKS: (BlockPresentation & { type: TrainingItemType })[] =
	STRUCTURE_BLOCK_TYPES.map((type) => ({ type, ...BLOCK_PRESENTATION[type] }));
