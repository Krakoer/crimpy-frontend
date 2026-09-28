import { describe, expect, it } from 'vitest';
import { seriesTokens, testedDays, valueAxisRange } from './chart-axes';

describe('valueAxisRange', () => {
	// The chart of Krakoer/crimpy#164: 20.8 and 20.9 kg on a 0.2 kg axis.
	it('never zooms a kilogram chart under five kilograms', () => {
		expect(valueAxisRange([20.8, 20.9], 'kilograms', false)).toEqual({
			min: 20,
			max: 25,
			interval: 1
		});
	});

	it('rounds a wider series out to the step on both ends', () => {
		expect(valueAxisRange([22.4, 31.2], 'kilograms', false)).toEqual({
			min: 20,
			max: 35,
			interval: 5
		});
	});

	it('keeps a series sitting on a step at least a step wide', () => {
		expect(valueAxisRange([25, 25], 'kilograms', false)).toEqual({ min: 25, max: 30, interval: 1 });
	});

	it('spans ten seconds and five repetitions at the least', () => {
		expect(valueAxisRange([41, 43], 'seconds', false)).toEqual({ min: 40, max: 50, interval: 2 });
		expect(valueAxisRange([12, 13], 'repetitions', false)).toEqual({
			min: 10,
			max: 15,
			interval: 1
		});
	});

	it('spans a tenth of a ratio at the least', () => {
		expect(valueAxisRange([1.23, 1.25], 'kilograms', true)).toEqual({
			min: 1.2,
			max: 1.3,
			interval: 0.02
		});
	});

	it('keeps a wide axis to six labels at the most', () => {
		expect(valueAxisRange([22, 78], 'kilograms', false)).toEqual({
			min: 20,
			max: 80,
			interval: 10
		});
	});

	it('never starts under zero', () => {
		expect(valueAxisRange([0, 2], 'kilograms', false)).toEqual({ min: 0, max: 5, interval: 1 });
	});

	it('has no range without values', () => {
		expect(valueAxisRange([], 'kilograms', false)).toBeNull();
	});
});

describe('testedDays', () => {
	it('counts two tests on one day as one', () => {
		expect(
			testedDays([new Date(2026, 9, 4, 9).getTime(), new Date(2026, 9, 4, 18).getTime()])
		).toBe(1);
	});

	it('counts tests on different days apart', () => {
		expect(testedDays([new Date(2026, 9, 4).getTime(), new Date(2026, 9, 5).getTime()])).toBe(2);
	});
});

describe('seriesTokens', () => {
	it('draws max and critical force in two hues', () => {
		const maxForce = seriesTokens('f7954158-63ba-4f0b-a125-6ef195fa6442');
		const criticalForce = seriesTokens('55970ac0-4544-4945-80cd-4841f7c58fe5');
		expect(maxForce.line).toBe('--tx');
		expect(criticalForce.line).toBe('--bl');
		expect(criticalForce.text).toBe('--bl-tx');
	});

	it('draws a coach assessment in ink', () => {
		expect(seriesTokens('a coach assessment')).toEqual({ line: '--tx', text: '--tx' });
	});
});
