import {
	OVERRIDE_ITEM_FIELDS,
	type ItemOverride,
	type Load,
	type SessionOverride,
	type TrainingItem,
	type TrainingItemType,
	type VariableTargets
} from '$lib/api/client';
import { assessmentLabel, formatLoad, type AssessmentCatalog } from '$lib/assessments';
import type { OverrideHistoryByItem } from '$lib/components/training/override-context';

// A program schedules the same training in several weeks and lets the coach
// change what it prescribes in one of them without touching the training. What
// a week may change is a closed set, mirrored from itemOverride in
// crimpy-backend/internal/handler/training_items.go: the exercises, the blocks
// and their nesting are fixed, only the configuration moves.

// The item types that lay their configuration out as a grid. How many rows the
// grid has is derived from the granularity, the sets and the reps, so anything
// that moves those invalidates the arrays written against the old shape.
const GRID_ITEM_TYPES: TrainingItemType[] = ['repeater', 'hangboard_rep'];

function isEmpty(value: unknown[] | undefined | null): boolean {
	return !value || value.length === 0;
}

// An override carrying an empty variable_targets is a value, not a no-op: it
// says this week prescribes no percentage where the training holds one.
function isEmptyTargets(targets: VariableTargets | undefined): boolean {
	return targets != null && Object.keys(targets).length === 0;
}

// An override carrying an empty layout array prescribes nothing, so every client
// leaves the base value in place rather than wiping it. The merge has to agree,
// and the diff must never emit one.
function applyItemOverride(item: TrainingItem, override: ItemOverride): void {
	if (override.cycles != null) item.cycles = override.cycles;
	if (override.cycle_rest_seconds != null) item.cycle_rest_seconds = override.cycle_rest_seconds;
	if (override.interval_seconds != null) item.interval_seconds = override.interval_seconds;
	if (override.reps != null) item.reps = override.reps;
	if (override.reps_is_max != null) item.reps_is_max = override.reps_is_max;
	if (override.duration != null) item.duration = override.duration;
	if (override.rest_seconds != null) item.rest_seconds = override.rest_seconds;
	if (override.hb_worktime_seconds != null) item.worktime_seconds = override.hb_worktime_seconds;
	if (override.hand != null) item.hand = override.hand;
	if (override.granularity != null) item.granularity = override.granularity;
	if (override.load_is_max != null) item.load_is_max = override.load_is_max;
	if (!isEmpty(override.loads)) item.loads = override.loads;
	if (!isEmpty(override.left_loads)) item.left_loads = override.left_loads;
	if (!isEmpty(override.hand_positions)) item.hand_positions = override.hand_positions;
	if (!isEmpty(override.edge_sizes_mm)) item.edge_sizes_mm = override.edge_sizes_mm;
	// An empty variable_targets is a value rather than a no-op: it says this week
	// prescribes no percentage where the training holds one.
	if (override.variable_targets != null) item.variable_targets = override.variable_targets;
}

// The training as one week of the program prescribes it. The tree is cloned, so
// the editor it feeds cannot write back into the training it was read from.
export function mergeOverrides(
	items: TrainingItem[],
	overrides: SessionOverride[]
): TrainingItem[] {
	const byItem = new Map(overrides.map((override) => [override.item_id, override.overrides]));
	const merged = structuredClone(items);
	const walk = (list: TrainingItem[]) => {
		for (const item of list) {
			const override = item.id ? byItem.get(item.id) : undefined;
			if (override) applyItemOverride(item, override);
			if (item.items) walk(item.items);
		}
	};
	walk(merged);
	return merged;
}

// A column nothing was prescribed in comes back from the API as null, while the
// editors write the zero that means the same thing, so the two are read as one
// value here. Without that, merely opening a week would look like the coach had
// set a rest of zero on every block whose rest the training never named.
function numberChanged(base: number | undefined, edited: number | undefined): edited is number {
	return edited != null && edited !== (base ?? 0);
}

function arrayChanged<T>(base: T[] | undefined, edited: T[] | undefined): edited is T[] {
	if (isEmpty(edited)) return false;
	return JSON.stringify(base ?? []) !== JSON.stringify(edited);
}

