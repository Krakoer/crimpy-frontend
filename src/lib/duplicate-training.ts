import type { Training, TrainingItem, TrainingRequest } from '$lib/api/client';

// What a duplicate's title ends with, and what is stripped off the original's
// before numbering: duplicating "Hangboard A (copy)" gives "Hangboard A
// (copy 2)" rather than stacking one suffix on the next.
const COPY_SUFFIX = /\s*\(copy(?: \d+)?\)$/;

/**
 * The title for a copy of [title], avoiding every title the library already
 * holds. A coach duplicating the same training twice gets two rows they can
 * tell apart, which is the whole reason the suffix is numbered rather than
 * repeated.
 */
export function copyTitle(title: string, existingTitles: string[]): string {
	const base = title.replace(COPY_SUFFIX, '').trim() || title.trim();
	const taken = new Set(existingTitles.map((existing) => existing.trim()));

	const first = `${base} (copy)`;
	if (!taken.has(first)) return first;

	// Bounded by the number of titles that can be in the way, plus the one that
	// is therefore free.
	for (let n = 2; n <= taken.size + 2; n++) {
		const candidate = `${base} (copy ${n})`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${base} (copy)`;
}

// The ids the server gave the items it read back. They are dropped rather than
// sent, although the create path ignores them: an id on a write means "keep
// this row", and nothing here is being kept.
function withoutServerIds(items: TrainingItem[]): TrainingItem[] {
	return items.map(({ id: _id, ...rest }) => ({
		...rest,
		items: rest.items ? withoutServerIds(rest.items) : undefined
	}));
}

/**
 * What to POST to create a copy of [training] under [title]. Everything the
 * training is made of comes across; what identifies the original does not.
 *
 * is_favorite is deliberately left off. Being a favourite is a coach's mark on
 * one row of their library rather than a property of the training, and a fresh
 * copy landing in the favourites list is clutter they did not ask for.
 */
export function trainingCopyRequest(training: Training, title: string): TrainingRequest {
	return {
		title,
		description: training.description ?? undefined,
		training_type: training.training_type,
		goal: training.goal,
		comment: training.comment,
		items: withoutServerIds(training.items ?? [])
	};
}
