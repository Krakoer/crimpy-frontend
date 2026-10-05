import { describe, expect, it } from 'vitest';
import type { AssessmentResponse, AssessmentSnapshot } from '$lib/api/client';
import {
	CRITICAL_FORCE_ID,
	MAX_FORCE_ID,
	criticalForceDetails,
	criticalForceNote,
	criticalForceRecordNote,
	maxForceAt,
	shareOfMax
} from './critical-force';
import { compareSnapshots } from './assessment-comparison';

function record(overrides: Partial<AssessmentResponse>): AssessmentResponse {
	return {
		id: 'r',
		user_id: 'u',
		assessment_id: MAX_FORCE_ID,
		label: 'Max Force',
		unit: 'kilograms',
		per_hand: true,
		bodyweight_relative: false,
		right_value: null,
		left_value: null,
		session_id: 's',
		grip_position: 0,
		origin: 'test',
		updated_at: '2026-03-01T10:00:00Z',
		session_date: '2026-03-01T10:00:00Z',
		...overrides
	};
}

describe('criticalForceDetails', () => {
	it('reads the W and end force the app stored', () => {
		expect(criticalForceDetails({ w_prime_kg_s: 512.5, end_force_kg: 16.8, pulls: [] })).toEqual({
			wPrimeKgS: 512.5,
			endForceKg: 16.8
		});
	});

	it('has nothing to read on a result without details, or with details it cannot read', () => {
		expect(criticalForceDetails(undefined)).toBeNull();
		expect(criticalForceDetails(null)).toBeNull();
		expect(criticalForceDetails({ pulls: [] })).toBeNull();
		expect(criticalForceDetails([1, 2])).toBeNull();
	});
});

describe('maxForceAt', () => {
	const history = [
		record({ right_value: 40, session_date: '2026-03-01T10:00:00Z' }),
		record({ right_value: 44, session_date: '2026-04-01T10:00:00Z' }),
		record({ left_value: 38, session_date: '2026-03-15T10:00:00Z' }),
		record({ right_value: 60, grip_position: 1, session_date: '2026-03-02T10:00:00Z' })
	];

	it('takes the latest Max Force before the date, for the hand and grip', () => {
		expect(maxForceAt(history, 'right', 0, '2026-03-20T10:00:00Z')).toBe(40);
		expect(maxForceAt(history, 'right', 0, '2026-04-02T10:00:00Z')).toBe(44);
		expect(maxForceAt(history, 'left', 0, '2026-04-02T10:00:00Z')).toBe(38);
		expect(maxForceAt(history, 'right', 1, '2026-04-02T10:00:00Z')).toBe(60);
	});

	it("leaves out a max kept from the test's own pull, stored at its date", () => {
		const kept = record({ right_value: 46, session_date: '2026-03-20T10:00:00Z' });
		expect(maxForceAt([...history, kept], 'right', 0, '2026-03-20T10:00:00Z')).toBe(40);
	});

	it('lets a recorded zero stand, so no share is read rather than an older one', () => {
		const zero = record({ right_value: 0, session_date: '2026-03-10T10:00:00Z' });
		expect(maxForceAt([...history, zero], 'right', 0, '2026-03-20T10:00:00Z')).toBe(0);
		expect(shareOfMax(18, 0)).toBeNull();
	});

	it('has none before the first Max Force on the hand', () => {
		expect(maxForceAt(history, 'right', 0, '2026-02-01T10:00:00Z')).toBeNull();
		expect(maxForceAt(history, 'left', 1, '2026-04-02T10:00:00Z')).toBeNull();
	});
});

describe('the Critical Force note', () => {
	it('says the share of max and the W', () => {
		expect(criticalForceNote(shareOfMax(17, 40), { wPrimeKgS: 512.4 })).toBe(
			"43 % of max, W' 512 kg.s"
		);
	});

	it('says what it knows and nothing else', () => {
		expect(criticalForceNote(shareOfMax(17, null), { wPrimeKgS: 512 })).toBe("W' 512 kg.s");
		expect(criticalForceNote(42, null)).toBe('42 % of max');
		expect(criticalForceNote(null, null)).toBe('');
	});

	it('reads a record against the Max Force on file at its date', () => {
		const cf = record({
			assessment_id: CRITICAL_FORCE_ID,
			right_value: 18,
			session_date: '2026-03-20T10:00:00Z',
			details: { w_prime_kg_s: 400 }
		});
		const history = [
			record({ right_value: 40 }),
			record({ right_value: 50, session_date: '2026-05-01T10:00:00Z' }),
			cf
		];
		expect(criticalForceRecordNote(cf, 'right', history)).toBe("45 % of max, W' 400 kg.s");
		expect(criticalForceRecordNote(cf, 'left', history)).toBe('');
		expect(criticalForceRecordNote(history[0], 'right', history)).toBe('');
	});
});

