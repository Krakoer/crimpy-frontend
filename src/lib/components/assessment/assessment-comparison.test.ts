import { describe, expect, it } from 'vitest';
import type {
	AssessmentResponse,
	AssessmentSnapshot,
	AssessmentSnapshotResult
} from '$lib/api/client';
import { formatUnitValue } from '$lib/assessments';
import {
	bodyweightScore,
	compareSnapshots,
	formatPercent,
	formatScore,
	testedDays
} from './assessment-comparison';

function result(overrides: Partial<AssessmentSnapshotResult> = {}): AssessmentSnapshotResult {
	return {
		assessment_id: 'a1',
		label: 'Weighted hang 20mm',
		unit: 'kilograms',
		per_hand: false,
		bodyweight_relative: false,
		grip_position: 0,
		right_value: 25,
		right_measured_at: '2026-03-02T10:00:00Z',
		...overrides
	};
}

/** A result with the weight it was pulled at, as the snapshot returns it, weighed
 *  the day the value was measured so the denominator is never the stale one. */
function weighed(
	overrides: Partial<AssessmentSnapshotResult>,
	bodyweightKg: number
): AssessmentSnapshotResult {
	const measured = result({ bodyweight_relative: true, ...overrides });
	return {
		...measured,
		right_bodyweight_kg: bodyweightKg,
		right_bodyweight_measured_at: measured.right_measured_at,
		left_bodyweight_kg: bodyweightKg,
		left_bodyweight_measured_at: measured.left_measured_at ?? measured.right_measured_at
	};
}

function snapshot(
	date: string,
	results: AssessmentSnapshotResult[],
	bodyweightKg?: number
): AssessmentSnapshot {
	return { date, results, bodyweight_kg: bodyweightKg ?? null };
}

function record(sessionDate: string): AssessmentResponse {
	return {
		id: sessionDate,
		user_id: 'u1',
		assessment_id: 'a1',
		label: 'Weighted hang 20mm',
		unit: 'kilograms',
		per_hand: false,
		bodyweight_relative: false,
		right_value: 25,
		left_value: null,
		session_id: 's1',
		updated_at: sessionDate,
		session_date: sessionDate
	};
}

describe('testedDays', () => {
	it('lists the distinct UTC days an athlete tested on, newest first', () => {
		const days = testedDays([
			record('2026-03-02T10:00:00Z'),
			record('2026-06-02T18:00:00Z'),
			record('2026-03-02T19:00:00Z')
		]);
		expect(days).toEqual(['2026-06-02', '2026-03-02']);
	});

	it('answers nothing for an athlete with no results', () => {
		expect(testedDays([])).toEqual([]);
	});
});

describe('bodyweightScore', () => {
	it('is the whole load over the bodyweight', () => {
		expect(bodyweightScore(25, 71)).toBeCloseTo(1.3521, 4);
		expect(bodyweightScore(0, 71)).toBe(1);
	});
});

