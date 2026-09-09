import { describe, it, expect } from 'vitest';
import type { TrainingItem } from '$lib/api/client';
import type { AssessmentCatalog } from '$lib/assessments';
import type { OverrideMode } from './override-context';
import { createPrescription, initialBoxes, type PrescriptionBoxes } from './exercise-prescription';

const catalog: AssessmentCatalog = {
	'max-hang': {
		label: 'Max hang',
		unit: 'seconds',
		perHand: false,
		format: (v) => `${v}s`
	},
	'pull-ups': {
		label: 'Pull ups',
		unit: 'repetitions',
		perHand: false,
		format: (v) => `${v}`
	}
};

// The editor's own boxes, plus the two effects that follow them, so a test can
// run a sequence of clicks the way the panel does: click, then let the boxes
// write what they write.
function editor(item: TrainingItem, base?: TrainingItem) {
	// The editor's own seeding, not a copy of it, so a change to the rule reaches
	// these tests instead of leaving them green against the old one.
	const boxes: PrescriptionBoxes = initialBoxes(item);

	const overrideMode = base
		? ({
				readOnly: false,
				readOnlyReason: '',
				locked: false,
				isOverridden: () => true,
				staleNotice: () => null,
				resetItem: () => {},
				baseItem: (id: string) => (id === base.id ? base : undefined)
			} satisfies OverrideMode)
		: undefined;

	const prescription = createPrescription({
		get item() {
			return item;
		},
		get catalog() {
			return catalog;
		},
		get overrideMode() {
			return overrideMode;
		},
		boxes
	});

	function settle() {
		prescription.syncDuration();
		prescription.syncReps();
	}

	settle();

	return {
		item,
		boxes,
		prescription,
		settle,
		typeDuration(minutes: number, seconds: number) {
			boxes.durationMin = minutes;
			boxes.durationSec = seconds;
			settle();
		},
		typeReps(count: number | null) {
			boxes.repsCount = count;
			settle();
		},
		clickPercent(on: boolean) {
			prescription.setVariable(on);
			settle();
		},
		clickAmrap(on: boolean) {
			prescription.setAmrap(on);
			settle();
		}
	};
}

const trainingDuration: TrainingItem = {
	type: 'exercise',
	id: 'item-1',
	duration: 120,
	reps: 0,
	variable_targets: { duration: { assessment_id: 'max-hang', percent: 75, fallback: 120 } }
};

const trainingReps: TrainingItem = {
	type: 'exercise',
	id: 'item-1',
	duration: 0,
	reps: 8,
	variable_targets: { reps: { assessment_id: 'pull-ups', percent: 80, fallback: 8 } }
};

function base(source: TrainingItem): TrainingItem {
	return structuredClone(source);
}

describe('the percent toggle in a program week', () => {
	it('gives the coach their own value back when turned on then off with no typing', () => {
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 150, reps: 0 },
			base(trainingDuration)
		);

		week.clickPercent(true);
		expect(week.item.variable_targets?.duration?.fallback).toBe(120);
		expect(week.item.duration).toBe(120);

		week.clickPercent(false);

		expect(week.item.variable_targets).toBeUndefined();
		expect(week.item.duration).toBe(150);
		expect(week.boxes.durationMin).toBe(2);
		expect(week.boxes.durationSec).toBe(30);
	});

	it('keeps a number typed while the percentage was off', () => {
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 150, reps: 0 },
			base(trainingDuration)
		);

		week.clickPercent(true);
		week.clickPercent(false);
		week.typeDuration(3, 20);
		week.clickPercent(true);
		week.clickPercent(false);

		expect(week.item.variable_targets).toBeUndefined();
		expect(week.item.duration).toBe(200);
	});

	it('leaves the training its own number while the percentage stands', () => {
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 150, reps: 0 },
			base(trainingDuration)
		);

		week.clickPercent(true);
		week.typeDuration(4, 0);

		expect(week.item.variable_targets?.duration?.fallback).toBe(240);
		expect(week.item.duration).toBe(120);
	});
});

