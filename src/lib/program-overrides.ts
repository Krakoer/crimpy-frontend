import type {
	ItemOverride,
	Load,
	SessionOverride,
	TrainingItem,
	TrainingItemType
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

	if (!isSingleHang && numberChanged(base.reps, edited.reps)) override.reps = edited.reps;
	if (isExercise && (edited.reps_is_max ?? false) !== (base.reps_is_max ?? false)) {
		override.reps_is_max = edited.reps_is_max ?? false;
	}
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
	for (const field of [
		'cycles',
		'cycle_rest_seconds',
		'interval_seconds',
		'reps',
		'reps_is_max',
		'duration',
		'rest_seconds',
		'worktime_seconds',
		'hand',
		'granularity',
		'load_is_max',
		'loads',
		'left_loads',
		'hand_positions',
		'edge_sizes_mm',
		'variable_targets'
	] as const) {
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
