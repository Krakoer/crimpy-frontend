import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	CRITICAL_FORCE_ID,
	dateLabelInterval,
	dayAt,
	dayOffset,
	seriesTokens,
	testedDays,
	valueAxisRange
} from './chart-axes';

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

	// 1.2 / 0.1 is 11.999999999999998 in doubles: a ratio sitting on a tenth
	// has to stay the floor rather than widen the axis a whole step.
	it('keeps a ratio sitting on a tenth as the floor', () => {
		expect(valueAxisRange([1.2, 1.25], 'kilograms', true)).toEqual({
			min: 1.2,
			max: 1.3,
			interval: 0.02
		});
		expect(valueAxisRange([1.4, 1.45], 'kilograms', true)).toEqual({
			min: 1.4,
			max: 1.5,
			interval: 0.02
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

describe('the date axis', () => {
	// The clock change tests only cross one in a zone that has them on these
	// dates, so the zone is pinned for this block. That takes effect because
	// vite.config.ts runs the unit tests in forked processes, where Node reads
	// TZ afresh on every change to it; a worker thread would keep its zone.
	const runnerZone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = 'Europe/Paris';
	});
	afterAll(() => {
		if (runnerZone === undefined) delete process.env.TZ;
		else process.env.TZ = runnerZone;
	});

	it('runs in a zone with a clock change', () => {
		const winter = new Date(2026, 0, 15).getTimezoneOffset();
		const summer = new Date(2026, 6, 15).getTimezoneOffset();
		expect(winter).not.toBe(summer);
	});

	const at = (year: number, month: number, day: number, hour = 12) =>
		new Date(year, month - 1, day, hour).getTime();
	const labels = (first: number, last: number) => {
		const span = dayOffset(first, last);
		const interval = dateLabelInterval(span);
		const out: string[] = [];
		for (let offset = 0; offset <= span; offset += interval) {
			const day = dayAt(first, offset);
			out.push(`${day.getMonth() + 1}/${day.getDate()}`);
		}
		return out;
	};

	it('divides a span evenly so its last day is labelled', () => {
		expect(dateLabelInterval(8)).toBe(2);
		expect(dateLabelInterval(9)).toBe(3);
		expect(dateLabelInterval(2)).toBe(1);
	});

	it('labels only the two ends of a span nothing divides', () => {
		expect(dateLabelInterval(7)).toBe(7);
		expect(dateLabelInterval(1)).toBe(1);
	});

	// The ranges review found mislabelled on the app's former date axis: a
	// 44 day span from the 15th, and spans over the autumn and spring clock
	// changes. Counted and written by calendar day, so they hold in any zone.
	it('labels both ends of a 44 day span from the 15th', () => {
		expect(labels(at(2026, 5, 15), at(2026, 6, 28))).toEqual([
			'5/15',
			'5/26',
			'6/6',
			'6/17',
			'6/28'
		]);
	});

	it('labels both ends across the autumn clock change', () => {
		expect(labels(at(2026, 10, 12, 9), at(2026, 11, 1, 20))).toEqual([
			'10/12',
			'10/17',
			'10/22',
			'10/27',
			'11/1'
		]);
	});

	it('labels both ends across the spring clock change', () => {
		expect(labels(at(2026, 3, 16, 1), at(2026, 4, 5, 23))).toEqual([
			'3/16',
			'3/21',
			'3/26',
			'3/31',
			'4/5'
		]);
	});
});
