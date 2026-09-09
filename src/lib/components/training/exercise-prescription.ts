import type { TrainingItem, VariableTarget, VariableTargets } from '$lib/api/client';
import { assessmentsForField, type AssessmentCatalog, type VariableField } from '$lib/assessments';
import type { OverrideMode } from './override-context';

// The two fields an exercise can prescribe either way, which are also the two
// it prescribes one at a time.
export type DurationOrReps = Extract<VariableField, 'duration' | 'reps'>;

// The boxes the coach types in, held by the editor because the inputs bind to
// them, and reached from here through accessors so this module needs no
// component to run. isDuration is one of them: which field is prescribed is
// what the reps and duration buttons say, and the boxes shown follow it.
export interface PrescriptionBoxes {
	get isDuration(): boolean;
	set isDuration(value: boolean);
	get durationMin(): number;
	set durationMin(value: number);
	get durationSec(): number;
	set durationSec(value: number);
	get repsCount(): number | null;
	set repsCount(value: number | null);
}

// Everything the toggles read that the editor owns. item is mutated in place,
// which is how the editor above sees the change. overrideMode being present is
// what makes this a program week rather than a training, and is also how the
// training the week is read against is reached.
export interface PrescriptionDeps {
	get item(): TrainingItem;
	get catalog(): AssessmentCatalog;
	get overrideMode(): OverrideMode | undefined;
	boxes: PrescriptionBoxes;
}

// The plain value a percentage was put back over the top of, beside the
// fallback that took its place in the boxes. It only goes back when the boxes
// still read that fallback: a coach who typed over it since meant the number
// they typed.
type DisplacedValue = { plain: number; shown: number };

// assessment_id, percent and fallback, all primitives, so a spread of a
// VariableTarget shares nothing with the item it was read off and this stands in
// for $state.snapshot. The item is a reactive proxy in the editor, and a
// remembered target that stayed joined to it would follow the boxes it is meant
// to hold still against. Add a field that is not a primitive and this has to
// become a deep copy, or the memo starts sharing structure with the item again
// and nothing here will fail.
function copyTarget(target: VariableTarget): VariableTarget {
	return { ...target };
}

// What the boxes read when the editor opens on an item. Here rather than in the
// component because the tests depend on it: a box seeded from the wrong value
// makes a toggle sequence prove nothing, so the rule and the toggles have to
// move together.
//
// The boxes hold the plain number the athlete runs, which is the fallback while
// a percentage stands: that is the only fixed value a client reads then, and a
// week that already moved it leaves the training's own number on the item
// untouched.
export function initialBoxes(item: TrainingItem): {
	isDuration: boolean;
	durationMin: number;
	durationSec: number;
	repsCount: number | null;
} {
	const seconds = item.variable_targets?.duration?.fallback ?? item.duration ?? 0;
	return {
		isDuration: (item.duration ?? 0) !== 0 && (item.reps ?? 0) === 0,
		durationMin: Math.floor(seconds / 60),
		durationSec: seconds % 60,
		repsCount: item.variable_targets?.reps?.fallback ?? item.reps ?? 0
	};
}

