import type {
	AssessmentResponse,
	AssessmentResultSnapshot,
	Load,
	TrainingItem,
	VariableTarget
} from '$lib/api/client';
import { fmtLoad } from '$lib/components/training/load-units';

// The unit an assessment result is measured in. It decides which item field
// the assessment can drive: kilograms a load, seconds a duration.
export type AssessmentUnit = 'kg' | 's' | 'reps';

export interface AssessmentTypeInfo {
	label: string;
	unit: AssessmentUnit;
	format: (v: number) => string;
}

// Assessment discriminators shared with the app and stored on assessments.type.
export const ASSESSMENT_TYPES: Record<number, AssessmentTypeInfo> = {
	0: { label: 'Critical force', unit: 'kg', format: (v) => v.toFixed(1) },
	1: { label: 'Max force', unit: 'kg', format: (v) => v.toFixed(1) },
	2: { label: '60% endurance', unit: 's', format: (v) => v.toFixed(0) }
};

// The item fields that can be prescribed as a percentage of an assessment.
export type VariableField = 'load' | 'duration' | 'reps';

const FIELD_UNITS: Record<VariableField, AssessmentUnit> = {
	load: 'kg',
	duration: 's',
	reps: 'reps'
};

// The assessments that can drive a field, that is those measured in its unit.
// A field with no matching assessment cannot be made variable at all.
export function assessmentTypesForField(field: VariableField): number[] {
	return Object.keys(ASSESSMENT_TYPES)
		.map(Number)
		.filter((type) => ASSESSMENT_TYPES[type].unit === FIELD_UNITS[field]);
}

export function assessmentLabel(type: number | undefined): string {
	if (type === undefined) return 'assessment';
	return ASSESSMENT_TYPES[type]?.label ?? 'assessment';
}

export function assessmentUnitLabel(type: number | undefined): string {
	if (type === undefined) return '';
	return ASSESSMENT_TYPES[type]?.unit ?? '';
}

export function formatAssessmentValue(value: number, type: number): string {
	const info = ASSESSMENT_TYPES[type];
	return info ? info.format(value) : String(value);
}

// Human-readable load, e.g. "80% Max force", "35 kg" or "MAX".
export function formatLoad(load: Load): string {
	if (load.unit === 'percent_assessment') {
		return `${load.value}% ${assessmentLabel(load.assessment_type)}`;
	}
	return fmtLoad(load.value, load.unit);
}

// Human-readable variable target, e.g. "75% of 60% endurance (fallback 60s)".
export function formatVariableTarget(target: VariableTarget): string {
	const unit = assessmentUnitLabel(target.assessment_type);
	return `${target.percent}% of ${assessmentLabel(target.assessment_type)} (fallback ${target.fallback}${unit})`;
}

// Every assessment referenced by a training tree, whether through a load or a
// variable target. Used to warn a coach before a training lands on a program.
export function referencedAssessmentTypes(items: TrainingItem[]): number[] {
	const types = new Set<number>();

	function visit(item: TrainingItem) {
		for (const load of item.loads ?? []) {
			if (load.unit === 'percent_assessment' && load.assessment_type !== undefined) {
				types.add(load.assessment_type);
			}
		}
		for (const target of Object.values(item.variable_targets ?? {})) {
			if (target) types.add(target.assessment_type);
		}
		for (const child of item.items ?? []) visit(child);
	}

	items.forEach(visit);
	return [...types].sort();
}

// The referenced assessments the athlete has never done, and whose fallback
// will therefore be used.
export function missingAssessmentTypes(
	items: TrainingItem[],
	assessments: AssessmentResponse[]
): number[] {
	const done = new Set(assessments.map((a) => a.type));
	return referencedAssessmentTypes(items).filter((type) => !done.has(type));
}

// Which hand a prescribed percentage is read against. The app resolves a
// two-handed hang, and every duration or rep target, against the mean of the
// two hands rather than against each one, so 'mean' is a hand of its own and
// not a shorthand for "both of them".
export type PrescribedHand = 'right' | 'left' | 'mean';

const HAND_LABELS: Record<PrescribedHand, string> = {
	right: 'R',
	left: 'L',
	mean: 'Both'
};

// How to mark which hand a resolved number belongs to. A row carrying a single
// number needs no qualifier when that number is the mean, since it is then the
// only thing the athlete was asked for; one that also carries a named hand does,
// or two numbers sit side by side with nothing saying why they differ.
export function handLabel(hand: PrescribedHand, entriesOnRow: number): string {
	if (hand === 'mean' && entriesOnRow < 2) return '';
	return HAND_LABELS[hand];
}

// One value a training prescribes as a percentage of an assessment, whether it
// drives a load, a duration or a rep count, together with the hands it is asked
// of. The same percentage of the same assessment is one entry however many
// items ask for it, and carries every hand any of them asked it of.
export interface AssessmentRelativeValue {
	field: VariableField;
	assessment_type: number;
	percent: number;
	fallback: number;
	hands: PrescribedHand[];
}

