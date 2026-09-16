import type { TrainingItem } from '$lib/api/client';

// A note reaches the athlete as the step they read before moving on, so its
// text is the whole block: an empty one plays as a step with no title at all.
// The app falls back to "Free" where free_text is null, which a note written
// here can never be, since a textarea the coach left alone sends the empty
// string.
//
// The save is refused rather than the block quietly dropped: a coach who added
// a note and has not typed in it yet is told which block to fill in, and keeps
// the one they added.
export const EMPTY_NOTE_ERROR = 'A note needs some text for the athlete to read.';

export function hasEmptyNote(items: TrainingItem[]): boolean {
	return items.some((item) => {
		if (item.type === 'free') return !item.free_text?.trim();
		return item.items ? hasEmptyNote(item.items) : false;
	});
}
