import { describe, expect, it } from 'vitest';
import {
	bareKg,
	bodyweightTrend,
	formatChangeKg,
	formatKg,
	TREND_SERIES_LIMIT,
	TREND_WINDOW_DAYS
} from './bodyweight';
import type { Bodyweight } from '$lib/api/client';

const NOW = new Date('2026-09-18T10:00:00Z');

function entry(daysAgo: number, weightKg: number): Bodyweight {
	const measured = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
	return {
		id: `bw-${daysAgo}`,
		user_id: 'user-1',
		weight_kg: weightKg,
		measured_at: measured.toISOString(),
		created_at: measured.toISOString()
	};
}

describe('bodyweightTrend', () => {
	// An athlete who has never weighed themselves has no denominator, which a
	// caller has to say rather than draw as zero.
	it('answers nothing for an empty series', () => {
		expect(bodyweightTrend([], NOW)).toBeNull();
	});

	it('takes the newest measurement as the weight in effect', () => {
		const trend = bodyweightTrend([entry(40, 70), entry(1, 72), entry(10, 71)], NOW);

		expect(trend?.latest.weight_kg).toBe(72);
	});

	it('reads the series whatever order it arrives in', () => {
		const ascending = [entry(40, 70), entry(10, 71), entry(1, 72)];

		expect(bodyweightTrend(ascending, NOW)?.latest.weight_kg).toBe(72);
	});

	it('compares against the newest measurement at least a window old', () => {
		// 35 and 60 days are both outside the window; the trend is about the
		// nearer one, or an athlete who weighs in daily is compared against their
		// very first entry forever.
		const trend = bodyweightTrend([entry(1, 72), entry(35, 70), entry(60, 64)], NOW);

		expect(trend?.previous?.weight_kg).toBe(70);
		expect(trend?.changeKg).toBeCloseTo(2);
	});

	it('reports a loss as a negative change', () => {
		const trend = bodyweightTrend([entry(1, 68), entry(40, 71)], NOW);

		expect(trend?.changeKg).toBeCloseTo(-3);
	});

	// Nothing old enough to compare against is not a change of zero: a coach
	// reading "0.0 kg" would take it for a plateau.
	it('leaves the change out when nothing is old enough to compare', () => {
		const trend = bodyweightTrend([entry(1, 72), entry(5, 71)], NOW);

		expect(trend?.latest.weight_kg).toBe(72);
		expect(trend?.previous).toBeUndefined();
		expect(trend?.changeKg).toBeUndefined();
	});

	it('takes a measurement exactly a window old as the comparison', () => {
		const trend = bodyweightTrend([entry(1, 72), entry(30, 70)], NOW);

		expect(trend?.changeKg).toBeCloseTo(2);
	});

	// The comparison point is the nearest measurement outside the window, which
	// can be much older than the window itself. Whatever says so on screen has
	// to name that date rather than the window.
	it('reports a comparison far older than the window as itself', () => {
		const trend = bodyweightTrend([entry(1, 71), entry(400, 71.02)], NOW);

		expect(trend?.previous?.measured_at).toBe(entry(400, 71.02).measured_at);
		// Under the noise floor, so nothing is shown as a change.
		expect(formatChangeKg(trend!.changeKg!)).toBe('');
	});
});

describe('the series limit', () => {
	// The trend can only compare against a measurement it was given. At the
	// API's default of 60 rows, an athlete weighing in three times a day has a
	// page reaching back 20 days and no comparison point ever lands in it.
	it('covers the window at a realistic weigh-in frequency', () => {
		expect(TREND_SERIES_LIMIT).toBeGreaterThan(TREND_WINDOW_DAYS * 3);
	});
});

describe('formatting', () => {
	it('writes a weight to the precision a scale gives', () => {
		expect(formatKg(71.25)).toBe('71.3 kg');
		expect(formatKg(70)).toBe('70.0 kg');
	});

	// A card whose corner already says kg must not label the number again, the
	// way the assessment cards beside it do not.
	it('leaves the unit off where the card already carries one', () => {
		expect(bareKg(71.25)).toBe('71.3');
		expect(formatChangeKg(1.2)).toBe('+1.2');
	});

	it('signs a change so a gain and a loss read differently', () => {
		expect(formatChangeKg(1.2)).toBe('+1.2');
		expect(formatChangeKg(-1.2)).toBe('-1.2');
	});

	// Scale noise rather than a trend, and a coach should not be shown "+0.0".
	it('says nothing about a change under 50 grams', () => {
		expect(formatChangeKg(0.04)).toBe('');
		expect(formatChangeKg(-0.04)).toBe('');
		expect(formatChangeKg(0)).toBe('');
	});
});
