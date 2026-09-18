import { describe, expect, it } from 'vitest';
import { assessmentDraftFlags, emptyAssessmentDraft } from './assessment-draft';

describe('assessmentDraftFlags', () => {
	it('asks for the bodyweight score on a weight', () => {
		const draft = {
			...emptyAssessmentDraft(),
			unit: 'kilograms' as const,
			bodyweightRelative: true
		};
		expect(assessmentDraftFlags(draft)).toEqual({ bodyweight_relative: true });
	});

	// The checkbox is hidden once the unit is not a weight, so a coach who ticked
	// it and then moved the unit cannot see it is still set. Sending it would be
	// refused by the server, which only reads as the save failing.
	it('drops a score left ticked on a unit that cannot carry one', () => {
		for (const unit of ['seconds', 'repetitions'] as const) {
			const draft = { ...emptyAssessmentDraft(), unit, bodyweightRelative: true };
			expect(assessmentDraftFlags(draft)).toEqual({ bodyweight_relative: false });
		}
	});

	it('asks for nothing when the coach did not tick it', () => {
		const draft = { ...emptyAssessmentDraft(), unit: 'kilograms' as const };
		expect(assessmentDraftFlags(draft)).toEqual({ bodyweight_relative: false });
	});
});