// The load array a hang actually reads, and the hand its percentages resolve
// against. Mirrors HangboardLayout.load and the handSide the app passes beside
// it: left_loads is the left hand's array alone, the left hand falls back to
// loads when an item prescribes no left array, and a hang on two hands at once
// takes the mean of the two results rather than one number per hand.
function loadSources(item: TrainingItem): { loads: Load[]; hand: PrescribedHand }[] {
	const loads = item.loads ?? [];
	const leftLoads = item.left_loads?.length ? item.left_loads : loads;

	// An exercise or a free item is not hung on a named hand, and the app labels
	// its load without one, which lands on the mean.
	if (item.type !== 'repeater' && item.type !== 'hangboard_rep') {
		return [{ loads, hand: 'mean' }];
	}
	switch (item.hand ?? 'both') {
		case 'right':
			return [{ loads, hand: 'right' }];
		case 'left':
			return [{ loads: leftLoads, hand: 'left' }];
		case 'alternate':
		case 'split':
			// A hangboard rep is a single hang, and the layout reads the right
			// hand's array for any hand not named left.
			if (item.type === 'hangboard_rep') return [{ loads, hand: 'mean' }];
			return [
				{ loads, hand: 'right' },
				{ loads: leftLoads, hand: 'left' }
			];
		default:
			return [{ loads, hand: 'mean' }];
	}
}

export function collectAssessmentRelativeValues(items: TrainingItem[]): AssessmentRelativeValue[] {
	const byKey = new Map<string, AssessmentRelativeValue>();

	function add(
		field: VariableField,
		assessmentType: number,
		percent: number,
		fallback: number,
		hand: PrescribedHand
	) {
		const key = `${field}:${assessmentType}:${percent}:${fallback}`;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, {
				field,
				assessment_type: assessmentType,
				percent,
				fallback,
				hands: [hand]
			});
		} else if (!existing.hands.includes(hand)) {
			existing.hands.push(hand);
		}
	}

	function visit(item: TrainingItem) {
		for (const source of loadSources(item)) {
			for (const load of source.loads) {
				if (load.unit === 'percent_assessment' && load.assessment_type !== undefined) {
					add('load', load.assessment_type, load.value, load.fallback ?? 0, source.hand);
				}
			}
		}
		// The app resolves a duration or a rep count without naming a hand, so it
		// is one number for the whole item whichever hands the item hangs.
		for (const [field, target] of Object.entries(item.variable_targets ?? {})) {
			if (target) {
				add(
					field as VariableField,
					target.assessment_type,
					target.percent,
					target.fallback,
					'mean'
				);
			}
		}
		for (const child of item.items ?? []) visit(child);
	}

	items.forEach(visit);
	return [...byKey.values()];
}

// What a percentage came out to for one hand. fromFallback marks the hand the
// athlete had never measured, where the coach's fixed value was used instead of
// a percentage of anything.
export interface ResolvedHandValue {
	hand: PrescribedHand;
	value: number;
	fromFallback: boolean;
}

// A percentage read against the results frozen with the prescription, one entry
// per hand it was asked of. Those are the athlete's numbers as they stood when
// the session was played rather than the ones they have now.
export function resolveAgainstFrozenResults(
	relative: AssessmentRelativeValue,
	results: AssessmentResultSnapshot[]
): ResolvedHandValue[] {
	const measured = results.find((result) => result.type === relative.assessment_type);
	// A percentage of a force result cannot stand in for a duration, so a
	// reference in the wrong unit takes the fallback rather than putting a
	// number in the wrong unit in front of the coach.
	const unitMatches =
		ASSESSMENT_TYPES[relative.assessment_type]?.unit === FIELD_UNITS[relative.field];

	function measuredFor(hand: PrescribedHand): number | null {
		if (!measured || !unitMatches) return null;
		if (hand === 'right') return measured.right_value ?? null;
		if (hand === 'left') return measured.left_value ?? null;
		// The mean of the hands that were measured, which is the single hand
		// itself when the athlete only ever did the assessment on one side.
		const values = [measured.right_value, measured.left_value].filter(
			(value): value is number => value !== null && value !== undefined
		);
		if (values.length === 0) return null;
		return values.reduce((a, b) => a + b, 0) / values.length;
	}

	return relative.hands.map((hand) => {
		const value = measuredFor(hand);
		return value === null
			? { hand, value: relative.fallback, fromFallback: true }
			: { hand, value: (value * relative.percent) / 100, fromFallback: false };
	});
}

export function formatResolvedValue(value: number, field: VariableField): string {
	const unit = FIELD_UNITS[field];
	if (unit === 'reps') return String(Math.round(value));
	if (unit === 's') return `${value.toFixed(0)}s`;
	return `${value.toFixed(1)} kg`;
}
