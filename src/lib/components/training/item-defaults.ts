import type { Load, TrainingItem } from '$lib/api/client';

// What an editor fills in on an item read from the API before any field is
// shown. A training written by an older client, or by the app, can leave any of
// these out, and every editor has to read the same value where the item says
// nothing.
//
// It matters beyond the editors: a program week diffs the tree the coach edited
// against the training it came from, so the training has to be read through the
// same defaults, or opening a week would look like the coach changed it.

export function applyHangboardRepReadDefaults(item: TrainingItem): void {
	item.hand ??= 'both';
	item.worktime_seconds ??= 7;
	item.rest_seconds ??= 3;
}

export function applyRepeaterReadDefaults(item: TrainingItem): void {
	applyHangboardRepReadDefaults(item);
	item.reps ||= 6;
	item.cycles ||= 3;
	item.cycle_rest_seconds ||= 180;
}

// A load prescribed as a percentage of an assessment may name no assessment,
// which is how one written before assessments had ids reads today. Every editor
// resolves it to the first assessment the catalog offers for a load, and unifies
// the fallback across the item, so a tree read for comparison has to do the same.
function resolveAssessmentLoads(item: TrainingItem, loadAssessments: string[]): void {
	const loads: Load[] = [...(item.loads ?? []), ...(item.left_loads ?? [])];
	const first = loads.find((load) => load.unit === 'percent_assessment');
	if (!first) return;
	const assessmentID = first.assessment_id ?? loadAssessments[0];
	if (!assessmentID) return;
	const fallback = first.fallback ?? 0;
	for (const load of loads) {
		if (load.unit !== 'percent_assessment') continue;
		load.assessment_id = assessmentID;
		load.fallback = fallback;
	}
}

// The whole tree, as every editor below it will read it.
export function applyItemReadDefaults(items: TrainingItem[], loadAssessments: string[]): void {
	for (const item of items) {
		if (item.type === 'repeater') applyRepeaterReadDefaults(item);
		else if (item.type === 'hangboard_rep') applyHangboardRepReadDefaults(item);
		resolveAssessmentLoads(item, loadAssessments);
		if (item.items) applyItemReadDefaults(item.items, loadAssessments);
	}
}
