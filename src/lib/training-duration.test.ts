import { describe, expect, it } from 'vitest';
import type { TrainingItem } from '$lib/api/client';
import { formatLength, trainingDurationSeconds } from './training-duration';

function exercise(fields: Partial<TrainingItem> = {}): TrainingItem {
	return { type: 'exercise', exercise_id: 'ex-1', ...fields };
}

// The expected numbers are the ones crimpy-app's trainingDurationSeconds gives
// for the same trees, read with no assessment results.
describe('trainingDurationSeconds', () => {
	it('counts nothing for an empty training', () => {
		expect(trainingDurationSeconds([])).toBe(0);
	});

	it('runs a two handed repeater set after set, resting between them', () => {
		const repeater: TrainingItem = {
			type: 'repeater',
			hand: 'both',
			cycles: 3,
			reps: 6,
			worktime_seconds: 7,
			rest_seconds: 3,
			cycle_rest_seconds: 180
		};
		// 3 x (6 x 7 + 5 x 3) + 2 x 180
		expect(trainingDurationSeconds([repeater])).toBe(531);
	});

	it('hangs both hands in turn on an alternating repeater', () => {
		const repeater: TrainingItem = {
			type: 'repeater',
			hand: 'alternate',
			cycles: 2,
			reps: 2,
			worktime_seconds: 10,
			rest_seconds: 5,
			cycle_rest_seconds: 60
		};
		// a rep is right, rest, left: 25; a set is two reps and a rest: 55
		expect(trainingDurationSeconds([repeater])).toBe(2 * 55 + 60);
	});

	it('splits the cycle rest around the two hands of a split repeater', () => {
		const repeater: TrainingItem = {
			type: 'repeater',
			hand: 'split',
			cycles: 2,
			reps: 3,
			worktime_seconds: 7,
			rest_seconds: 3,
			cycle_rest_seconds: 100
		};
		// a hand's set is 27; the rest between hands is (100 - 27) / 2 rounded down
		expect(trainingDurationSeconds([repeater])).toBe(4 * 27 + 3 * 36);
	});

	it('reads a repeater it is told nothing about with the app defaults', () => {
		expect(trainingDurationSeconds([{ type: 'repeater' }])).toBe(7);
	});

	it('ends a single hang on its rest', () => {
		expect(
			trainingDurationSeconds([{ type: 'hangboard_rep', worktime_seconds: 10, rest_seconds: 5 }])
		).toBe(15);
		expect(trainingDurationSeconds([{ type: 'hangboard_rep' }])).toBe(10);
	});

	it('counts a timed exercise and its rest, and a self paced one by its rest alone', () => {
		expect(trainingDurationSeconds([exercise({ duration: 30, rest_seconds: 60 })])).toBe(90);
		expect(trainingDurationSeconds([exercise({ reps: 8, rest_seconds: 60 })])).toBe(60);
	});

	it('reads a duration set against an assessment as its fallback', () => {
		const relative = exercise({
			duration: 10,
			variable_targets: { duration: { assessment_id: 'a-1', percent: 80, fallback: 45.4 } }
		});
		expect(trainingDurationSeconds([relative])).toBe(45);

		const noFallback = exercise({
			duration: 10,
			variable_targets: { duration: { assessment_id: 'a-1', percent: 80, fallback: 0 } }
		});
		expect(trainingDurationSeconds([noFallback])).toBe(0);
	});

	it('ignores a duration target that names no assessment, as the app drops it', () => {
		const unnamed = exercise({
			duration: 10,
			variable_targets: { duration: { assessment_id: '', percent: 80, fallback: 45 } }
		});
		expect(trainingDurationSeconds([unnamed])).toBe(10);
	});

	it('counts a timed note', () => {
		expect(trainingDurationSeconds([{ type: 'free', free_text: 'Breathe', duration: 30 }])).toBe(
			30
		);
		expect(trainingDurationSeconds([{ type: 'free', free_text: 'Breathe' }])).toBe(0);
	});

	it('lays a group out item after item', () => {
		const group: TrainingItem = {
			type: 'group',
			items: [exercise({ duration: 30 }), { type: 'hangboard_rep', rest_seconds: 0 }]
		};
		expect(trainingDurationSeconds([group])).toBe(37);
	});

	it('lets a circuit rest stand for the rest its child ends on', () => {
		const circuit: TrainingItem = {
			type: 'circuit',
			cycles: 3,
			rest_seconds: 15,
			cycle_rest_seconds: 120,
			items: [exercise({ duration: 40, rest_seconds: 20 }), exercise({ duration: 30 })]
		};
		// each round: 40, the circuit's 15 in place of the exercise's 20, 30
		expect(trainingDurationSeconds([circuit])).toBe(3 * 85 + 2 * 120);
	});

	it('keeps the rest a child ends on when the circuit sets none', () => {
		const circuit: TrainingItem = {
			type: 'circuit',
			cycles: 2,
			rest_seconds: 0,
			cycle_rest_seconds: 0,
			items: [exercise({ duration: 40, rest_seconds: 20 }), exercise({ duration: 30 })]
		};
		expect(trainingDurationSeconds([circuit])).toBe(2 * 90);
	});

	it('fills every emom round up to its interval', () => {
		const emom: TrainingItem = {
			type: 'emom',
			cycles: 4,
			interval_seconds: 60,
			items: [exercise({ duration: 20 }), exercise({ reps: 5 })]
		};
		expect(trainingDurationSeconds([emom])).toBe(240);
	});

	it('lets an emom round that overruns its interval start the next one at once', () => {
		const emom: TrainingItem = {
			type: 'emom',
			cycles: 2,
			interval_seconds: 60,
			items: [exercise({ duration: 90 })]
		};
		expect(trainingDurationSeconds([emom])).toBe(180);
	});

	it('lets a circuit rest stand for the interval rest an emom ends on', () => {
		const circuit: TrainingItem = {
			type: 'circuit',
			cycles: 2,
			cycle_rest_seconds: 30,
			items: [
				{
					type: 'emom',
					cycles: 2,
					interval_seconds: 60,
					items: [exercise({ duration: 20 })]
				}
			]
		};
		// first round of the circuit: 20 + 40 + 20, then its 30 for the last 40
		expect(trainingDurationSeconds([circuit])).toBe(110 + 120);
	});
});

describe('formatLength', () => {
	it('writes a length the way the app does', () => {
		expect(formatLength(0)).toBe('0 min');
		expect(formatLength(45)).toBe('45s');
		expect(formatLength(59)).toBe('59s');
		expect(formatLength(60)).toBe('1 min');
		expect(formatLength(89)).toBe('1 min');
		expect(formatLength(90)).toBe('2 min');
		expect(formatLength(1560)).toBe('26 min');
		expect(formatLength(3600)).toBe('1 h');
		expect(formatLength(5400)).toBe('1 h 30 min');
		expect(formatLength(-5)).toBe('0 min');
	});
});
