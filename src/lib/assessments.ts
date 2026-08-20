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

// One value a training prescribes as a percentage of an assessment, whether it
// drives a load, a duration or a rep count. The same percentage of the same
// assessment is one entry however many items ask for it.
export interface AssessmentRelativeValue {
	field: VariableField;
	assessment_type: number;
	percent: number;
	fallback: number;
}

export function collectAssessmentRelativeValues(items: TrainingItem[]): AssessmentRelativeValue[] {
	const byKey = new Map<string, AssessmentRelativeValue>();

	function add(value: AssessmentRelativeValue) {
		byKey.set(`${value.field}:${value.assessment_type}:${value.percent}:${value.fallback}`, value);
	}

	function visit(item: TrainingItem) {
		for (const load of [...(item.loads ?? []), ...(item.left_loads ?? [])]) {
			if (load.unit === 'percent_assessment' && load.assessment_type !== undefined) {
				add({
					field: 'load',
					assessment_type: load.assessment_type,
					percent: load.value,
					fallback: load.fallback ?? 0
				});
			}
		}
		for (const [field, target] of Object.entries(item.variable_targets ?? {})) {
			if (target) {
				add({
					field: field as VariableField,
					assessment_type: target.assessment_type,
					percent: target.percent,
					fallback: target.fallback
				});
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
	value: number;
	fromFallback: boolean;
}

export interface ResolvedPrescribedValue {
	right: ResolvedHandValue;
	left: ResolvedHandValue;
}

// A percentage read against the results frozen with the prescription, which are
// the athlete's numbers as they stood when the session was played rather than
// the ones they have now.
export function resolveAgainstFrozenResults(
	relative: AssessmentRelativeValue,
	results: AssessmentResultSnapshot[]
): ResolvedPrescribedValue {
	const measured = results.find((result) => result.type === relative.assessment_type);

	function forHand(value: number | null | undefined): ResolvedHandValue {
		if (value === null || value === undefined) {
			return { value: relative.fallback, fromFallback: true };
		}
		return { value: (value * relative.percent) / 100, fromFallback: false };
	}

	return {
		right: forHand(measured?.right_value),
		left: forHand(measured?.left_value)
	};
}

export function formatResolvedValue(value: number, field: VariableField): string {
	const unit = FIELD_UNITS[field];
	if (unit === 'reps') return String(Math.round(value));
	if (unit === 's') return `${value.toFixed(0)}s`;
	return `${value.toFixed(1)} kg`;
}
