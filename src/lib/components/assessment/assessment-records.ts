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

export { unitLabel, formatUnitValue as formatRecordValue } from '$lib/assessments';

// The single number a non per hand assessment records. It is stored on the right
// hand, the left staying empty, so either side answers for it.
export function singleValue(record: AssessmentResponse | undefined): number | null | undefined {
	return record?.right_value ?? record?.left_value;
}
