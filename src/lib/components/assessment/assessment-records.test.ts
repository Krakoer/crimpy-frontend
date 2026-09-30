import { describe, expect, it } from 'vitest';
import type { AssessmentResponse } from '$lib/api/client';
import { denominatorSources, handEnds, latestOnHand, originNote } from './assessment-records';

function record(
	id: string,
	sessionDate: string,
	right: number | null,
	left: number | null,
	origin: 'test' | 'training' = 'test'
): AssessmentResponse {
	return {
		id,
		user_id: 'u1',
		assessment_id: 'a1',
		label: 'Max Force',
		unit: 'kilograms',
		per_hand: true,
		bodyweight_relative: false,
		right_value: right,
		left_value: left,
		session_id: id,
		origin,
		updated_at: sessionDate,
		session_date: sessionDate
	};
}

// A test, then a right hand pull kept from a training: the kept row carries no
// left hand, and the left max on file is still the tested one.
const tested = record('tested', '2026-09-22T17:30:00Z', 40.1, 38.4);
const kept = record('kept', '2026-09-28T17:30:00Z', 42.6, null, 'training');

describe('latestOnHand', () => {
	it('reads each hand off the last row that measured it', () => {
		expect(latestOnHand([tested, kept], (r) => r.right_value)).toEqual({
			record: kept,
			value: 42.6
		});
		expect(latestOnHand([tested, kept], (r) => r.left_value)).toEqual({
			record: tested,
			value: 38.4
		});
	});

	it('is undefined for a hand never measured', () => {
		expect(latestOnHand([kept], (r) => r.left_value)).toBeUndefined();
	});
});

describe('handEnds', () => {
	it('spans the measurements of one hand, not the rows', () => {
		const leftKept = record('left-kept', '2026-09-29T17:30:00Z', null, 39.9, 'training');
		const ends = handEnds([tested, kept, leftKept], (r) => r.right_value);
		expect(ends?.first.value).toBe(40.1);
		expect(ends?.last.value).toBe(42.6);
	});

	it('needs two measurements of the hand', () => {
		expect(handEnds([tested, kept], (r) => r.left_value)).toBeUndefined();
	});
});

describe('originNote', () => {
	it('names a kept pull and says nothing of a test', () => {
		expect(originNote(kept)).toBe('From a training');
		expect(originNote(tested)).toBe('');
	});
});

describe('denominatorSources', () => {
	it('names each hand when the hands come from different rows', () => {
		const left = latestOnHand([tested, kept], (r) => r.left_value);
		const right = latestOnHand([tested, kept], (r) => r.right_value);
		expect(denominatorSources(true, left, right, undefined)).toEqual([
			{ label: 'Left', record: tested },
			{ label: 'Right', record: kept }
		]);
	});

	it('names the weigh-in once when one row answers for both hands', () => {
		const left = latestOnHand([tested], (r) => r.left_value);
		const right = latestOnHand([tested], (r) => r.right_value);
		expect(denominatorSources(true, left, right, undefined)).toEqual([
			{ label: '', record: tested }
		]);
	});
});
