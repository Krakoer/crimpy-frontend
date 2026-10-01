import type { AssessmentResponse } from '$lib/api/client';
import { CRITICAL_FORCE_ID } from './chart-axes';

export { CRITICAL_FORCE_ID };
export const MAX_FORCE_ID = 'f7954158-63ba-4f0b-a125-6ef195fa6442';

// What a Critical Force test measured beyond its value, as the app stores it on
// the result (Krakoer/crimpy#145). Only what the portal reads is named here;
// the per pull numbers travel with it for a later reader.
export interface CriticalForceDetails {
	// Impulse above the Critical Force inside the pulls, in kg.s.
	wPrimeKgS: number;
	// Mean end force of the last three pulls, closer to what can be sustained.
	endForceKg?: number;
}

// The details of a Critical Force result, or nothing when it has none, as every
// result recorded before them, or when what is stored does not read as them.
export function criticalForceDetails(raw: unknown): CriticalForceDetails | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const details = raw as Record<string, unknown>;
	const wPrime = details.w_prime_kg_s;
	if (typeof wPrime !== 'number' || !Number.isFinite(wPrime)) return null;
	const endForce = details.end_force_kg;
	return {
		wPrimeKgS: wPrime,
		...(typeof endForce === 'number' && Number.isFinite(endForce) ? { endForceKg: endForce } : {})
	};
}

export type ForceHand = 'left' | 'right';

// The Max Force a Critical Force is a share of: the latest one on file at or
// before it, for the same hand and grip. Not the latest one today, or an old
// test would read against a max the athlete had not reached yet.
export function maxForceAt(
	records: AssessmentResponse[],
	hand: ForceHand,
	grip: number,
	at: string
): number | null {
	const cutoff = new Date(at).getTime();
	let best: { at: number; value: number } | null = null;
	for (const record of records) {
		if (record.assessment_id !== MAX_FORCE_ID) continue;
		if ((record.grip_position ?? 0) !== grip) continue;
		const value = hand === 'right' ? record.right_value : record.left_value;
		if (value === null || value === undefined || value <= 0) continue;
		const measured = new Date(record.session_date).getTime();
		if (measured > cutoff) continue;
		if (!best || measured >= best.at) best = { at: measured, value };
	}
	return best?.value ?? null;
}

// A Critical Force as a share of max, in whole percent. It averages about 40 %;
// a low one says endurance is the limiter, a high one strength.
export function shareOfMax(criticalForce: number, maxForce: number | null): number | null {
	if (maxForce === null || maxForce <= 0) return null;
	return Math.round((criticalForce / maxForce) * 100);
}

// The secondary line under a Critical Force: its share of max and its W', each
// left out when it is not known.
export function criticalForceNote(
	share: number | null,
	details: CriticalForceDetails | null
): string {
	const parts: string[] = [];
	if (share !== null) parts.push(`${share} % of max`);
	if (details) parts.push(`W' ${Math.round(details.wPrimeKgS)} kg.s`);
	return parts.join(', ');
}

// The note for one hand of a Critical Force record, read against the athlete's
// whole history for its Max Force.
export function criticalForceRecordNote(
	record: AssessmentResponse,
	hand: ForceHand,
	history: AssessmentResponse[]
): string {
	if (record.assessment_id !== CRITICAL_FORCE_ID) return '';
	const value = hand === 'right' ? record.right_value : record.left_value;
	if (value === null || value === undefined) return '';
	const max = maxForceAt(history, hand, record.grip_position ?? 0, record.session_date);
	return criticalForceNote(shareOfMax(value, max), criticalForceDetails(record.details));
}
