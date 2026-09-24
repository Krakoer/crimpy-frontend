import type { ComparedHand } from './assessment-comparison';
import type { MissingRatio } from './bodyweight-ratio';

// The two colours the comparison writes its notes in. They live here rather
// than inside AssessmentComparison.svelte so that palette-contrast.test.ts can
// measure them: no source scan follows a colour out of a function, and both of
// these went a whole review round writing a bare --rd on a white card because
// of it. denominatorNoteColor in bodyweight-ratio.ts is the same shape and is
// measured the same way. See Krakoer/crimpy#128.

export function progressionColor(hand: ComparedHand): string {
	if (hand.delta === undefined) return 'var(--tx3-sm)';
	// A result that did not move is not a loss, including the one the
	// percentage cannot answer for because it started at zero.
	if (hand.delta === 0) return 'var(--tx2)';
	if (hand.percent !== undefined && Math.abs(hand.percent) < 0.05) return 'var(--tx2)';
	return hand.delta > 0 ? 'var(--gn-tx)' : 'var(--rd-tx)';
}

// A weigh-in that went stale is a caution, and one that never happened is an
// absence: the athlete can fix the first by stepping on the scales.
export function missingRatioColor(missing: MissingRatio): string {
	return missing === 'stale' ? 'var(--gd-tx)' : 'var(--rd-tx)';
}
