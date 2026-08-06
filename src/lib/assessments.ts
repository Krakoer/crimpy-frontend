import type { AssessmentResponse, Load, TrainingItem, VariableTarget } from '$lib/api/client';
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
	const done = new Set(assessments.map((a) => a.Type));
	return referencedAssessmentTypes(items).filter((type) => !done.has(type));
}
