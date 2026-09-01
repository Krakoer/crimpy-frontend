// Set around the tree a program week prescribes, and absent everywhere else,
// which is what keeps the same editors usable in the training editor. A week may
// change what a training asks for, never what it is made of, so the editors drop
// every structural control while the context is present and keep the
// configuration ones.
export const OVERRIDE_KEY = Symbol('training-override');

// readOnly freezes what is left, for a session the athlete already played or a
// program the coach is only reading. The two callbacks let the strip under an
// item say whether this week asks anything of it, and put it back to what the
// training says, without the list in between owning the training it was read
// from.
export type OverrideMode = {
	readOnly: boolean;
	isOverridden: (itemId: string) => boolean;
	resetItem: (itemId: string) => void;
};

// What the other weeks of the program ask of the same item, so a coach setting
// this week's load reads the ones they already set without leaving the editor.
export const OVERRIDE_HISTORY_KEY = Symbol('training-override-history');

export type OverrideHistoryEntry = {
	week: number;
	summary: string;
	current: boolean;
};

export type OverrideHistoryByItem = Record<string, OverrideHistoryEntry[]>;

// Held behind a getter so the strips read the weeks as they are recomputed,
// without the modal having to write into state it also reads.
export type OverrideHistoryContext = { readonly byItem: OverrideHistoryByItem };