describe('the percent toggle in the training editor', () => {
	it('keeps a number typed between off and on', () => {
		const training = editor(structuredClone(trainingDuration));

		training.clickPercent(false);
		expect(training.item.variable_targets).toBeUndefined();
		expect(training.item.duration).toBe(120);

		training.typeDuration(3, 0);
		training.clickPercent(true);

		expect(training.item.variable_targets?.duration?.fallback).toBe(180);
		expect(training.item.duration).toBe(180);
		expect(training.boxes.durationMin).toBe(3);
		expect(training.boxes.durationSec).toBe(0);
	});

	it('writes the same number to the plain field and the fallback', () => {
		const training = editor(structuredClone(trainingDuration));

		training.typeDuration(1, 30);

		expect(training.item.variable_targets?.duration?.fallback).toBe(90);
		expect(training.item.duration).toBe(90);
	});

	it('writes the plain reps field beside the fallback too', () => {
		const training = editor(structuredClone(trainingReps));

		training.typeReps(12);

		expect(training.item.variable_targets?.reps?.fallback).toBe(12);
		expect(training.item.reps).toBe(12);
	});
});

describe('the AMRAP toggle in a program week', () => {
	it('keeps the plain count it was turned on over and resurrects no percentage', () => {
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 0, reps: 12 },
			base(trainingReps)
		);

		week.clickAmrap(true);
		expect(week.item.reps_is_max).toBe(true);
		expect(week.item.variable_targets).toBeUndefined();

		week.clickAmrap(false);

		expect(week.item.reps_is_max).toBe(false);
		expect(week.item.variable_targets).toBeUndefined();
		expect(week.item.reps).toBe(12);
		expect(week.boxes.repsCount).toBe(12);
	});

	it('puts back the percentage it took away itself', () => {
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 0, reps: 8 },
			base(trainingReps)
		);

		week.clickPercent(true);
		week.clickAmrap(true);
		expect(week.item.variable_targets).toBeUndefined();

		week.clickAmrap(false);

		expect(week.item.variable_targets?.reps?.percent).toBe(80);
		expect(week.item.variable_targets?.reps?.fallback).toBe(8);
	});
});

describe('an emptied box', () => {
	it('asks nothing of a week that prescribes no plain count', () => {
		// 12 rather than the training's 8, so the assertion says which of the two
		// the emptied box left standing.
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 0, reps: 12 },
			base(trainingReps)
		);

		week.typeReps(null);

		expect(week.item.reps).toBe(12);
		expect(week.item.variable_targets).toBeUndefined();
	});

	it('never sends a null fallback under a percentage', () => {
		const week = editor(
			{ type: 'exercise', id: 'item-1', duration: 0, reps: 8 },
			base(trainingReps)
		);

		week.clickPercent(true);
		week.typeReps(null);

		expect(week.item.variable_targets?.reps?.fallback).toBe(1);
	});
});

// The rule the boxes open on decides what every sequence above starts from, so it
// is pinned rather than assumed, on both fields. A week that raised only the
// fallback is the case where the fallback and the plain field differ, and the
// boxes have to read the fallback: it is the number a client without assessment
// data runs, while the plain field is still the training's.
//
// Both fixtures are asymmetric on purpose. Every other fixture in this file opens
// with the fallback equal to the plain field, which makes the rule's preference
// between them invisible, so a mutation to it passes unnoticed.
describe('the rule the boxes open on', () => {
	it('reads the duration fallback, not the plain duration', () => {
		const raisedFallback = editor(
			{
				type: 'exercise',
				id: 'item-1',
				duration: 120,
				reps: 0,
				variable_targets: {
					duration: { assessment_id: 'max-hang', percent: 75, fallback: 30 }
				}
			},
			base(trainingDuration)
		);

		expect(raisedFallback.boxes.durationMin).toBe(0);
		expect(raisedFallback.boxes.durationSec).toBe(30);
	});

	it('reads the reps fallback, not the plain rep count', () => {
		const raisedFallback = editor(
			{
				type: 'exercise',
				id: 'item-1',
				duration: 0,
				reps: 8,
				variable_targets: {
					reps: { assessment_id: 'pull-ups', percent: 80, fallback: 12 }
				}
			},
			base(trainingReps)
		);

		expect(raisedFallback.boxes.repsCount).toBe(12);
	});
});
