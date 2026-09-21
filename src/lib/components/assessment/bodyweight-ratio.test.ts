import { describe, expect, it } from 'vitest';
import type { AssessmentResponse } from '$lib/api/client';
import {
	bodyweightScore,
	formatDenominatorNote,
	formatRatio,
	formatRatioBasis,
	missingRatioLabel,
	readBodyweightRatio,
	readDenominator,
	readingLabel,
	readRecordDenominator,
	readRecordRatio,
	STALE_DENOMINATOR_DAYS
} from './bodyweight-ratio';

const MEASURED = '2026-03-02T10:00:00Z';

function daysBefore(iso: string, days: number): string {
	return new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString().replace('.000', '');
}

function record(overrides: Partial<AssessmentResponse> = {}): AssessmentResponse {
	return {
		id: 'r1',
		user_id: 'u1',
		assessment_id: 'a1',
		label: 'Weighted hang 20mm',
		unit: 'kilograms',
		per_hand: false,
		bodyweight_relative: true,
		right_value: 25,
		left_value: null,
		session_id: 's1',
		updated_at: MEASURED,
		session_date: MEASURED,
		bodyweight_kg: 71,
		bodyweight_measured_at: MEASURED,
		...overrides
	};
}

describe('bodyweightScore', () => {
	it('is the whole load over the bodyweight', () => {
		expect(bodyweightScore(25, 71)).toBeCloseTo(1.3521, 4);
		expect(bodyweightScore(0, 71)).toBe(1);
	});
});

describe('readDenominator', () => {
	it('divides by a weigh-in taken the same day as the result', () => {
		const reading = readDenominator(MEASURED, 71, MEASURED);
		expect(reading.bodyweightKg).toBe(71);
		expect(reading.weighedAt).toBe(MEASURED);
		expect(reading.missing).toBeUndefined();
	});

	// The window is thirty days, and it is written out here rather than derived
	// from the constant: a test that moves with the number it is checking says
	// nothing about where the boundary falls, only that it is consistent with
	// itself.
	it('cuts the window at thirty days', () => {
		expect(STALE_DENOMINATOR_DAYS).toBe(30);
	});

	// Both sides of it, because a boundary tested only in the middle pins nothing
	// about where it actually is.
	it('still divides by a weigh-in twenty nine days before the result', () => {
		const reading = readDenominator(MEASURED, 71, daysBefore(MEASURED, 29));
		expect(reading.bodyweightKg).toBe(71);
		expect(reading.missing).toBeUndefined();
	});

	it('still divides by a weigh-in exactly thirty days before the result', () => {
		const reading = readDenominator(MEASURED, 71, daysBefore(MEASURED, 30));
		expect(reading.bodyweightKg).toBe(71);
		expect(reading.missing).toBeUndefined();
	});

	it('refuses a weigh-in thirty one days before the result', () => {
		const reading = readDenominator(MEASURED, 71, daysBefore(MEASURED, 31));
		expect(reading.bodyweightKg).toBeUndefined();
		expect(reading.weighedAt).toBeUndefined();
		expect(reading.missing).toBe('stale');
	});

	// The server widens to a weigh-in later the same day when nothing precedes
	// the result. A negative gap is not a stale denominator.
	it('divides by a weigh-in taken after the result on the same day', () => {
		const reading = readDenominator(MEASURED, 71, '2026-03-02T19:30:00Z');
		expect(reading.bodyweightKg).toBe(71);
		expect(reading.missing).toBeUndefined();
	});

	it('has no denominator when no weigh-in was sent', () => {
		expect(readDenominator(MEASURED, null, null).missing).toBe('no-weigh-in');
		expect(readDenominator(MEASURED, undefined, undefined).missing).toBe('no-weigh-in');
	});

	// A zero is the sentinel the query answers with when nothing qualifies, and
	// the column's own check keeps a real weight strictly above it.
	it('treats a zero weight as no weigh-in rather than as a denominator', () => {
		expect(readDenominator(MEASURED, 0, MEASURED).missing).toBe('no-weigh-in');
	});

	// Half a weigh-in cannot be shown to be recent, so it is not divided by.
	it('refuses a weight that arrived without its day', () => {
		expect(readDenominator(MEASURED, 71, null).missing).toBe('no-weigh-in');
	});
});

describe('readBodyweightRatio', () => {
	it('leaves an assessment that does not read as a ratio as its own number', () => {
		const reading = readBodyweightRatio(25, MEASURED, false, 71, MEASURED);
		expect(reading.raw).toBe(25);
		expect(reading.ratio).toBeUndefined();
		expect(reading.missing).toBeUndefined();
	});

	it('reads a weighted result as the whole load over the bodyweight', () => {
		const reading = readBodyweightRatio(25, MEASURED, true, 71, MEASURED);
		expect(reading.ratio).toBeCloseTo(1.3521, 4);
		expect(reading.bodyweightKg).toBe(71);
		expect(reading.weighedAt).toBe(MEASURED);
	});

	// The measurement is never replaced by what was derived from it: a ratio the
	// coach cannot check against a load is a number they have to take on trust.
	it('keeps the raw load when the ratio is declined', () => {
		const reading = readBodyweightRatio(25, MEASURED, true, 71, daysBefore(MEASURED, 31));
		expect(reading.raw).toBe(25);
		expect(reading.ratio).toBeUndefined();
		expect(reading.bodyweightKg).toBeUndefined();
		expect(reading.missing).toBe('stale');
	});
});