describe('compareSnapshots', () => {
	it('reads an absolute result as its own number and gives the change', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [result({ right_value: 13 })]),
			snapshot('2026-06-02T23:59:59Z', [
				result({ right_value: 17, right_measured_at: '2026-06-02T10:00:00Z' })
			])
		);
		expect(rows).toHaveLength(1);
		const hand = rows[0].hands[0];
		expect(hand.hand).toBe('single');
		expect(hand.before?.score).toBe(13);
		expect(hand.after?.score).toBe(17);
		expect(hand.delta).toBe(4);
		expect(hand.percent).toBeCloseTo(30.77, 2);
	});

	it('reads a bodyweight relative result as a ratio to the weight of the day', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [weighed({ right_value: 25 }, 71)], 71),
			snapshot(
				'2026-06-02T23:59:59Z',
				[weighed({ right_value: 28, right_measured_at: '2026-06-02T10:00:00Z' }, 71)],
				71
			)
		);
		const hand = rows[0].hands[0];
		expect(hand.before?.score).toBeCloseTo(1.352, 3);
		expect(hand.after?.score).toBeCloseTo(1.394, 3);
		expect(hand.before?.bodyweightKg).toBe(71);
		// The raw kilograms are kept beside the ratio: nothing derived replaces
		// what was actually measured.
		expect(hand.before?.raw).toBe(25);
		expect(hand.percent).toBeCloseTo(3.12, 2);
	});

	it('refuses to score a ratio with no weight on file that day', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [result({ bodyweight_relative: true })]),
			snapshot(
				'2026-06-02T23:59:59Z',
				[weighed({ right_measured_at: '2026-06-02T10:00:00Z' }, 71)],
				71
			)
		);
		const hand = rows[0].hands[0];
		expect(hand.before?.score).toBeUndefined();
		expect(hand.before?.raw).toBe(25);
		expect(hand.delta).toBeUndefined();
		expect(hand.percent).toBeUndefined();
	});

	it('says a test was measured on only one of the two dates rather than falling to zero', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', []),
			snapshot('2026-06-02T23:59:59Z', [
				result({ right_value: 17, right_measured_at: '2026-06-02T10:00:00Z' })
			])
		);
		const hand = rows[0].hands[0];
		expect(hand.before).toBeUndefined();
		expect(hand.after?.score).toBe(17);
		expect(hand.delta).toBeUndefined();
		expect(hand.percent).toBeUndefined();
	});

	it('marks a value the snapshot carried forward rather than calling it stable', () => {
		const carried = result({ right_value: 25, right_measured_at: '2026-03-02T10:00:00Z' });
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [carried]),
			snapshot('2026-06-02T23:59:59Z', [carried])
		);
		const hand = rows[0].hands[0];
		expect(hand.unchanged).toBe(true);
		expect(hand.delta).toBeUndefined();
	});

	it('keeps the two hands apart on a per hand assessment', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [
				result({
					per_hand: true,
					right_value: 3,
					left_value: 1,
					left_measured_at: '2026-03-02T10:00:00Z'
				})
			]),
			snapshot('2026-06-02T23:59:59Z', [
				result({
					per_hand: true,
					right_value: 4.5,
					right_measured_at: '2026-06-02T10:00:00Z',
					left_value: 4,
					left_measured_at: '2026-06-02T10:00:00Z'
				})
			])
		);
		expect(rows[0].hands.map((h) => h.hand)).toEqual(['left', 'right']);
		expect(rows[0].hands[0].delta).toBe(3);
		expect(rows[0].hands[1].delta).toBeCloseTo(1.5, 5);
	});

	it('keeps one row per grip, since two edges are two tests', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [
				result({ grip_position: 0, right_value: 25 }),
				result({ grip_position: 1, right_value: 10 })
			]),
			snapshot('2026-06-02T23:59:59Z', [
				result({
					grip_position: 0,
					right_value: 28,
					right_measured_at: '2026-06-02T10:00:00Z'
				}),
				// The June snapshot still carries the edge nothing was measured on
				// since March, dated to when it actually was.
				result({ grip_position: 1, right_value: 10 })
			])
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.gripPosition)).toEqual([0, 1]);
		expect(rows[0].hands[0].delta).toBe(3);
		expect(rows[1].hands[0].unchanged).toBe(true);
		expect(rows[1].hands[0].delta).toBeUndefined();
	});

	// A hand the athlete never did on either date would otherwise render a line
	// reading "not measured" against "not measured", forever.
	it('drops a hand that was never measured on either date', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [
				result({ per_hand: true, right_value: 3, left_value: null, left_measured_at: null })
			]),
			snapshot('2026-06-02T23:59:59Z', [
				result({
					per_hand: true,
					right_value: 4.5,
					right_measured_at: '2026-06-02T10:00:00Z',
					left_value: null,
					left_measured_at: null
				})
			])
		);
		expect(rows[0].hands.map((h) => h.hand)).toEqual(['right']);
	});

	it('takes the label and the flag as the later date reads them', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [weighed({ label: 'Old name' }, 71)], 71),
			snapshot(
				'2026-06-02T23:59:59Z',
				[weighed({ label: 'New name', right_measured_at: '2026-06-02T10:00:00Z' }, 71)],
				71
			)
		);
		expect(rows[0].label).toBe('New name');
		expect(rows[0].bodyweightRelative).toBe(true);
		// So the older side is scored as a ratio too, rather than one date
		// reading as kilograms and the other as a ratio.
		expect(rows[0].hands[0].before?.bodyweightKg).toBe(71);
	});

	// A result the snapshot carried forward was pulled at the weight of the day it
	// was measured. Dividing it by the weight of the date asked for prints a ratio
	// the athlete never achieved, and reports a progression that did not happen.
	it('scores a carried forward value against the weight it was pulled at', () => {
		const carried = weighed({ right_value: 25, right_measured_at: '2026-01-08T10:00:00Z' }, 65);
		const rows = compareSnapshots(
			// The athlete weighs 71 on the date asked for, but the hang is from
			// January, when they weighed 65.
			snapshot('2026-03-02T23:59:59Z', [carried], 71),
			snapshot(
				'2026-06-02T23:59:59Z',
				[weighed({ right_value: 28, right_measured_at: '2026-06-02T10:00:00Z' }, 71)],
				71
			)
		);
		const hand = rows[0].hands[0];
		expect(hand.before?.bodyweightKg).toBe(65);
		expect(hand.before?.score).toBeCloseTo(1.385, 3);
		expect(hand.after?.score).toBeCloseTo(1.394, 3);
		expect(hand.percent).toBeCloseTo(0.7, 2);
	});

	// The same measurement on both sides is one ratio, whatever the athlete
	// weighed on the two dates, or an untouched test reads as a drop.
	it('gives one unchanged measurement the same ratio on both dates', () => {
		const carried = weighed({ right_value: 22, right_measured_at: '2026-03-02T10:00:00Z' }, 71);
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [carried], 71),
			snapshot('2026-06-02T23:59:59Z', [carried], 75)
		);
		const hand = rows[0].hands[0];
		expect(hand.unchanged).toBe(true);
		expect(hand.before?.score).toBe(hand.after?.score);
		expect(hand.before?.bodyweightKg).toBe(71);
		expect(hand.after?.bodyweightKg).toBe(71);
	});

	// The two hands can come from sessions months apart, so each carries its own
	// denominator.
	it('weighs each hand on its own date', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [
				result({
					per_hand: true,
					bodyweight_relative: true,
					right_value: 20,
					right_bodyweight_kg: 71,
					right_bodyweight_measured_at: '2026-03-02T08:00:00Z',
					left_value: 19,
					left_measured_at: '2026-03-02T10:00:00Z',
					left_bodyweight_kg: 71,
					left_bodyweight_measured_at: '2026-03-02T08:00:00Z'
				})
			]),
			snapshot('2026-06-02T23:59:59Z', [
				result({
					per_hand: true,
					bodyweight_relative: true,
					right_value: 22,
					right_measured_at: '2026-06-02T10:00:00Z',
					right_bodyweight_kg: 75,
					right_bodyweight_measured_at: '2026-06-02T08:00:00Z',
					left_value: 19,
					left_measured_at: '2026-03-02T10:00:00Z',
					left_bodyweight_kg: 71,
					left_bodyweight_measured_at: '2026-03-02T08:00:00Z'
				})
			])
		);
		const [left, right] = rows[0].hands;
		expect(right.after?.bodyweightKg).toBe(75);
		expect(left.after?.bodyweightKg).toBe(71);
		expect(left.unchanged).toBe(true);
	});

	// The comparison panel reads a denominator by the same rule as the cards
	// above it: past the staleness window, there is no ratio, and the panel says
	// so rather than dividing by a weight from another month.
	it('declines a ratio when the weigh-in is older than the staleness window', () => {
		const stale = result({
			bodyweight_relative: true,
			right_value: 25,
			right_measured_at: '2026-03-02T10:00:00Z',
			right_bodyweight_kg: 71,
			right_bodyweight_measured_at: '2026-01-20T08:00:00Z'
		});
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [stale]),
			snapshot('2026-06-02T23:59:59Z', [
				weighed({ right_value: 28, right_measured_at: '2026-06-02T10:00:00Z' }, 71)
			])
		);
		const hand = rows[0].hands[0];
		expect(hand.before?.score).toBeUndefined();
		expect(hand.before?.missingRatio).toBe('stale');
		expect(hand.before?.raw).toBe(25);
		expect(hand.after?.score).toBeCloseTo(1.394, 3);
		expect(hand.delta).toBeUndefined();
	});

	it('names an absent weigh-in apart from a stale one', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [result({ bodyweight_relative: true })]),
			snapshot('2026-06-02T23:59:59Z', [
				weighed({ right_value: 28, right_measured_at: '2026-06-02T10:00:00Z' }, 71)
			])
		);
		expect(rows[0].hands[0].before?.missingRatio).toBe('no-weigh-in');
	});

	// The weigh-in date travels with the weight so the panel can print it. A
	// ratio a coach cannot date is one they cannot check.
	it('carries the day the denominator was weighed', () => {
		const rows = compareSnapshots(
			snapshot('2026-03-02T23:59:59Z', [
				weighed({ right_value: 25, right_measured_at: '2026-03-02T10:00:00Z' }, 71)
			]),
			snapshot('2026-06-02T23:59:59Z', [
				weighed({ right_value: 28, right_measured_at: '2026-06-02T10:00:00Z' }, 71)
			])
		);
		expect(rows[0].hands[0].before?.weighedAt).toBe('2026-03-02T10:00:00Z');
		expect(rows[0].hands[0].after?.weighedAt).toBe('2026-06-02T10:00:00Z');
	});
});

