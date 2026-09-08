import type { TrainingItem } from '$lib/api/client';

// Set around the tree a program week prescribes, and absent everywhere else,
// which is what keeps the same editors usable in the training editor. A week may
// change what a training asks for, never what it is made of, so the editors drop
// every structural control while the context is present and keep the
// configuration ones.
export const OVERRIDE_KEY = Symbol('training-override');

// readOnly freezes what is left, for a session the athlete already played or a
// program the coach is only reading. The callbacks let the strip under an item
// say whether this week asks anything of it, and put it back to what the
// training says, without the list in between owning the training it was read
// from. baseItem answers the same question field by field, for an editor that
// puts one of them back: the tree on screen has the week's override merged in
// already, so what the training prescribes is not readable from it.
export type OverrideMode = {
	readOnly: boolean;
	isOverridden: (itemId: string) => boolean;
	resetItem: (itemId: string) => void;
	baseItem: (itemId: string) => TrainingItem | undefined;
};

// What the other weeks of the program ask of the same item, so a coach setting
// this week's load reads the ones they already set without leaving the editor.
export const OVERRIDE_HISTORY_KEY = Symbol('training-override-history');

export type OverrideHistoryEntry = {
	// The scheduled row this chip is about. A week may hold the same training
	// twice, so the week number alone does not identify one.
	key: string;
	// What names the row: its week, and the day too where the week schedules the
	// training more than once.
	label: string;
	summary: string;
	current: boolean;
};

export type OverrideHistoryByItem = Record<string, OverrideHistoryEntry[]>;

// Held behind a getter so the strips read the weeks as they are recomputed,
// without the modal having to write into state it also reads.
export type OverrideHistoryContext = { readonly byItem: OverrideHistoryByItem };
