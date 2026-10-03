import { describe, expect, it } from 'vitest';
import type { AssessmentResultSnapshot, TrainingItem } from '$lib/api/client';
import {
	buildAssessmentCatalog,
	collectAssessmentRelativeValues,
	resolveAgainstFrozenResults
} from '$lib/assessments';

const MAX_FORCE = 'f7954158-63ba-4f0b-a125-6ef195fa6442';

const catalog = buildAssessmentCatalog([
	{
		id: MAX_FORCE,
		label: 'Max Force',
		unit: 'kilograms',
		per_hand: true
	}
]);

// Half crimp tested first, open hand later: before Krakoer/crimpy#182 every
// percentage load read against the open hand, the latest result.
const frozen: AssessmentResultSnapshot[] = [
	{
		assessment_id: MAX_FORCE,
		right_value: 30,
		left_value: 44,
		by_grip: [
			{ grip_position: 0, right_value: 45, left_value: 44 },
			{ grip_position: 3, right_value: 30 }
		]
	}
];

function hang(grip: string, hand: TrainingItem['hand'] = 'right'): TrainingItem {
	return {
		type: 'hangboard_rep',
		hand,
		loads: [{ value: 80, unit: 'percent_assessment', assessment_id: MAX_FORCE, fallback: 10 }],
		hand_positions: [[grip]]
	} as TrainingItem;
}

function resolvedFor(item: TrainingItem) {
	const [relative] = collectAssessmentRelativeValues([item]);
	return { relative, resolved: resolveAgainstFrozenResults(relative, frozen, catalog) };
}

describe('grip-aware frozen resolution', () => {
	it('reads a hang against the max of its own grip', () => {
		const { relative, resolved } = resolvedFor(hang('HC'));
		expect(relative.grip).toBe(0);
		expect(resolved).toEqual([{ hand: 'right', value: 36, fromFallback: false }]);
	});

	it('reads the other grip against its own max', () => {
		expect(resolvedFor(hang('OH')).resolved[0].value).toBe(24);
	});

	it('falls back to any grip for a grip never tested', () => {
		expect(resolvedFor(hang('FC')).resolved[0].value).toBe(24);
	});

	it('falls back hand by hand', () => {
		// The open hand was never pulled on the left.
		expect(resolvedFor(hang('OH', 'left')).resolved[0].value).toBeCloseTo(35.2);
	});

	it('keeps the same percentage on two grips apart', () => {
		const values = collectAssessmentRelativeValues([hang('HC'), hang('OH')]);
		expect(values.map((v) => v.grip)).toEqual([0, 3]);
	});

	it('reads a snapshot frozen before the grips were kept as before', () => {
		const [relative] = collectAssessmentRelativeValues([hang('HC')]);
		const old: AssessmentResultSnapshot[] = [
			{ assessment_id: MAX_FORCE, right_value: 30, left_value: 44 }
		];
		expect(resolveAgainstFrozenResults(relative, old, catalog)[0].value).toBe(24);
	});
});
