import type { AssessmentUnit } from '$lib/assessments';

// What a coach declares to turn a training into an assessment. The training is
// run as usual and ends on the question the prompt asks; the answer is the
// result, in the unit chosen here.
export interface AssessmentDraft {
	enabled: boolean;
	prompt: string;
	unit: AssessmentUnit;
	perHand: boolean;
	// Whether a result in kilograms is read as a ratio to the bodyweight it was
	// pulled at. Only a weight can be one, so the payload drops it for any other
	// unit rather than letting a stale toggle be refused by the server.
	bodyweightRelative: boolean;
}

export function emptyAssessmentDraft(): AssessmentDraft {
	return {
		enabled: false,
		prompt: '',
		unit: 'repetitions',
		perHand: false,
		bodyweightRelative: false
	};
}

// What the draft asks the server for, with the ratio flag dropped on a unit
// that cannot carry one.
export function assessmentDraftFlags(draft: AssessmentDraft): { bodyweight_relative: boolean } {
	return { bodyweight_relative: draft.unit === 'kilograms' && draft.bodyweightRelative };
}
