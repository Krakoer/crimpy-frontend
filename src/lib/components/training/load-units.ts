import type { LoadUnit } from '$lib/api/client';

/// How each load unit is written for the coach. Typed against LoadUnit so
/// adding a unit to the API type fails here until it is given a name, rather
/// than silently showing the raw value.
export const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
	bw: 'BW',
	percent_bw: '% BW',
	kg: 'kg',
	max: 'MAX'
};

/// Units offered when authoring an exercise. A max effort is a hangboard idea,
/// so it is not offered here.
export const EXERCISE_LOAD_UNITS: { value: LoadUnit; label: string }[] = [
	{ value: 'bw', label: LOAD_UNIT_LABELS.bw },
	{ value: 'percent_bw', label: LOAD_UNIT_LABELS.percent_bw },
	{ value: 'kg', label: LOAD_UNIT_LABELS.kg }
];

/// Units offered when authoring a hangboard item.
export const HANGBOARD_LOAD_UNITS: { value: LoadUnit; label: string }[] = [
	...EXERCISE_LOAD_UNITS,
	{ value: 'max', label: LOAD_UNIT_LABELS.max }
];

/// A load as the coach reads it, e.g. "80 % BW" or "MAX".
export function fmtLoad(value: number, unit: LoadUnit): string {
	if (unit === 'max') return LOAD_UNIT_LABELS.max;
	return `${value} ${LOAD_UNIT_LABELS[unit]}`;
}
