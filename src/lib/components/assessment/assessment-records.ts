import type { AssessmentResponse } from '$lib/api/client';

// One assessment the athlete has records for, with its definition taken from the
// rows themselves, so the coachee page needs no catalog of its own.
export interface RecordedAssessment {
	id: string;
	label: string;
	unit: string;
	perHand: boolean;
	// A grip only means something on a hangboard assessment, which is what the
	// ones Crimpy ships are. A pull up count is not held on an edge.
	hasGrips: boolean;
	// Whether the results read as a ratio to the bodyweight they were pulled at
	// rather than as a load in kilograms. It says how the number is read, so it
	// has to reach every surface that draws one.
	bodyweightRelative: boolean;
	records: AssessmentResponse[];
}

// When a result was measured, which is the date of the session that recorded it
// rather than when the row was written: an assessment logged after the fact, or
// synced late, still belongs where the athlete actually did it.
export function measuredAt(record: AssessmentResponse): number {
	return new Date(record.session_date).getTime();
}

function byDateAscending(a: AssessmentResponse, b: AssessmentResponse): number {
	return measuredAt(a) - measuredAt(b);
}

// Groups the athlete's results by the assessment they measure, ordered so the
// ones Crimpy ships come first and the coach's own follow by label. Driven by
// what was actually recorded rather than by a fixed list, so a coach's
// assessment appears the moment it is first measured.
export function groupRecordedAssessments(assessments: AssessmentResponse[]): RecordedAssessment[] {
	const byId = new Map<string, RecordedAssessment>();
	for (const record of assessments) {
		const existing = byId.get(record.assessment_id);
		if (existing) {
			existing.records.push(record);
			continue;
		}
		byId.set(record.assessment_id, {
			id: record.assessment_id,
			label: record.label,
			unit: record.unit,
			perHand: record.per_hand,
			hasGrips: !record.training_id,
			bodyweightRelative: record.bodyweight_relative,
			records: [record]
		});
	}
	const grouped = [...byId.values()];
	for (const assessment of grouped) {
		assessment.records.sort(byDateAscending);
	}
	return grouped.sort((a, b) => {
		if (a.hasGrips !== b.hasGrips) return a.hasGrips ? -1 : 1;
		return a.label.localeCompare(b.label);
	});
}

// The grip a hangboard assessment is read on before the coach picks one: the
// lowest it was actually measured on, so an assessment never done on a half
// crimp does not open on an empty history. Zero for one with no grips at all.
export function firstGrip(assessment: RecordedAssessment): number {
	const grips = assessment.records.map((record) => record.grip_position ?? 0);
	return grips.length === 0 ? 0 : Math.min(...grips);
}

export { unitLabel, formatUnitValue as formatRecordValue } from '$lib/assessments';

// The single number a non per hand assessment records. It is stored on the right
// hand, the left staying empty, so either side answers for it.
export function singleValue(record: AssessmentResponse | undefined): number | null | undefined {
	return record?.right_value ?? record?.left_value;
}

// The last value measured on each hand, and the row it was read from. A pull
// kept from a training carries only the hand that pulled it, so the newest row
// is not the latest of both hands: the other one still stands where its last
// measurement left it, which is what the app resolves that hand's loads against.
// A single value assessment stores its number on the right, so it reads as the
// right hand here.
export interface LatestHand {
	record: AssessmentResponse;
	value: number;
}

export function latestOnHand(
	history: AssessmentResponse[],
	pick: (record: AssessmentResponse) => number | null | undefined
): LatestHand | undefined {
	for (let i = history.length - 1; i >= 0; i--) {
		const value = pick(history[i]);
		if (value !== null && value !== undefined) return { record: history[i], value };
	}
	return undefined;
}

// The rows the headline numbers were read from, each with the hand it answers
// for. One session is one weigh-in, so a card names it once, but the two hands
// can come from different sessions once a pull kept on one hand is newer than
// the test: each is then named with its hand, since each ratio is divided by
// the weigh-in of its own session. The label is empty when one row answers
// for every number shown.
export function denominatorSources(
	perHand: boolean,
	left: LatestHand | undefined,
	right: LatestHand | undefined,
	single: LatestHand | undefined
): { label: string; record: AssessmentResponse }[] {
	if (!perHand) return single ? [{ label: '', record: single.record }] : [];
	const shown = [
		left && { label: 'Left', record: left.record },
		right && { label: 'Right', record: right.record }
	].filter((source): source is { label: string; record: AssessmentResponse } => !!source);
	if (shown.length === 2 && shown[0].record.id === shown[1].record.id) {
		return [{ label: '', record: shown[0].record }];
	}
	return shown.length === 1 ? [{ label: '', record: shown[0].record }] : shown;
}

// The first and the last value measured on one hand, for the progress a card
// reports across the history. Undefined until the hand has two measurements.
export function handEnds(
	history: AssessmentResponse[],
	pick: (record: AssessmentResponse) => number | null | undefined
): { first: LatestHand; last: LatestHand } | undefined {
	const measured = history.filter((record) => {
		const value = pick(record);
		return value !== null && value !== undefined;
	});
	if (measured.length < 2) return undefined;
	const first = measured[0];
	const last = measured[measured.length - 1];
	return {
		first: { record: first, value: pick(first)! },
		last: { record: last, value: pick(last)! }
	};
}

// Says where a result came from when it was not a test, so a coach can tell a
// Max Force the athlete kept off a training from one they tested. Empty for a
// test, which is what a result is unless it says otherwise.
export function originNote(record: Pick<AssessmentResponse, 'origin'>): string {
	return record.origin === 'training' ? 'From a training' : '';
}