describe('formatScore', () => {
	it('prints a ratio to two decimals and a load to one', () => {
		expect(
			formatScore({ raw: 25, measuredAt: 'x', score: 1.3521, bodyweightKg: 71 }, 'kilograms')
		).toBe('1.35');
		expect(formatScore({ raw: 25, measuredAt: 'x', score: 25 }, 'kilograms')).toBe('25.0');
		expect(formatScore({ raw: 17, measuredAt: 'x', score: 17 }, 'repetitions')).toBe('17');
		// A ratio that had to be declined falls back to the load it was going to be
		// built from, which is a number the athlete really pulled. A dash would
		// hide it, and the cell beside it already says why there is no ratio.
		expect(formatScore({ raw: 25, measuredAt: 'x' }, 'kilograms')).toBe('25.0');
	});

	// A half second is a real result, and rounding it away would print the same
	// number in both columns beside a progression saying they differ. The rule is
	// formatUnitValue's, so the cards above the table print it the same way.
	it('keeps a fractional second rather than rounding it into a contradiction', () => {
		expect(formatScore({ raw: 4.4, measuredAt: 'x', score: 4.4 }, 'seconds')).toBe('4.4');
		expect(formatScore({ raw: 8.5, measuredAt: 'x', score: 8.5 }, 'seconds')).toBe('8.5');
		expect(formatScore({ raw: 4, measuredAt: 'x', score: 4 }, 'seconds')).toBe('4');
		expect(formatScore({ raw: 8.5, measuredAt: 'x', score: 8.5 }, 'seconds')).toBe(
			formatUnitValue(8.5, 'seconds')
		);
	});
});

describe('formatPercent', () => {
	it('signs a change and calls scale noise stable', () => {
		expect(formatPercent(30.77)).toBe('+30.8 %');
		expect(formatPercent(-4.2)).toBe('-4.2 %');
		expect(formatPercent(0.01)).toBe('stable');
	});
});