describe('a Critical Force in the two date comparison', () => {
	function snapshot(
		date: string,
		cf: { value: number; at: string; wPrime?: number },
		max: { value: number; at: string }
	): AssessmentSnapshot {
		const base = {
			unit: 'kilograms',
			per_hand: true,
			bodyweight_relative: false,
			grip_position: 0,
			right_origin: 'test' as const
		};
		return {
			date,
			results: [
				{
					...base,
					assessment_id: CRITICAL_FORCE_ID,
					label: 'Critical Force',
					right_value: cf.value,
					right_measured_at: cf.at,
					...(cf.wPrime === undefined ? {} : { right_details: { w_prime_kg_s: cf.wPrime } })
				},
				{
					...base,
					assessment_id: MAX_FORCE_ID,
					label: 'Max Force',
					right_value: max.value,
					right_measured_at: max.at
				}
			]
		};
	}

	function rightHand(rows: ReturnType<typeof compareSnapshots>) {
		const cf = rows.find((row) => row.assessmentId === CRITICAL_FORCE_ID)!;
		return cf.hands.find((hand) => hand.hand === 'right')!;
	}

	it('reads each side against the Max Force on file when it was measured', () => {
		const history = [
			record({ right_value: 40, session_date: '2026-02-01T10:00:00Z' }),
			record({ right_value: 44, session_date: '2026-04-01T10:00:00Z' })
		];
		const rows = compareSnapshots(
			snapshot(
				'2026-03-01T10:00:00Z',
				{ value: 16, at: '2026-03-01T10:00:00Z', wPrime: 500 },
				{ value: 40, at: '2026-02-01T10:00:00Z' }
			),
			snapshot(
				'2026-05-01T10:00:00Z',
				{ value: 20, at: '2026-05-01T10:00:00Z' },
				{ value: 44, at: '2026-04-01T10:00:00Z' }
			),
			history
		);
		expect(rightHand(rows).before?.detail).toBe("40 % of max, W' 500 kg.s");
		expect(rightHand(rows).after?.detail).toBe('45 % of max');
		const max = rows.find((row) => row.assessmentId === MAX_FORCE_ID)!;
		expect(max.hands.every((hand) => !hand.before?.detail && !hand.after?.detail)).toBe(true);
	});

	it('reads a result carried forward the same on both sides, and as on its card', () => {
		// Max 40 kg, then a Critical Force of 18 kg, then a newer max of 50 kg.
		const cf = record({
			assessment_id: CRITICAL_FORCE_ID,
			right_value: 18,
			session_date: '2026-03-20T10:00:00Z'
		});
		const history = [
			record({ right_value: 40, session_date: '2026-03-01T10:00:00Z' }),
			record({ right_value: 50, session_date: '2026-05-01T10:00:00Z' }),
			// The test's own hardest pull, kept as a max on its session.
			record({ right_value: 46, session_date: '2026-03-20T10:00:00Z', origin: 'training' }),
			cf
		];
		const rows = compareSnapshots(
			snapshot(
				'2026-03-20T10:00:00Z',
				{ value: 18, at: '2026-03-20T10:00:00Z' },
				{ value: 46, at: '2026-03-20T10:00:00Z' }
			),
			snapshot(
				'2026-05-01T10:00:00Z',
				{ value: 18, at: '2026-03-20T10:00:00Z' },
				{ value: 50, at: '2026-05-01T10:00:00Z' }
			),
			history
		);
		expect(rightHand(rows).before?.detail).toBe('45 % of max');
		expect(rightHand(rows).after?.detail).toBe('45 % of max');
		expect(criticalForceRecordNote(cf, 'right', history)).toBe('45 % of max');
	});
});