describe('readRecordRatio', () => {
	it('reads a record against the weigh-in that travels with it', () => {
		const reading = readRecordRatio(record(), 25);
		expect(reading?.ratio).toBeCloseTo(1.3521, 4);
	});

	// The session date is what the server picked the weigh-in for, so it is what
	// the staleness is measured against, not the day the row was written. An
	// assessment logged after the fact, or synced late, still belongs where the
	// athlete did it, and the row was written at the weigh-in's own moment here
	// so reading the wrong field would call this denominator fresh.
	it('measures staleness from the session date rather than the row update', () => {
		const weighedAt = daysBefore(MEASURED, 31);
		const stale = record({
			session_date: MEASURED,
			bodyweight_measured_at: weighedAt,
			updated_at: weighedAt
		});
		expect(readRecordRatio(stale, 25)?.missing).toBe('stale');
	});

	it('has nothing to read for a hand that was never measured', () => {
		expect(readRecordRatio(record(), null)).toBeNull();
		expect(readRecordRatio(record(), undefined)).toBeNull();
	});

	it('reads a result that is not bodyweight relative as its own number', () => {
		const reading = readRecordRatio(record({ bodyweight_relative: false }), 25);
		expect(reading?.ratio).toBeUndefined();
		expect(reading?.missing).toBeUndefined();
	});
});

describe('readRecordDenominator', () => {
	it('names the weigh-in once for a row, without a hand to divide', () => {
		const reading = readRecordDenominator(record());
		expect(reading?.bodyweightKg).toBe(71);
		expect(reading?.weighedAt).toBe(MEASURED);
	});

	it('has no denominator to name on an assessment that is not read as a ratio', () => {
		expect(readRecordDenominator(record({ bodyweight_relative: false }))).toBeNull();
	});

	it('says why there is none when the weigh-in went stale', () => {
		const stale = record({
			bodyweight_measured_at: daysBefore(MEASURED, 31)
		});
		expect(readRecordDenominator(stale)?.missing).toBe('stale');
	});
});

describe('formatting', () => {
	it('prints a ratio to two decimals, where a season of training shows', () => {
		expect(formatRatio(1.3521)).toBe('1.35');
		expect(formatRatio(1)).toBe('1.00');
	});

	it('prints the load, the weight and the day the ratio was built from', () => {
		const reading = readBodyweightRatio(25, MEASURED, true, 71, '2026-03-02T08:00:00Z');
		expect(formatRatioBasis(reading, new Date('2026-06-01T00:00:00Z'))).toBe(
			'25.0 kg at 71.0 kg, 2 Mar'
		);
	});

	it('has nothing to print about a ratio that was declined', () => {
		const reading = readBodyweightRatio(25, MEASURED, true, null, null);
		expect(formatRatioBasis(reading)).toBe('');
	});

	// The denominator a whole row is read against, spelled out here because it is
	// the one place the wording is written and every surface prints it: the cards,
	// the history table and the session detail modal.
	it('names the weight and the day the row divides by', () => {
		const reading = readDenominator(MEASURED, 71, '2026-03-02T08:00:00Z');
		expect(formatDenominatorNote(reading, 'kg', new Date('2026-06-01T00:00:00Z'))).toBe(
			'ratio to 71.0 kg, weighed 2 Mar'
		);
	});

	it('says why there is no ratio, in the unit the numbers are left in', () => {
		expect(formatDenominatorNote(readDenominator(MEASURED, null, null), 'kg')).toBe(
			'kg, no weight on file'
		);
		expect(
			formatDenominatorNote(readDenominator(MEASURED, 71, daysBefore(MEASURED, 31)), 'kg')
		).toBe('kg, no recent weight');
	});

	// What a surface heads its numbers with, which is not a unit once the number
	// is a ratio. Shared, because the cards, the summary beside the sessions and
	// the session detail all say it.
	it('heads a bodyweight relative result with what it is reading', () => {
		expect(readingLabel(true, 'kilograms')).toBe('ratio to bodyweight');
		expect(readingLabel(false, 'kilograms')).toBe('kg');
		expect(readingLabel(false, 'seconds')).toBe('s');
		expect(readingLabel(false, 'repetitions')).toBe('reps');
	});

	it('tells a weigh-in that went stale apart from one that never happened', () => {
		expect(missingRatioLabel('stale')).toBe('no recent weight');
		expect(missingRatioLabel('no-weigh-in')).toBe('no weight on file');
	});
});
