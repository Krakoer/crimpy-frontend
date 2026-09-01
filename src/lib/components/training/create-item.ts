import type { TrainingItem, TrainingItemType } from '$lib/api/client';
import { applyHangboardDefaults, applyHangboardRepDefaults } from './hangboard-granularity';

// The lists and the sortables key on _id, which is a local handle rather than
// the server row, so a tree read from the API is given one before it is edited.
// Every editing surface needs it, whether it is the training itself or a program
// week reading the same tree to change what it asks for.
export function ensureClientIds(items: TrainingItem[]): void {
	for (const item of items) {
		if (!item._id) item._id = crypto.randomUUID();
		if (item.items) ensureClientIds(item.items);
	}
}

// The right rail, the add zone of a list and the grouping bar all build the
// same blocks, so the defaults a fresh block starts with live here rather than
// in a copy per caller.
export function createTrainingItem(type: TrainingItemType, exerciseId?: string): TrainingItem {
	const item: TrainingItem = { type, _id: crypto.randomUUID() };
	if (type === 'exercise') {
		item.exercise_id = exerciseId;
		item.reps = 1;
		item.rest_seconds = 0;
	} else if (type === 'circuit') {
		item.cycles = 3;
		item.cycle_rest_seconds = 120;
		item.items = [];
	} else if (type === 'emom') {
		item.cycles = 10;
		item.interval_seconds = 60;
		item.items = [];
	} else if (type === 'group') {
		item.group_title = 'Group';
		item.items = [];
	} else if (type === 'repeater') {
		applyHangboardDefaults(item);
	} else if (type === 'hangboard_rep') {
		applyHangboardRepDefaults(item);
	}
	return item;
}
