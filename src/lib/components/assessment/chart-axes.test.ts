import { describe, expect, it } from 'vitest';
import { CRITICAL_FORCE_ID, seriesTokens, testedDays, valueAxisRange } from './chart-axes';

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

	// Wider than six steps, the gap widens to a nice multiple of the span and
	// both ends round out to it, so the top is always labelled. The first two
	// are the ranges review found unlabelled at the top.
	it.each([
		[[22, 53], { min: 20, max: 60, interval: 10 }],
		[[27, 58], { min: 20, max: 60, interval: 10 }],
		[[3, 64], { min: 0, max: 80, interval: 20 }],
		[[22, 78], { min: 20, max: 80, interval: 20 }],
		[[25, 75], { min: 20, max: 80, interval: 20 }]
	])('labels both ends of %j kg, six labels at the most', (values, range) => {
		expect(valueAxisRange(values, 'kilograms', false)).toEqual(range);
		expect((range.max - range.min) / range.interval + 1).toBeLessThanOrEqual(6);
	});

	it('widens the axis for a value just past a step', () => {
		expect(valueAxisRange([20.2, 25.0004], 'kilograms', false)).toEqual({
			min: 20,
			max: 30,
			interval: 5
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
		const criticalForce = seriesTokens(CRITICAL_FORCE_ID);
		expect(maxForce.line).toBe('--tx');
		expect(criticalForce.line).toBe('--bl');
		expect(criticalForce.text).toBe('--bl-tx');
	});

	it('draws a coach assessment in ink', () => {
		expect(seriesTokens('a coach assessment')).toEqual({ line: '--tx', text: '--tx' });
	});
});
