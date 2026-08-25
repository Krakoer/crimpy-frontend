import type {
	AssessmentDefinition,
	AssessmentResponse,
	AssessmentResultSnapshot,
	Load,
	TrainingItem,
	VariableTarget
} from '$lib/api/client';
import { fmtLoad } from '$lib/components/training/load-units';

// The unit an assessment result is measured in. It decides which item field the
// assessment can drive: kilograms a load, seconds a duration. These are the
// values assessment_definitions.unit holds.
export type AssessmentUnit = 'kilograms' | 'seconds' | 'repetitions';

const UNIT_SUFFIXES: Record<AssessmentUnit, string> = {
	kilograms: ' kg',
	seconds: 's',
	repetitions: ' reps'
};

export interface AssessmentTypeInfo {
	label: string;
	unit: AssessmentUnit;
	perHand: boolean;
	format: (v: number) => string;
}

function formatFor(unit: AssessmentUnit): (v: number) => string {
	return unit === 'kilograms' ? (v) => v.toFixed(1) : (v) => v.toFixed(0);
}

// Every assessment a page can name, keyed by the id both a result row and a
// percentage reference hold. There is no builtin table to merge in: the ones
// Crimpy ships are rows like any other, and the server lists them alongside the
// coach's own. Built once from data the page already has, then handed to the
// functions below, so nothing in this module fetches.
export type AssessmentCatalog = Record<string, AssessmentTypeInfo>;

export const EMPTY_CATALOG: AssessmentCatalog = {};

export function buildAssessmentCatalog(
	definitions: Pick<AssessmentDefinition, 'id' | 'label' | 'unit' | 'per_hand'>[]
): AssessmentCatalog {
	const catalog: AssessmentCatalog = {};
	for (const definition of definitions) {
		const unit = definition.unit as AssessmentUnit;
		catalog[definition.id] = {
			label: definition.label,
			unit,
			perHand: definition.per_hand,
			format: formatFor(unit)
		};
	}
	return catalog;
}

// The item fields that can be prescribed as a percentage of an assessment.
export type VariableField = 'load' | 'duration' | 'reps';

const FIELD_UNITS: Record<VariableField, AssessmentUnit> = {
	load: 'kilograms',
	duration: 'seconds',
	reps: 'repetitions'
};

// The assessments that can drive a field, that is those measured in its unit,
// ordered by label so a picker reads the same way twice. A field with no
// matching assessment cannot be made variable at all.
export function assessmentsForField(field: VariableField, catalog: AssessmentCatalog): string[] {
	return Object.keys(catalog)
		.filter((id) => catalog[id].unit === FIELD_UNITS[field])
		.sort((a, b) => catalog[a].label.localeCompare(catalog[b].label));
}

export function assessmentLabel(id: string | undefined, catalog: AssessmentCatalog): string {
	if (id === undefined) return 'assessment';
	return catalog[id]?.label ?? 'assessment';
}

export function assessmentUnit(
	id: string | undefined,
	catalog: AssessmentCatalog
): AssessmentUnit | undefined {
	return id === undefined ? undefined : catalog[id]?.unit;
}

export function assessmentUnitLabel(id: string | undefined, catalog: AssessmentCatalog): string {
	const unit = assessmentUnit(id, catalog);
	return unit ? UNIT_SUFFIXES[unit] : '';
}

export function assessmentIsPerHand(id: string | undefined, catalog: AssessmentCatalog): boolean {
	return id === undefined ? false : (catalog[id]?.perHand ?? false);
}

export function formatAssessmentValue(
	value: number,
	id: string,
	catalog: AssessmentCatalog
): string {
	const info = catalog[id];
	return info ? info.format(value) : String(value);
}

// A measured value with its unit, e.g. "14 reps" or "48.0 kg".
export function formatAssessmentValueWithUnit(
	value: number,
	id: string,
	catalog: AssessmentCatalog
): string {
	const info = catalog[id];
	if (!info) return String(value);
	return `${info.format(value)}${UNIT_SUFFIXES[info.unit]}`;
}

// Human-readable load, e.g. "80% Max force", "35 kg" or "MAX".
export function formatLoad(load: Load, catalog: AssessmentCatalog): string {
	if (load.unit === 'percent_assessment') {
		return `${load.value}% ${assessmentLabel(load.assessment_id, catalog)}`;
	}
	return fmtLoad(load.value, load.unit);
}

// Human-readable variable target, e.g. "75% of 60% endurance (fallback 60s)".
export function formatVariableTarget(target: VariableTarget, catalog: AssessmentCatalog): string {
	const unit = assessmentUnitLabel(target.assessment_id, catalog);
	return `${target.percent}% of ${assessmentLabel(target.assessment_id, catalog)} (fallback ${target.fallback}${unit})`;
}

// Every assessment referenced by a training tree, whether through a load or a
// variable target. Used to warn a coach before a training lands on a program.
export function referencedAssessments(items: TrainingItem[]): string[] {
	const ids = new Set<string>();

	function visit(item: TrainingItem) {
		for (const load of item.loads ?? []) {
			if (load.unit === 'percent_assessment' && load.assessment_id !== undefined) {
				ids.add(load.assessment_id);
			}
		}
		for (const target of Object.values(item.variable_targets ?? {})) {
			if (target) ids.add(target.assessment_id);
		}
		for (const child of item.items ?? []) visit(child);
	}

	items.forEach(visit);
	return [...ids];
}

// The referenced assessments the athlete has never done, and whose fallback
// will therefore be used.
export function missingAssessments(
	items: TrainingItem[],
	assessments: AssessmentResponse[]
): string[] {
	const done = new Set(assessments.map((a) => a.assessment_id));
	return referencedAssessments(items).filter((id) => !done.has(id));
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
	assessment_id: string;
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
		assessmentId: string,
		percent: number,
		fallback: number,
		hand: PrescribedHand
	) {
		const key = `${field}:${assessmentId}:${percent}:${fallback}`;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, {
				field,
				assessment_id: assessmentId,
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
				if (load.unit === 'percent_assessment' && load.assessment_id !== undefined) {
					add('load', load.assessment_id, load.value, load.fallback ?? 0, source.hand);
				}
			}
		}
		// The app resolves a duration or a rep count without naming a hand, so it
		// is one number for the whole item whichever hands the item hangs.
		for (const [field, target] of Object.entries(item.variable_targets ?? {})) {
			if (target) {
				add(field as VariableField, target.assessment_id, target.percent, target.fallback, 'mean');
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
	results: AssessmentResultSnapshot[],
	catalog: AssessmentCatalog
): ResolvedHandValue[] {
	const measured = results.find((result) => result.assessment_id === relative.assessment_id);
	// A percentage of a force result cannot stand in for a duration, so a
	// reference in the wrong unit takes the fallback rather than putting a
	// number in the wrong unit in front of the coach.
	const unitMatches = catalog[relative.assessment_id]?.unit === FIELD_UNITS[relative.field];

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
	if (unit === 'repetitions') return String(Math.round(value));
	if (unit === 'seconds') return `${value.toFixed(0)}s`;
	return `${value.toFixed(1)} kg`;
}
