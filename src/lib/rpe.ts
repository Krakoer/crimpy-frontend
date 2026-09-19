import type { SessionResponse } from '$lib/api/client';

// The session RPE scale, how much recovery a session cost. This is the scale
// the coaching sheet prints on every week sheet, and the written anchor is what
// makes a value readable: "8" on its own is ambiguous between this scale and
// the set RPE scale, which measures reps left in reserve and belongs to a set
// rather than to a session.
//
// The scale starts at 5 because that is where its anchors start, and it mirrors
// the sessions_rpe_check constraint in the backend schema.
export const SESSION_RPE_ANCHORS: Record<number, string> = {
	5: 'Active recovery, warm up',
	6: 'Easy but productive',
	7: 'Needs less than a day of rest before repeating it',
	8: 'Needs one full rest day before repeating it',
	9: 'Needs two full rest days',
	10: 'Needs three or more full rest days'
};

// What a failed session reads as. The scale's ECHEC is stored as a flag of its
// own rather than as a number, so it has no place in the table above.
export const SESSION_RPE_FAILED_SHORT = 'ECHEC';
export const SESSION_RPE_FAILED_ANCHOR = 'Could not be carried through';

// What the athlete reported about how much a session cost them, or null when
// they reported nothing. One reader, so the session list, the modal and the
// week strip cannot disagree about whether a session carries an answer.
export interface SessionRpe {
	// What the badge shows: the value, or ECHEC.
	short: string;
	// The written anchor, which is what makes the number mean something.
	anchor: string;
	// The scale value, null on a failure, which sits outside it.
	value: number | null;
	failed: boolean;
}

export function sessionRpe(session: SessionResponse): SessionRpe | null {
	if (session.rpe_failed) {
		return {
			short: SESSION_RPE_FAILED_SHORT,
			anchor: SESSION_RPE_FAILED_ANCHOR,
			value: null,
			failed: true
		};
	}
	const value = session.rpe;
	if (value === null || value === undefined) return null;
	return {
		short: String(value),
		anchor: SESSION_RPE_ANCHORS[value] ?? 'Reported by the athlete',
		value,
		failed: false
	};
}

// How the badge reads at a glance, which is the point of showing RPE on a row a
// coach only scans: the outlier week is the one with a run of hard sessions in
// it. Sage up to what repeats within a day, gold for a session that costs a
// rest day, terracotta above it, and the error red for a failure.
export function sessionRpeColor(rpe: SessionRpe): string {
	if (rpe.failed) return 'var(--rd)';
	if (rpe.value !== null && rpe.value >= 9) return 'var(--pr)';
	if (rpe.value !== null && rpe.value >= 8) return 'var(--gd)';
	return 'var(--gn)';
}

export function sessionRpeTint(rpe: SessionRpe): string {
	if (rpe.failed) return 'var(--rd-lt)';
	if (rpe.value !== null && rpe.value >= 9) return 'var(--pr-lt)';
	if (rpe.value !== null && rpe.value >= 8) return 'var(--gd-lt)';
	return 'var(--gn-lt)';
}

// The one line a hover or a title attribute can hold, naming the scale so it is
// not read as a set RPE.
export function sessionRpeTitle(rpe: SessionRpe): string {
	return `Session RPE ${rpe.short}: ${rpe.anchor.toLowerCase()}`;
}