function diffItem(base: TrainingItem, edited: TrainingItem): ItemOverride {
	const override: ItemOverride = {};

	// A hangboard_rep is a single hang: the fields describing a repeated one
	// belong to the repeater above it, and the backend refuses them here whether
	// they arrive on the item or through an override.
	const isSingleHang = base.type === 'hangboard_rep';
	// The leftover of an emom interval is already the rest of its round, so a
	// stored rest would read as a gap the block never plays.
	const isEmom = base.type === 'emom';
	// The AMRAP marker stands in for a rep count, and only an exercise has one to
	// leave open. The backend refuses it anywhere else.
	const isExercise = base.type === 'exercise';

	// An open rep count prescribes no number, so a count edited on the way to
	// pressing AMRAP is not sent: it would contradict the marker in the chip and
	// sit dead in the prescription snapshot, which resolves the marker first.
	const opensRepCount = isExercise && edited.reps_is_max === true;
	if (!isSingleHang && !opensRepCount && numberChanged(base.reps, edited.reps)) {
		override.reps = edited.reps;
	}
	if (isExercise && (edited.reps_is_max ?? false) !== (base.reps_is_max ?? false)) {
		override.reps_is_max = edited.reps_is_max ?? false;
	}
	// Only an exercise is prescribed by time, and it is the only editor that
	// writes a duration, so there is no type to keep this off.
	if (numberChanged(base.duration, edited.duration)) override.duration = edited.duration;
	// What makes the block every minute on the minute is its interval, and the
	// backend refuses one on anything that is not an emom.
	if (isEmom && numberChanged(base.interval_seconds, edited.interval_seconds)) {
		override.interval_seconds = edited.interval_seconds;
	}
	if (!isSingleHang && numberChanged(base.cycles, edited.cycles)) override.cycles = edited.cycles;
	if (
		!isSingleHang &&
		!isEmom &&
		numberChanged(base.cycle_rest_seconds, edited.cycle_rest_seconds)
	) {
		override.cycle_rest_seconds = edited.cycle_rest_seconds;
	}
	if (!isEmom && numberChanged(base.rest_seconds, edited.rest_seconds)) {
		override.rest_seconds = edited.rest_seconds;
	}
	if (numberChanged(base.worktime_seconds, edited.worktime_seconds)) {
		override.hb_worktime_seconds = edited.worktime_seconds;
	}
	// The editors freeze the hand mode, so this normally finds nothing. It is
	// still compared, because an override written elsewhere carries hand, the
	// merge honours it, and a diff blind to it would drop it from the week the
	// first time the coach opened the block and pressed Apply.
	if (edited.hand && edited.hand !== base.hand) override.hand = edited.hand;
	if (edited.granularity && edited.granularity !== base.granularity) {
		override.granularity = edited.granularity;
	}
	if (arrayChanged(base.loads, edited.loads)) override.loads = edited.loads;
	if (arrayChanged(base.left_loads, edited.left_loads)) override.left_loads = edited.left_loads;
	if (arrayChanged(base.hand_positions, edited.hand_positions)) {
		override.hand_positions = edited.hand_positions;
	}
	if (arrayChanged(base.edge_sizes_mm, edited.edge_sizes_mm)) {
		override.edge_sizes_mm = edited.edge_sizes_mm;
	}
	if (
		JSON.stringify(base.variable_targets ?? {}) !== JSON.stringify(edited.variable_targets ?? {})
	) {
		override.variable_targets = edited.variable_targets ?? {};
	}

	// Resizing the grid invalidates every array laid out against the old shape,
	// so the backend refuses an override that resizes it without resending them.
	// They go out whole whenever anything the row count is derived from moved.
	const resized =
		GRID_ITEM_TYPES.includes(base.type) &&
		(override.granularity != null ||
			override.hand != null ||
			override.reps != null ||
			override.cycles != null);
	if (resized) {
		if (!isEmpty(edited.loads)) override.loads = edited.loads;
		if (!isEmpty(edited.left_loads)) override.left_loads = edited.left_loads;
		if (!isEmpty(edited.hand_positions)) override.hand_positions = edited.hand_positions;
		if (!isEmpty(edited.edge_sizes_mm)) override.edge_sizes_mm = edited.edge_sizes_mm;
	}

	// The item level marker is what older clients read a max effort from, so a
	// week that lowers one to a number has to clear it or the app says MAX where
	// the plan says the number. It mirrors the load units and moves only when they
	// do, so it goes out with them: reading it alone would make a training whose
	// flag drifted from its loads look overridden the moment a week was opened.
	const loadsMoved = override.loads != null || override.left_loads != null;
	if (loadsMoved && (edited.load_is_max ?? false) !== (base.load_is_max ?? false)) {
		override.load_is_max = edited.load_is_max ?? false;
	}

	return override;
}

