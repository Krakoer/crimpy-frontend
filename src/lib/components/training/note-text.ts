import type { TrainingItem } from '$lib/api/client';

// A note reaches the athlete as the step they read before moving on, so its
// text is the whole block. What the save has to refuse is the note that would
// go out holding the empty string: the app falls back to "Free" where free_text
// is null, and the empty string is not null, so that note plays as a step with
// no title at all.
//
// A note that carries no free_text at all is left alone. One written by the app
// reads that way, it goes back out as the null it came in as, and a coach
// editing the title of such a training has no business being stopped by a block
// they never wrote. A note the coach added here starts at the empty string, and
// one whose text they cleared holds it too, so both are caught.
//
// The save is refused rather than the block quietly dropped, and the message
// names where to look, since a collapsed note shows no preview to give itself
// away.
function wouldSendEmptyText(item: TrainingItem): boolean {
	return item.type === 'free' && item.free_text !== undefined && !item.free_text.trim();
}

function holdsEmptyNote(item: TrainingItem): boolean {
	if (wouldSendEmptyText(item)) return true;
	return item.items ? item.items.some(holdsEmptyNote) : false;
}

export function emptyNoteError(items: TrainingItem[]): string | null {
	const position = items.findIndex(holdsEmptyNote);
	if (position === -1) return null;
	return `A note needs some text for the athlete to read. Check block ${position + 1}.`;
}
