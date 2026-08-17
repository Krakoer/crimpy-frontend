import type { TrainingItemType } from '$lib/api/client';

// How every block type is named and drawn. The right-rail palette and the add
// menu of an item list both create the same blocks, so they read their label,
// icon and colour from here rather than from a table of their own: the two
// drifted apart and showed the same block under two different icons.
export interface BlockPresentation {
	label: string;
	icon: string;
	color: string;
}

export const BLOCK_PRESENTATION: Record<TrainingItemType, BlockPresentation> = {
	exercise: { label: 'Exercise', icon: 'dumbbell', color: 'var(--pr)' },
	circuit: { label: 'Circuit', icon: 'link', color: 'var(--pr)' },
	group: { label: 'Group', icon: 'layers', color: 'var(--tx2)' },
	repeater: { label: 'Hangboard', icon: 'grip', color: 'var(--hb)' },
	hangboard_rep: { label: 'Hang rep', icon: 'clock', color: 'var(--hb)' },
	// The portal does not create free notes yet, but the type exists on the wire
	// and a training built in the app can carry one.
	free: { label: 'Note', icon: 'edit', color: 'var(--tx2)' }
};

// The containers and hangboard blocks the right rail offers, in the order it
// shows them. Exercises are added through their own picker, not from here.
export const STRUCTURE_BLOCK_TYPES: TrainingItemType[] = [
	'circuit',
	'group',
	'repeater',
	'hangboard_rep'
];

export const STRUCTURE_BLOCKS: (BlockPresentation & { type: TrainingItemType })[] =
	STRUCTURE_BLOCK_TYPES.map((type) => ({ type, ...BLOCK_PRESENTATION[type] }));
