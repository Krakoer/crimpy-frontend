import { describe, expect, it } from 'vitest';
import type { WeeklyTrainingLoad } from '$lib/api/client';
import {
	ACUTE_LOAD_BANDS,
	LOAD_CHANGE_BANDS,
	NO_VALUE,
	RATIO_BANDS,
	bandFor,
	chronicBaselineNote,
	climbingShare,
	formatLoad,
	formatMinutes,
	formatPercent,
	formatRatio,
	formatRpe,
	ratingCoverage
} from './training-load';

function week(overrides: Partial<WeeklyTrainingLoad> = {}): WeeklyTrainingLoad {
	return {
		week_start: '2026-09-14',
		week_number: null,
		program_name: null,
		session_count: 0,
		total_minutes: 0,
		climbing_minutes: 0,
		strength_minutes: 0,
		rated_sessions: 0,
		failed_sessions: 0,
		mean_rpe: null,
		acute_load: 0,
		chronic_load: null,
		chronic_weeks: 0,
		acute_chronic_ratio: null,
		load_change_percent: null,
		...overrides
	};
}

describe('bandFor', () => {
	it('places the AL:CL values the sheet names', () => {
		expect(bandFor(RATIO_BANDS, 0.5)?.label).toBe('Undertraining');
		expect(bandFor(RATIO_BANDS, 0.8)?.label).toBe('Optimal workload');
		expect(bandFor(RATIO_BANDS, 1.29)?.label).toBe('Optimal workload');
		expect(bandFor(RATIO_BANDS, 1.5)?.label).toBe('Danger zone');
		expect(bandFor(RATIO_BANDS, 2.4)?.label).toBe('Danger zone');
	});

	it('keeps the range the sheet never labelled out of both its neighbours', () => {
		// The gap between the sheet's "0.8 to 1.3 optimal" and its "> 1.5 danger".
		// Reading it as either would be Crimpy answering a question the coach's
		// reference does not, so it is its own band and says so.
		for (const value of [1.3, 1.35, 1.49]) {
			const band = bandFor(RATIO_BANDS, value);
			expect(band?.tone).toBe('unlabelled');
			expect(band?.label).toBe('Not labelled by the sheet');
		}
	});

	it('tiles the AL:CL scale with no value falling through', () => {
		for (const value of [0, 0.79, 0.8, 1.3, 1.5, 3]) {
			expect(bandFor(RATIO_BANDS, value)).not.toBeNull();
		}
	});

	it('places the acute load and week on week bands', () => {
		expect(bandFor(ACUTE_LOAD_BANDS, 1999)?.label).toBe('Undertraining');
		expect(bandFor(ACUTE_LOAD_BANDS, 2000)?.label).toBe('Optimal');
		expect(bandFor(ACUTE_LOAD_BANDS, 4000)?.label).toBe('Danger zone');

		expect(bandFor(LOAD_CHANGE_BANDS, 89)?.label).toBe('Deload or undertraining');
		expect(bandFor(LOAD_CHANGE_BANDS, 95)?.label).toBe('Maintaining');
		expect(bandFor(LOAD_CHANGE_BANDS, 105)?.label).toBe('Optimal progression');
		expect(bandFor(LOAD_CHANGE_BANDS, 111)?.label).toBe('Danger zone');
	});

	it('gives no band at all to a figure that is missing', () => {
		expect(bandFor(RATIO_BANDS, null)).toBeNull();
		expect(bandFor(ACUTE_LOAD_BANDS, null)).toBeNull();
	});
});

describe('formatting', () => {
	it('renders a missing figure as a gap rather than a zero', () => {
		expect(formatLoad(null)).toBe(NO_VALUE);
		expect(formatRatio(null)).toBe(NO_VALUE);
		expect(formatRpe(null)).toBe(NO_VALUE);
		expect(formatPercent(null)).toBe(NO_VALUE);
	});

	it('keeps a real zero as a zero', () => {
		expect(formatLoad(0)).toBe('0');
		expect(formatRatio(0)).toBe('0.00');
	});

	it('renders loads, ratios and durations the way the coach reads them', () => {
		expect(formatLoad(2047.5)).toBe('2,048');
		expect(formatRatio(1.3421)).toBe('1.34');
		expect(formatRpe(6.666666)).toBe('6.7');
		expect(formatPercent(143.7)).toBe('144%');
		expect(formatMinutes(45)).toBe('45m');
		expect(formatMinutes(120)).toBe('2h');
		expect(formatMinutes(195)).toBe('3h15');
	});
});

describe('climbingShare', () => {
	it('splits the climbing and strength minutes', () => {
		expect(climbingShare(week({ climbing_minutes: 90, strength_minutes: 30 }))).toBeCloseTo(0.75);
	});

	it('answers nothing when neither side has any minutes', () => {
		// A week of stretching alone is not 0% climbing, it is a week the split
		// says nothing about.
		expect(climbingShare(week({ total_minutes: 30 }))).toBeNull();
	});
});

describe('ratingCoverage', () => {
	it('says how much of the week the mean speaks for', () => {
		expect(ratingCoverage(week({ session_count: 4, rated_sessions: 4 }))).toBe('4 of 4 rated');
	});

	it('names the failed and the unrated sessions rather than folding them in', () => {
		const text = ratingCoverage(week({ session_count: 4, rated_sessions: 2, failed_sessions: 1 }));
		expect(text).toContain('2 of 4 rated');
		expect(text).toContain('1 ECHEC, outside the mean');
		expect(text).toContain('1 not rated, outside the mean');
	});

	it('says so when there is nothing to average', () => {
		expect(ratingCoverage(week())).toBe('No sessions');
	});
});

describe('chronicBaselineNote', () => {
	it('warns that a first week divides by itself', () => {
		const note = chronicBaselineNote(week({ chronic_load: 900, chronic_weeks: 1 }));
		expect(note).toContain('1.00 by construction');
	});

	it('names a short baseline', () => {
		expect(chronicBaselineNote(week({ chronic_load: 900, chronic_weeks: 2 }))).toBe(
			'Baseline is 2 weeks rather than 3.'
		);
	});

	it('says nothing once the baseline is the full three weeks', () => {
		expect(chronicBaselineNote(week({ chronic_load: 900, chronic_weeks: 3 }))).toBeNull();
	});

	it('says there is no history behind a week that has none', () => {
		expect(chronicBaselineNote(week())).toBe('No history behind this week yet.');
	});
});