export function createPrescription(deps: PrescriptionDeps) {
	const boxes = deps.boxes;

	// A week prescribes the same exercise with other numbers; a training is the
	// one thing being prescribed. Several of the toggles mean different things in
	// the two, so which one this is has to be readable here.
	function overriding(): boolean {
		return deps.overrideMode !== undefined;
	}

	// A duration of nothing is a block with no time to run for, and the editors
	// hold the floor at one second so a coach clearing both boxes on the way to
	// typing a new value cannot save one. Without it a week saves duration 0,
	// which reads back as a rep exercise rather than the timed one it is. An
	// emptied number box binds as null, which the backend refuses as a fallback
	// and which fails the whole save, so the rep count takes the same floor.
	function prescribedSeconds(): number {
		return Math.max(1, boxes.durationMin * 60 + boxes.durationSec);
	}

	function prescribedReps(): number {
		return Math.max(1, boxes.repsCount ?? 0);
	}

	function prescribedValue(field: DurationOrReps): number {
		return field === 'duration' ? prescribedSeconds() : prescribedReps();
	}

	// An open rep count is the AMRAP: it prescribes no number, so it rules out
	// both the fixed one and the percentage that would compute one.
	function isAmrap(): boolean {
		return deps.item.reps_is_max === true;
	}

	// Reps and duration are exclusive, so only the active one can be variable.
	function variableField(): DurationOrReps {
		return boxes.isDuration ? 'duration' : 'reps';
	}

	// While a percentage stands the boxes hold its fallback. In a training the
	// plain field is that same number written twice, so it moves with it: the
	// read-only views and every client that cannot resolve the percentage read one
	// of the two, and a training holding two different numbers plays neither.
	//
	// A week is the one place they may differ, because there a plain number beside
	// the percentage says the week prescribes a flat value instead, and every
	// client resolves the percentage first, so the flat value is the one that
	// would be dropped.
	function syncDuration() {
		if (!boxes.isDuration) return;
		const seconds = prescribedSeconds();
		const target = deps.item.variable_targets?.duration;
		if (target) target.fallback = seconds;
		if (!target || !overriding()) deps.item.duration = seconds;
	}

	// An open rep count prescribes no number at all, so the box behind it writes
	// nothing while it stands. Neither does an emptied box: the floor is the
	// fallback's, which the backend refuses as null, and a plain count floored the
	// same way would have a week prescribe one rep of an exercise the training
	// asks eight of, with nothing on screen saying so.
	function syncReps() {
		if (boxes.isDuration || isAmrap()) return;
		const target = deps.item.variable_targets?.reps;
		if (target) target.fallback = prescribedReps();
		if ((!target || !overriding()) && boxes.repsCount != null) deps.item.reps = boxes.repsCount;
	}

	// What each button took away, so releasing one puts back what that one
	// displaced and nothing else. None of it is readable off the tree on screen in
	// a week: the override was merged into it before the editor saw it.
	//
	// The % button says whether this week prescribes a plain value, so it owns
	// both directions: off keeps the percentage, on keeps the plain value it
	// covers up. The AMRAP button keeps its own percentage rather than sharing
	// either, because releasing it would otherwise reach for the % button's or the
	// training's and resurrect one the coach turned off on purpose.
	const clearedTargets: VariableTargets = {};
	const displacedValues: Partial<Record<DurationOrReps, DisplacedValue>> = {};
	let amrapClearedTarget: VariableTarget | undefined;

	function trainingItem(): TrainingItem | undefined {
		const id = deps.item.id;
		return id ? deps.overrideMode?.baseItem(id) : undefined;
	}

	// The boxes read as the fallback while a percentage stands, so a percentage
	// put back brings its own number with it: that is what makes the toggle undo
	// itself rather than leave the plain value the coach typed reading as one.
	function showValue(field: DurationOrReps, value: number) {
		if (field === 'duration') {
			boxes.durationMin = Math.floor(value / 60);
			boxes.durationSec = value % 60;
		} else {
			boxes.repsCount = value;
		}
	}

	// The plain field is not a week's to send while a percentage stands: the
	// clients resolve the percentage first, and a number beside it says the week
	// prescribes a flat value, which is what would clear the percentage again.
	// Putting the training's number back leaves the percentage travelling alone.
	function restorePrescribedValue(field: DurationOrReps) {
		const base = trainingItem();
		if (!base) return;
		if (field === 'duration') deps.item.duration = base.duration;
		else deps.item.reps = base.reps;
	}

	// Copied rather than held: the fallback follows the boxes from here, and the
	// training this week is read against is not the week's to write into.
	function applyTarget(field: DurationOrReps, target: VariableTarget) {
		deps.item.variable_targets = {
			...deps.item.variable_targets,
			[field]: copyTarget(target)
		};
		showValue(field, target.fallback);
		restorePrescribedValue(field);
	}

	// The reps and duration inputs edit the fallback once the field is variable,
	// so the plain value a client without assessment data reads stays right.
	function toggleVariable(field: DurationOrReps, on: boolean) {
		const targets = { ...(deps.item.variable_targets ?? {}) };
		if (on) {
			targets[field] = {
				assessment_id: assessmentsForField(field, deps.catalog)[0],
				percent: 75,
				fallback: prescribedValue(field)
			};
		} else {
			delete targets[field];
		}
		deps.item.variable_targets = Object.keys(targets).length > 0 ? targets : undefined;
	}

	function setAmrap(on: boolean) {
		deps.item.reps_is_max = on;
		if (on) {
			const target = deps.item.variable_targets?.reps;
			amrapClearedTarget = target ? copyTarget(target) : undefined;
			toggleVariable('reps', false);
			return;
		}
		if (amrapClearedTarget) {
			applyTarget('reps', amrapClearedTarget);
			amrapClearedTarget = undefined;
			return;
		}
		// Closing an open rep count has to land on a number the athlete can run,
		// and an item that was written as an AMRAP may carry none at all.
		if (!boxes.repsCount) boxes.repsCount = 1;
	}

	// Turning the percentage off is how a week says it prescribes a plain number
	// this time, and turning it back on is how it takes that back. Both are the
	// coach saying which of the two the boxes below mean, which is what nothing
	// else in the panel can tell.
	//
	// A training has only one number to mean, so the toggle there says no more
	// than which shape the field is prescribed in: the boxes are the fallback
	// either way, and putting back a pair the coach has typed over since would
	// throw away what they typed.
	function setVariable(on: boolean) {
		const field = variableField();
		if (!overriding()) {
			toggleVariable(field, on);
			return;
		}
		if (!on) {
			const target = deps.item.variable_targets?.[field];
			clearedTargets[field] = target ? copyTarget(target) : undefined;
			toggleVariable(field, false);
			const displaced = displacedValues[field];
			if (displaced && prescribedValue(field) === displaced.shown) {
				showValue(field, displaced.plain);
			}
			delete displacedValues[field];
			return;
		}
		const remembered = clearedTargets[field] ?? trainingItem()?.variable_targets?.[field];
		if (remembered) {
			displacedValues[field] = { plain: prescribedValue(field), shown: remembered.fallback };
			delete clearedTargets[field];
			applyTarget(field, remembered);
			return;
		}
		toggleVariable(field, true);
		restorePrescribedValue(field);
	}

	// An emptied number box binds as null, and a percentage of null fails the
	// whole save rather than the field, so the box lands on a percentage again
	// once the coach leaves it.
	function floorPercent() {
		const target = deps.item.variable_targets?.[variableField()];
		if (target) target.percent = Math.max(1, target.percent ?? 0);
	}

	function setDurationMode() {
		boxes.durationMin = 0;
		boxes.durationSec = 0;
		deps.item.reps = 0;
		toggleVariable('reps', false);
		deps.item.reps_is_max = false;
		boxes.isDuration = true;
	}

	function setRepsMode() {
		deps.item.duration = 0;
		if (!boxes.repsCount) boxes.repsCount = 1;
		toggleVariable('duration', false);
		boxes.isDuration = false;
	}

	return {
		isAmrap,
		variableField,
		syncDuration,
		syncReps,
		setAmrap,
		setVariable,
		floorPercent,
		setDurationMode,
		setRepsMode
	};
}
