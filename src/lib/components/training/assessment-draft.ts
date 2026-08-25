import type { AssessmentUnit } from '$lib/assessments';

// What a coach declares to turn a training into an assessment. The training is
// run as usual and ends on the question the prompt asks; the answer is the
// result, in the unit chosen here.
export interface AssessmentDraft {
	enabled: boolean;
	prompt: string;
	unit: AssessmentUnit;
	perHand: boolean;
}

export function emptyAssessmentDraft(): AssessmentDraft {
	return { enabled: false, prompt: '', unit: 'repetitions', perHand: false };
}