// What the edited tree asks for that the training does not, item by item. An
// item whose override came out empty is left out, and the week save then drops
// the row it had, so clearing a customisation is the same act as never making
// one.
export function diffOverrides(base: TrainingItem[], edited: TrainingItem[]): SessionOverride[] {
	const diffed: SessionOverride[] = [];
	const walk = (baseList: TrainingItem[], editedList: TrainingItem[]) => {
		const editedByID = new Map(
			editedList.filter((item) => item.id).map((item) => [item.id!, item])
		);
		for (const baseItem of baseList) {
			const editedItem = baseItem.id ? editedByID.get(baseItem.id) : undefined;
			if (!editedItem) continue;
			const override = diffItem(baseItem, editedItem);
			if (Object.keys(override).length > 0) {
				diffed.push({ item_id: baseItem.id!, overrides: override });
			}
			if (baseItem.items && editedItem.items) walk(baseItem.items, editedItem.items);
		}
	};
	walk(base, edited);
	return diffed;
}

const HAND_LABELS: Record<string, string> = {
	both: 'both hands',
	alternate: 'alternating hands',
	split: 'split hands',
	left: 'left hand',
	right: 'right hand'
};

const GRANULARITY_LABELS: Record<string, string> = {
	uniform: 'one setting',
	rep: 'per rep',
	set: 'per set'
};

function fmtSeconds(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	if (minutes > 0 && rest > 0) return `${minutes}mn ${rest}s`;
	if (minutes > 0) return `${minutes}mn`;
	return `${rest}s`;
}

function loadsSummary(loads: Load[], catalog: AssessmentCatalog): string {
	const first = formatLoad(loads[0], catalog);
	const uniform = loads.every((load) => formatLoad(load, catalog) === first);
	return uniform ? first : `${first} and up`;
}

// What one week asks for that the training does not, in a line short enough to
// sit under the item it is about. It names the values, not the fields, so a
// coach reading the weeks side by side compares numbers rather than labels.
export function overrideSummary(
	base: TrainingItem,
	override: ItemOverride,
	catalog: AssessmentCatalog
): string {
	const parts: string[] = [];
	if (override.reps != null) parts.push(`${override.reps} reps`);
	// A week that closes an open rep count carries the marker and keeps the count
	// the training named, so the chip reads that one rather than saying nothing.
	if (override.reps_is_max === true) parts.push('AMRAP');
	else if (override.reps_is_max === false && override.reps == null) {
		parts.push(`${base.reps ?? 0} reps`);
	}
	if (override.duration != null) parts.push(fmtSeconds(override.duration));
	if (override.interval_seconds != null) {
		parts.push(`every ${fmtSeconds(override.interval_seconds)}`);
	}
	if (override.cycles != null) {
		parts.push(`${override.cycles} ${base.type === 'emom' ? 'rounds' : 'sets'}`);
	}
	if (override.hb_worktime_seconds != null) {
		parts.push(`${fmtSeconds(override.hb_worktime_seconds)} work`);
	}
	if (override.rest_seconds != null) parts.push(`${fmtSeconds(override.rest_seconds)} rest`);
	if (override.cycle_rest_seconds != null) {
		parts.push(`${fmtSeconds(override.cycle_rest_seconds)} set rest`);
	}
	if (override.hand) parts.push(HAND_LABELS[override.hand] ?? override.hand);
	if (override.granularity) parts.push(GRANULARITY_LABELS[override.granularity]);
	if (!isEmpty(override.loads)) parts.push(loadsSummary(override.loads!, catalog));
	if (!isEmpty(override.left_loads)) {
		parts.push(`left ${loadsSummary(override.left_loads!, catalog)}`);
	}
	if (!isEmpty(override.edge_sizes_mm)) {
		const edges = override.edge_sizes_mm!;
		const uniform = edges.every((edge) => edge === edges[0]);
		parts.push(uniform ? `${edges[0]}mm` : 'mixed edges');
	}
	if (!isEmpty(override.hand_positions)) parts.push('grips');
	const target = override.variable_targets?.reps ?? override.variable_targets?.duration;
	if (target) parts.push(`${target.percent}% ${assessmentLabel(target.assessment_id, catalog)}`);
	// A week that only clears the training's percentage prescribes the plain
	// value instead. Left unnamed it summarises to nothing, and the strip then
	// hides a block the footer counts as customised, so the coach sees a week
	// they cannot read.
	if (parts.length === 0 && isEmptyTargets(override.variable_targets)) {
		parts.push(base.duration ? fmtSeconds(base.duration) : `${base.reps ?? 0} reps`);
	}
	return parts.join(', ');
}

function findItem(items: TrainingItem[], itemId: string): TrainingItem | undefined {
	for (const item of items) {
		if (item.id === itemId) return item;
		const found = item.items ? findItem(item.items, itemId) : undefined;
		if (found) return found;
	}
	return undefined;
}

// Whether this week asks anything of the item that the training does not.
export function itemIsOverridden(
	base: TrainingItem[],
	edited: TrainingItem[],
	itemId: string
): boolean {
	const baseItem = findItem(base, itemId);
	const editedItem = findItem(edited, itemId);
	if (!baseItem || !editedItem) return false;
	return Object.keys(diffItem(baseItem, editedItem)).length > 0;
}

// Puts one item back to what the training prescribes, leaving the rest of the
// week's customisation alone. Only the fields a week may change are restored,
// which is every field the diff could have emitted.
export function resetItemToBase(
	base: TrainingItem[],
	edited: TrainingItem[],
	itemId: string
): void {
	const baseItem = findItem(base, itemId);
	const editedItem = findItem(edited, itemId);
	if (!baseItem || !editedItem) return;
	// The lists key on _id, and an editor that mirrors a field into its own boxes
	// reads the item once when it is created. A fresh key is what makes it read
	// the restored values rather than write its own back over them.
	editedItem._id = crypto.randomUUID();
	// Read off the override key set rather than listed again here, so a key the
	// backend adds cannot leave a field the week can change and the reset cannot
	// put back.
	for (const field of Object.values(OVERRIDE_ITEM_FIELDS)) {
		const value = baseItem[field];
		if (value === undefined) delete editedItem[field];
		else (editedItem[field] as unknown) = structuredClone(value);
	}
}

// One row of the program that schedules the training the strip is about.
export type ScheduledRow = {
	key: string;
	week: number;
	// Where in the week it sits, in the words the grid uses for that column.
	placement: string;
	overrides: SessionOverride[];
	current: boolean;
};

// What every week of the program asks of each item, for the strip that lets a
// coach set this week's load next to the ones they already set. A week that
// schedules the training twice contributes a chip per row, named by its day, so
// two rows asking different things are not folded into one claim.
export function buildOverrideHistory(
	items: TrainingItem[],
	rows: ScheduledRow[],
	catalog: AssessmentCatalog
): OverrideHistoryByItem {
	const history: OverrideHistoryByItem = {};
	const collect = (list: TrainingItem[]) => {
		for (const item of list) {
			if (item.id) history[item.id] = [];
			if (item.items) collect(item.items);
		}
	};
	collect(items);
	const perWeek = new Map<number, number>();
	for (const row of rows) perWeek.set(row.week, (perWeek.get(row.week) ?? 0) + 1);
	for (const row of [...rows].sort((a, b) => a.week - b.week)) {
		const byItem = new Map(row.overrides.map((o) => [o.item_id, o.overrides]));
		const label =
			(perWeek.get(row.week) ?? 0) > 1 && row.placement
				? `W${row.week} ${row.placement}`
				: `W${row.week}`;
		for (const itemId of Object.keys(history)) {
			const base = findItem(items, itemId);
			const override = byItem.get(itemId);
			history[itemId].push({
				key: row.key,
				label,
				summary: base && override ? overrideSummary(base, override, catalog) : '',
				current: row.current
			});
		}
	}
	return history;
}

// The same values whatever order their keys arrived in, and without the ones
// JSON.stringify would drop anyway. An override read from the server carries the
// key order the database kept it in, while the modal rebuilds it from the
// training item and the fields the coach set: same request, different object.
export function orderedValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(orderedValue);
	if (value === null || typeof value !== 'object') return value;
	return Object.entries(value as Record<string, unknown>)
		.filter(([, entry]) => entry !== undefined)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, entry]) => [key, orderedValue(entry)]);
}

function sameRequest(left: ItemOverride | undefined, right: ItemOverride | undefined): boolean {
	if (left === undefined || right === undefined) return left === right;
	return JSON.stringify(orderedValue(left)) === JSON.stringify(orderedValue(right));
}

function requestByItem(overrides: SessionOverride[]): Map<string, ItemOverride> {
	return new Map(overrides.map((override) => [override.item_id, override.overrides]));
}

// An override the training item it targets no longer takes. The server computes
// it on the week read, against the training as it now stands: the athlete is
// handed the block without it, and the write path refuses the same override with
// the same words, so the week cannot be saved again until it is cleared.
export function staleOverrides(overrides: SessionOverride[]): SessionOverride[] {
	return overrides.filter((override) => override.override_stale === true);
}

// The refusals still standing against what the week asks now. An item whose
// override the coach has since changed or cleared is left out: only the server
// judges an override, and the one it refused is no longer the one being sent.
//
// The question is whether the coach has touched the item, and the stored row is
// the wrong thing to ask it of: merging and normalising rewrite a grid item's
// arrays into the layout the training now declares, so a freshly opened week
// already diffs to something other than the row the server refused, and a
// comparison against that row would leave every grid override unmarked. What is
// compared instead is the diff the modal built when it opened, which carries the
// same normalisation as the diff on screen.
export function standingStaleOverrides(
	stored: SessionOverride[],
	opening: SessionOverride[],
	current: SessionOverride[]
): SessionOverride[] {
	const openingByItem = requestByItem(opening);
	const currentByItem = requestByItem(current);
	return staleOverrides(stored).filter((override) =>
		sameRequest(openingByItem.get(override.item_id), currentByItem.get(override.item_id))
	);
}

// What the week holds after the coach applies the modal. A refusal is carried
// onto an override that came back asking exactly what it asked before, so a week
// merely opened and applied does not read as fixed while the save is still
// refused. An override the coach rewrote loses the flag: the server has not
// judged the new value, and the save is what will tell them.
export function carryStaleFlags(
	stored: SessionOverride[],
	opening: SessionOverride[],
	edited: SessionOverride[]
): SessionOverride[] {
	const standing = new Map(
		standingStaleOverrides(stored, opening, edited).map((override) => [override.item_id, override])
	);
	return edited.map((override) => {
		const stale = standing.get(override.item_id);
		if (!stale) return override;
		return { ...override, override_stale: true, stale_reason: stale.stale_reason };
	});
}

const STALE_OVERRIDE_LEAD =
	'The training changed and no longer takes what this week asks of this block, so the athlete plays it as the training writes it and the week cannot be saved until this is cleared.';

// Clearing is resetItemToBase: the server stores and judges what a week asks of
// an item as one row, so the refused part cannot be dropped on its own, and a
// coach who set a rest here as well loses that with it.
export const STALE_OVERRIDE_RESET_WARNING =
	'Resetting puts this block back to the training whole, so anything else this week asks of it goes too.';

// stale_reason is the wording the write path answers a refused save with, not
// copy written for a coach, so it is quoted as the check's own answer rather
// than passed off as an explanation of what to do about it.
export function staleOverrideNotice(reason?: string): string {
	const refusal = reason?.trim();
	if (!refusal) return STALE_OVERRIDE_LEAD;
	return `${STALE_OVERRIDE_LEAD} The check refuses it as: ${refusal}`;
}
