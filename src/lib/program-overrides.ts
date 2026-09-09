import {
	OVERRIDE_ITEM_FIELDS,
	type HangboardGranularity,
	type ItemOverride,
	type Load,
	type OverrideKey,
	type SessionOverride,
	type StaleOverrideField,
	type TrainingItem,
	type TrainingItemType,
	type VariableTarget,
	type VariableTargets
} from '$lib/api/client';
import { assessmentLabel, formatLoad, type AssessmentCatalog } from '$lib/assessments';
import {
	hangboardGranularity,
	hangboardHandCount,
	hangboardRowCount
} from '$lib/components/training/hangboard-granularity';
import { itemInLayout } from '$lib/components/training/hangboard-config';
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

// The two fields a training may prescribe either as a plain number or as a
// percentage of an assessment. Every client resolves the percentage first, so
// the two cannot both go out for the same field: the one the coach did not set
// is the one the athlete would play.
const VARIABLE_FIELDS = ['reps', 'duration'] as const;

type VariableField = (typeof VARIABLE_FIELDS)[number];

// What the target asks of the assessment, which is the part a coach sets. The
// fallback is left out: the editors mirror the plain number into it, so a week
// that only retyped the number would otherwise read as a new percentage.
function samePercentage(a: VariableTarget | undefined, b: VariableTarget | undefined): boolean {
	return a?.assessment_id === b?.assessment_id && a?.percent === b?.percent;
}

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
//
// It builds a tree rather than reading one, and the tree it builds is the one
// the editor shows: the modal normalises the result, which is what makes it
// TrainingTrees.onScreen and not the wire tree.
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

	// The percentages this week prescribes, read alongside the plain numbers
	// below so the pair cannot contradict itself.
	const targets: VariableTargets = { ...(edited.variable_targets ?? {}) };
	// A percentage this week asks for that the training does not already ask for
	// is the coach prescribing the field that way, so the plain number stays home.
	const prescribesNewPercentage = (field: VariableField) =>
		targets[field] != null && !samePercentage(targets[field], base.variable_targets?.[field]);

	if (
		!isSingleHang &&
		!opensRepCount &&
		!prescribesNewPercentage('reps') &&
		numberChanged(base.reps, edited.reps)
	) {
		override.reps = edited.reps;
	}
	if (isExercise && (edited.reps_is_max ?? false) !== (base.reps_is_max ?? false)) {
		override.reps_is_max = edited.reps_is_max ?? false;
	}
	// Only an exercise is prescribed by time, and it is the only editor that
	// writes a duration, so there is no type to keep this off.
	if (!prescribesNewPercentage('duration') && numberChanged(base.duration, edited.duration)) {
		override.duration = edited.duration;
	}
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
	// A number set over a percentage only reaches the athlete once the percentage
	// is gone, since every client resolves the percentage first: without this the
	// week ships a duration the app never plays and a chip that names it anyway.
	// Only the field the coach set as a number loses its target, so a sibling
	// percentage on the other field is left standing.
	for (const field of VARIABLE_FIELDS) {
		if (override[field] != null) delete targets[field];
	}
	if (JSON.stringify(base.variable_targets ?? {}) !== JSON.stringify(targets)) {
		override.variable_targets = targets;
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
//
// The two trees have to be the same reading of the training, which is what
// TrainingTrees names: a display diff is taken between two normalised trees and
// a wire diff between two written back out in the layout each item declares.
// Mixing them is what Krakoer/crimpy#99 was opened for, and what the rows this
// emits are then read against is decided by which of the two it was handed.
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

// The item the training holds under that id, wherever it sits in the tree.
export function findItem(items: TrainingItem[], itemId: string): TrainingItem | undefined {
	for (const item of items) {
		if (item.id === itemId) return item;
		const found = item.items ? findItem(item.items, itemId) : undefined;
		if (found) return found;
	}
	return undefined;
}

// Puts one item back to what the training prescribes, leaving the rest of the
// week's customisation alone. Only the fields a week may change are restored,
// which is every field the diff could have emitted.
//
// Both trees are the editor's, TrainingTrees.onScreen and the tree it shows: it
// is a gesture on what the coach reads, and putting the wire tree's values into
// the editor would write a layout nobody chose onto the screen.
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
//
// The items are TrainingTrees.onScreen: a chip reads values beside the boxes
// they are being adapted from, so the fallbacks the summary takes off the item
// have to be the ones the coach is looking at.
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

function sameRequest(left: ItemOverride, right: ItemOverride | undefined): boolean {
	if (right === undefined) return false;
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

// The arrays a grid item lays its configuration out in, beside the fields its
// row count is derived from. What one entry of them means follows the layout the
// item declared when the coach typed it, and nothing stored says what that
// layout was.
const GRID_ARRAY_FIELDS = ['loads', 'left_loads', 'hand_positions', 'edge_sizes_mm'] as const;

const GRID_LAYOUT_FIELDS = ['granularity', 'hand', 'reps', 'cycles'] as const;

function sameValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(orderedValue(left)) === JSON.stringify(orderedValue(right));
}

function sameField(left: ItemOverride, right: ItemOverride, field: OverrideKey): boolean {
	return sameValue(left[field], right[field]);
}

function isOverrideKey(field: string): field is OverrideKey {
	return Object.hasOwn(OVERRIDE_ITEM_FIELDS, field);
}

// Whether the row says anything at all about the field. An empty layout array
// prescribes nothing: the merge reads it as a no-op, every client leaves the
// base value in place and the diff never emits one, so a week holding one asks
// the block for nothing there.
function carriesField(row: ItemOverride, field: OverrideKey): boolean {
	const value = row[field];
	if (value === undefined) return false;
	return !Array.isArray(value) || value.length > 0;
}

// What the item ends up with in this field, for a row that says nothing about
// it: the training's own value. A week can declare a value the training has
// since adopted, and the diff then omits it as unchanged, so reading the rows
// alone would have two rows asking for the very same thing read as disagreeing
// about it. It is the reading declaredLayout does of the layout fields together,
// one field at a time.
//
// The item is the one the row was diffed against, which for every row on the
// wire is TrainingTrees.wire and never the editor's tree: the fields the
// normalisation is lossy about are exactly the fields a row leaves out, so the
// editor's tree answers this with the layout it inferred rather than with the
// layout the row was measured against.
function effectiveField(
	wireItem: TrainingItem | undefined,
	row: ItemOverride,
	field: OverrideKey
): unknown {
	const value = row[field];
	if (value !== undefined) return value;
	return wireItem?.[OVERRIDE_ITEM_FIELDS[field]] ?? undefined;
}

// Whether the row on its way to the server still asks of the field what the
// server refused.
//
// variable_targets is compared on the percentage alone, for the reason
// samePercentage gives: the editors mirror the plain number into the fallback,
// so a coach who only retyped that number would otherwise read as having moved
// the percentage the server refused.
function asksTheSameField(
	wireItem: TrainingItem | undefined,
	refused: ItemOverride,
	sent: ItemOverride,
	field: OverrideKey
): boolean {
	if (field === 'variable_targets') {
		const targets = effectiveField(wireItem, sent, field) as VariableTargets | undefined;
		return VARIABLE_FIELDS.every((variable) =>
			samePercentage(refused.variable_targets?.[variable], targets?.[variable])
		);
	}
	return sameValue(refused[field], effectiveField(wireItem, sent, field));
}

// One reason a stale row is refused, and the fields of that row it is about.
export type StaleRefusal = {
	// The check's own answer, which is the wording a save of the same override is
	// refused with.
	reason: string;
	// The fields the reason names that the row carries, which are the fields a
	// coach can move to clear it. Empty where the refusal is about the row as a
	// whole.
	fields: OverrideKey[];
};

// The refusals a stale row carries, one per reason, in the order the validators
// asked them. Entries sharing a reason are one refusal spread over the fields it
// is about, so they are gathered rather than read one at a time: a grid refusal
// spreads over up to five fields, and reading them one at a time would repeat
// the same sentence five times.
function refusalsOf(override: SessionOverride): { reason: string; fields: string[] }[] {
	const byReason = new Map<string, string[]>();
	for (const entry of override.stale_fields ?? []) {
		const named = byReason.get(entry.reason);
		const fields = named ?? [];
		if (entry.field) fields.push(entry.field);
		if (!named) byReason.set(entry.reason, fields);
	}
	return [...byReason].map(([reason, fields]) => ({ reason, fields }));
}

// Which of the refusals the server answered the coach is still asking for.
//
// The reader's rule, whose authority is the comment on
// SessionOverrideResponse.StaleFields in
// crimpy-backend/internal/handler/program_week.go. It is stated here rather than
// in contract/override-keys.json because that file is vendored byte for byte
// into crimpy-app as well, which never reads this field:
//
//   - A refusal names every field the check read, and one reason can name
//     several: an array measured against a row count is about both sides, and
//     either side moving is a value the server has not judged yet.
//   - A named field may be absent from the override row, because a check can
//     read the item's side of a disagreement. A week prescribing three reps on
//     an item whose loads the coach later shrank is refused naming loads,
//     granularity, cycles and reps, and only reps is in the row.
//   - So the named fields the row does not carry are skipped, rather than
//     counted as unchanged. An absent field is absent again after every edit, so
//     counting it would hold the marking up through the very edit that clears
//     the refusal.
//   - What is left is the fields the coach can act on, and the refusal stands
//     while all of them still hold the value the server refused: one of them
//     moving is a row the server has to judge again.
//   - Every refusal necessarily names at least one field the row carries. If
//     every field a check read had come from the item, the item alone would have
//     been refused when the training was written and could not be there to be
//     merged onto. A backend test holds that over the whole refusal table, so a
//     refusal left with nothing of the row to act on is an incomplete
//     attribution there rather than a case to design around, and it is read the
//     way an empty field is read: as a refusal about the row as a whole.
//
// Which pair this is asked of is the lesson of Krakoer/crimpy#99: whether the
// coach is still asking for what the server refused is a question about the
// values that will be sent, so it is asked of the row on its way to the server
// against the row the server judged, and of no opening/current pair at all.
// Neither pair can stand in for that. The display pair is blind to a grid whose
// refused arrays keepStoredGridArrays puts back whatever the coach types beside
// them, and it answers for the whole row at once, which is the bug
// Krakoer/crimpy#100 was opened for. The wire pair is layout-invariant by
// construction, so a coach reaching for the variation selector leaves it byte
// for byte unchanged.
//
// And which tree, for the fields the row leaves out: TrainingTrees.wire, the
// tree the row was diffed against. Handed the editor's tree instead, this reads
// a granularity the normalisation collapsed as a layout the coach moved and
// drops a refusal the next save is still answered with.
function standingRefusals(
	trees: TrainingTrees,
	refused: SessionOverride,
	sent: ItemOverride | undefined
): StaleRefusal[] {
	// Nothing is being asked of the item at all. An item the modal opened on with
	// nothing to diff is not one of these either: there is nothing the coach can
	// keep or rewrite, so nothing here can clear it, and those are
	// staleOverridesDroppedByApply.
	if (sent === undefined) return [];
	const item = findItem(trees.wire, refused.item_id);
	const refusals = refusalsOf(refused);
	// A row the server marked and attributed nothing to is read as a refusal
	// about the row as a whole, which is also what a save of it is refused for.
	if (refusals.length === 0) {
		return sameRequest(refused.overrides, sent) ? [{ reason: '', fields: [] }] : [];
	}
	const standing: StaleRefusal[] = [];
	for (const refusal of refusals) {
		// A name this portal does not read is a key it cannot be carrying, which is
		// the same skip an absent field gets.
		const actionable = refusal.fields
			.filter(isOverrideKey)
			.filter((field) => carriesField(refused.overrides, field));
		const stands =
			actionable.length === 0
				? sameRequest(refused.overrides, sent)
				: actionable.every((field) => asksTheSameField(item, refused.overrides, sent, field));
		if (stands) standing.push({ reason: refusal.reason, fields: actionable });
	}
	return standing;
}

// The row, marked for the refusals that still stand and for those alone: a coach
// who cleared one field of a row refused twice is told about the other, not
// about both.
//
// The fields a refusal named that the row does not carry are left out. Nothing
// of them is on screen for the coach to act on, and a later read of the same
// marking skips them again, so carrying them would only invite a reader that
// counts them.
//
// Which row that is asked of is the row being marked, and on an apply it is not
// the row the refusal was answered for: carryStaleFlags marks the row on its way
// to the server, and the diff omits a field whose value the training has since
// adopted. So a refusal can be left naming nothing of the row it is written
// onto, and it is written as the empty field, which is what a refusal naming no
// field the row carries means to every reader of it: the row as a whole, the
// same answer the reader's rule above and SessionOverrideResponse.StaleFields in
// crimpy-backend/internal/handler/program_week.go give it. The attribution is
// lost at that point and cannot be kept: stale_fields carries a field and a
// reason and no value, so nothing written here could say which value of the
// item's the check refused. Saying so in the row is what keeps the next read of
// it, and the notice under the block, from pointing a coach at a value this week
// does not set.
function markedWith(override: SessionOverride, refusals: StaleRefusal[]): SessionOverride {
	const entries: StaleOverrideField[] = [];
	for (const refusal of refusals) {
		const carried = refusal.fields.filter((field) => carriesField(override.overrides, field));
		if (carried.length === 0) {
			if (refusal.reason) entries.push({ field: '', reason: refusal.reason });
			continue;
		}
		for (const field of carried) entries.push({ field, reason: refusal.reason });
	}
	const marked: SessionOverride = { ...override, override_stale: true };
	if (entries.length > 0) marked.stale_fields = entries;
	else delete marked.stale_fields;
	return marked;
}

// The refusals the block on screen can still be asked to clear, each narrowed to
// the reasons that still stand. An item whose refused fields the coach has since
// rewritten, or whose row they cleared, is left out: only the server judges an
// override, and what it refused is no longer what is being sent.
//
// It takes no opening/current pair at all: the week the server judged and the
// week on its way back to it, which is the pair standingRefusals says why of. Of
// the two trees it reads TrainingTrees.wire, for the reason standingRefusals
// gives: the rows it compares were both diffed against that one.
export function standingStaleOverrides(
	trees: TrainingTrees,
	stored: SessionOverride[],
	sent: SessionOverride[]
): SessionOverride[] {
	const sentByItem = requestByItem(sent);
	const standing: SessionOverride[] = [];
	for (const override of staleOverrides(stored)) {
		const refusals = standingRefusals(trees, override, sentByItem.get(override.item_id));
		if (refusals.length > 0) standing.push(markedWith(override, refusals));
	}
	return standing;
}

// The refusals the merge and the normalisation already undid. A week can store
// a left hand column against an item the training now hangs with both hands
// together: the server refuses the row, and the merge sets it while the
// normalisation wipes it straight back, so the tree the modal opened on asks
// nothing of that item and the diff emits nothing to reset. The row still
// blocks the save while the week holds it, and applying is what drops it.
//
// What the merge and the normalisation undid is a question about the tree the
// coach reads, so it is asked of the opening display diff. The opening request
// is a narrower thing: its item set is a strict subset, since a block whose grid
// reads as the training's own carries no grid field there, and a block with a
// display diff but no wire diff would be classified as already undone and shown
// without the reset that can still clear it.
function staleOverridesDroppedByApply(
	stored: SessionOverride[],
	opened: OpenedWeek
): SessionOverride[] {
	const openedOnScreenByItem = requestByItem(opened.openedOnScreen);
	return staleOverrides(stored).filter(
		(override) => openedOnScreenByItem.get(override.item_id) === undefined
	);
}

// The item the row targets, when it lays its configuration out as a grid, asked
// of the training the way the diff asks it, so the two cannot come to disagree
// about what a grid is. The tree is TrainingTrees.wire: what is read off the
// item here is the layout it is declared in, which is the one thing the editor's
// tree cannot answer.
function gridItem(wire: TrainingItem[], itemId: string): TrainingItem | undefined {
	const item = findItem(wire, itemId);
	if (item === undefined || !GRID_ITEM_TYPES.includes(item.type)) return undefined;
	return item;
}

// The layout a request declares, which is the layout the server lays its arrays
// out in: a field the request leaves out is the training's, so this is read off
// both at once. It is what the stored arrays have to be compared against, rather
// than the raw fields of the two rows: a week can declare a layout field the
// training has since adopted, and the diff then omits it as unchanged, which
// makes two rows asking for the very same grid read as disagreeing about it.
function declaredLayout(base: TrainingItem, override: ItemOverride): string {
	const rows = hangboardRowCount(
		override.granularity ?? base.granularity ?? 'uniform',
		override.cycles ?? base.cycles,
		override.reps ?? base.reps
	);
	const hands = hangboardHandCount(override.hand ?? base.hand ?? 'both');
	return `${rows}x${hands}`;
}

// Whether the item's grid is still exactly what the modal opened on, in a
// request that still declares the layout the stored arrays were written for.
//
// The two halves ask two different things of two different pairs.
//
// Whether the coach touched the grid is a question about the screen, so it is
// asked of the diff they read: the one the modal opened on against the one it
// shows now. The request cannot answer it. It is written in the layout the item
// is declared in whatever layout is on screen, which is what it is for, and that
// makes it blind to the one action this exists to notice: a coach reaching for
// the variation selector on a grid the normalisation had collapsed leaves the
// request byte for byte unchanged, and the stored arrays would go back over the
// layout they just chose.
//
// Whether the request still declares the layout the stored arrays were written
// for is a question about the wire, and it is asked of the request. A coach who
// resized the grid is asking for the arrays to be laid out again, and the
// backend refuses a resize that does not resend them; and every array a request
// carries owes it one entry per row and one column per hand the request
// declares, so stored arrays written for one layout contradict a request
// declaring another. The normalised grid goes out whole there instead, which
// does agree with itself. It is the invariant the substitution owes whatever it
// is handed, and the only place that is checked before the arrays go back.
function gridUntouched(
	base: TrainingItem,
	stored: ItemOverride,
	screen: { opened: ItemOverride; now: ItemOverride },
	request: ItemOverride
): boolean {
	const untouched = [...GRID_LAYOUT_FIELDS, ...GRID_ARRAY_FIELDS].every((field) =>
		sameField(screen.opened, screen.now, field)
	);
	return untouched && declaredLayout(base, stored) === declaredLayout(base, request);
}

// The layout knowledge a request needs and the tree on screen cannot hold.
//
// normalizeHangboardItem rewrites a grid item into the layout its own values
// call for, which is what lets the editor address every rep of every set, and
// the inference is lossy: an item declared per set whose loads coincide reads
// back as uniform and nothing left in the tree says which of the two it was. So
// the layouts are read before that happens, and the request is written in one of
// them rather than in the one the editor inferred.
export interface GridLayouts {
	// The granularity the training declares for each grid item, which is the
	// layout the write path lays that item's arrays out in.
	training: Record<string, HangboardGranularity>;
	// The layout the week's row is written in: its own where it declared one, the
	// training's otherwise, exactly as the write path merges the two.
	stored: Record<string, HangboardGranularity>;
	// The layout the editor opened each item in, which is the only thing that
	// says whether a layout on screen is one the coach chose or one the
	// normalisation inferred.
	opened: Record<string, HangboardGranularity>;
}

function forEachGridItem(
	items: TrainingItem[],
	visit: (item: TrainingItem, itemId: string) => void
): void {
	for (const item of items) {
		if (item.id && GRID_ITEM_TYPES.includes(item.type)) visit(item, item.id);
		if (item.items) forEachGridItem(item.items, visit);
	}
}

export function emptyGridLayouts(): GridLayouts {
	return { training: {}, stored: {}, opened: {} };
}

// Read once, when the week is opened: the training arrives unnormalised, the
// week's row says which layout the coach wrote it in, and the merged tree has
// just been normalised for the editor to read.
export function gridLayouts(
	training: TrainingItem[],
	overrides: SessionOverride[],
	opened: TrainingItem[]
): GridLayouts {
	const byItem = requestByItem(overrides);
	const layouts = emptyGridLayouts();
	forEachGridItem(training, (item, itemId) => {
		layouts.training[itemId] = hangboardGranularity(item);
		layouts.stored[itemId] = byItem.get(itemId)?.granularity ?? hangboardGranularity(item);
	});
	forEachGridItem(opened, (item, itemId) => {
		layouts.opened[itemId] = hangboardGranularity(item);
	});
	return layouts;
}

// The layout each grid item's request is written in: the one on screen where it
// has moved since the week was opened, and the one the item is declared in
// otherwise. A collapse the normalisation performed is a re-expression for the
// editor to read rather than a prescription, so it stays on screen; a layout the
// coach picked from the variation selector is theirs and goes out as it is.
function requestGranularities(
	items: TrainingItem[],
	layouts: GridLayouts
): Record<string, HangboardGranularity> {
	const granularities: Record<string, HangboardGranularity> = {};
	forEachGridItem(items, (item, itemId) => {
		const shown = hangboardGranularity(item);
		const declared = layouts.stored[itemId];
		granularities[itemId] = shown === layouts.opened[itemId] && declared ? declared : shown;
	});
	return granularities;
}

// A tree written out in the given layouts, which is both what a request is built
// from and what it is diffed against.
function itemsInLayouts(
	items: TrainingItem[],
	granularities: Record<string, HangboardGranularity>
): TrainingItem[] {
	return items.map((item) => {
		const nested = item.items
			? { ...item, items: itemsInLayouts(item.items, granularities) }
			: item;
		const granularity = item.id ? granularities[item.id] : undefined;
		return granularity === undefined ? nested : itemInLayout(nested, granularity);
	});
}

// The two readings of one training that every question about a week is asked
// against.
//
// They are both TrainingItem[] and they do not mean the same thing, so they
// travel as one named value rather than as two parameters of one type, for the
// reason WeekGridScope gives about the two pairs of diffs. That guard was given
// to the diffs in Krakoer/crimpy#99 and not to the trees, and the same
// transposition was then written again in Krakoer/crimpy#100: a refusal was
// weighed against the editor's tree while the row it compared had been diffed
// against the write path's. The two disagree on exactly the fields the
// normalisation is lossy about, which are exactly the fields a row leaves out,
// so every field read off the wrong one of them is read wrong and none of it
// type-checks any differently.
export interface TrainingTrees {
	// The training normalised for the editor to read, which is the tree the
	// coach's own tree was merged onto and diffed against. It is the display side
	// of every pair here, and it cannot say what layout an item is declared in:
	// the normalisation collapses an item whose values coincide, and nothing left
	// in it says which of the two it was.
	onScreen: TrainingItem[];
	// The same training written back out in the layout each grid item is declared
	// in, which is how the write path lays it out and what it judges a request
	// against. Every row on the wire was diffed against this tree, so it is the
	// only tree a request or a refusal may be read against: a field such a row
	// leaves out is this tree's value and no other.
	wire: TrainingItem[];
}

// Read once per week, off the tree the editor holds and the layouts taken while
// the training and the week still declared them.
export function trainingTrees(onScreen: TrainingItem[], layouts: GridLayouts): TrainingTrees {
	return { onScreen, wire: itemsInLayouts(onScreen, layouts.training) };
}

// Whether a row says anything at all about the item's grid.
function declaresGrid(override: ItemOverride): boolean {
	if (override.granularity != null) return true;
	return GRID_ARRAY_FIELDS.some((field) => !isEmpty(override[field]));
}

function withoutGrid(override: ItemOverride): ItemOverride {
	const rest: ItemOverride = { ...override };
	delete rest.granularity;
	for (const field of GRID_ARRAY_FIELDS) delete rest[field];
	return rest;
}

// What applying asks of the server, as against what the modal shows.
//
// The two differ in one thing: the layout a grid item's arrays are written in.
// The editor reads a tree normalised into the layout the values call for, while
// the write path merges the override onto the item as it is stored and judges
// every array against the layout that item declares. Diffing the one against the
// other is how the portal came to send a granularity no coach ever chose, and to
// believe a request acceptable that the server refuses. So the request is built
// from the same values the coach edited, written back out in the layout the item
// is declared in, against a training written out the same way.
//
// Which blocks the request carries, and which of them it says anything about the
// grid of, stay the screen's answer. A block the coach put back to the training
// asks nothing of it, and one whose grid reads as the training's own carries no
// grid field, whatever layout it would have been written in: a value the coach
// sees as untouched cannot leave here as a prescription.
function requestOverrides(
	wireBase: TrainingItem[],
	items: TrainingItem[],
	shown: SessionOverride[],
	layouts: GridLayouts
): SessionOverride[] {
	const shownByItem = requestByItem(shown);
	const wireItems = itemsInLayouts(items, requestGranularities(items, layouts));
	const request: SessionOverride[] = [];
	for (const override of diffOverrides(wireBase, wireItems)) {
		const onScreen = shownByItem.get(override.item_id);
		if (onScreen === undefined) continue;
		const overrides = declaresGrid(onScreen) ? override.overrides : withoutGrid(override.overrides);
		if (Object.keys(overrides).length > 0) request.push({ ...override, overrides });
	}
	return request;
}

// The week as the modal opened on it, which is what every question about what
// has moved since is measured against.
export interface OpenedWeek {
	// The diff the coach read the moment the tree was built, both trees
	// normalised: the only thing that says whether a grid on screen has moved
	// since, and whether the layout it is in is one they chose.
	openedOnScreen: SessionOverride[];
	// What the week asked of the server the moment it was opened. A refusal is no
	// longer measured against this: standingRefusals compares the fields the
	// server named against the stored row itself, which it can do because
	// keepStoredGridArrays puts the stored arrays back on the outgoing row. What
	// is left is one question, and it asks about existence rather than about what
	// has moved: an item the modal opened on with nothing to ask of the server has
	// no arrays the server ever judged, so there is nothing to keep for it.
	openedRequest: SessionOverride[];
}

export function emptyOpenedWeek(): OpenedWeek {
	return { openedOnScreen: [], openedRequest: [] };
}

// The four diffs the substitution weighs. They are all diffs of the same week
// and they do not mean the same thing: two are what the coach reads, two are
// what the server is asked for, and each pair answers a question the other pair
// cannot. So they travel as one named value rather than as four parameters of
// one type, the way weekSyncScope does in
// crimpy-backend/internal/handler/program_week.go: a transposition would compile
// and then quietly answer "did the coach touch this grid" off the wire, which is
// the failure Krakoer/crimpy#99 was opened for, running the other way.
export interface WeekGridScope extends OpenedWeek {
	// The diff the coach reads now, against openedOnScreen: the display pair, and
	// the only pair that can answer whether they have touched something. Both
	// sides carry the normalisation, so a layout the coach picked by hand moves it
	// and a layout the normalisation inferred does not.
	onScreen: SessionOverride[];
	// What the week asks of the server now, against openedRequest: the wire pair,
	// and the only pair that can answer what the server was and is being asked
	// for. Both sides are written in the layout each item is declared in, which
	// makes the pair layout-invariant by construction: it cannot see a layout the
	// coach chose, and nothing may ask it to.
	request: SessionOverride[];
}

// What the week goes back asking, with the grid of every block the coach did not
// touch left as the week stored it.
//
// The editor addresses every rep of every set, so the tree it is handed is
// normalised into the layout the training now declares, and an array a week
// wrote against another row count is rewritten to fit: values move between the
// sets, and the rows the training added are filled from a fallback. That is the
// only tree the editor can work in, but it is a guess, because nothing stored
// says which layout the coach typed those numbers against. Emitting it would
// persist the guess the first time anyone so much as opened the week, over a
// prescription the coach never revisited and cannot get back.
//
// So the rewrite stays on screen and out of the request. A block whose grid the
// coach did touch goes out whole and normalised, which is what makes what they
// see be what they get and keeps the arrays agreeing with the row count. A block
// they did not touch goes back as it was stored, which leaves a refused week
// refused, marked and clearable rather than quietly rewritten into a week that
// saves and prescribes something else.
//
// Which pair answers what here follows gridUntouched, which this hands both to:
// whether the coach touched the grid is asked of the display pair, whether the
// row going out still declares the layout the stored arrays were written for is
// asked of the request. The wire pair is read for one thing only, and it is not
// a comparison: an item the opening request said nothing of has no judged arrays
// to keep.
//
// The arrays that go back are the arrays the server has already judged, in a
// request declaring the layout it judged them in, so applying can never turn a
// week the server takes into one it refuses, and never rewrites a number the
// coach typed. The converse does not hold, and not because of anything here: an
// array the diff no longer emits is not one this can put back. A week asking a
// left hand column of a block the training now hangs with both hands together
// is refused for that column, the normalisation wipes it before the diff runs,
// and the row that goes back carries the rest, so applying alone can turn that
// refused week into one the server takes while the block still shows its notice
// and its reset.
//
// Of the two trees it reads TrainingTrees.wire, and for the same reason it reads
// the request rather than the screen for the layout half: what it asks of the
// item is the layout the stored arrays are judged in.
export function keepStoredGridArrays(
	trees: TrainingTrees,
	stored: SessionOverride[],
	scope: WeekGridScope
): SessionOverride[] {
	const storedByItem = requestByItem(stored);
	const openedRequestByItem = requestByItem(scope.openedRequest);
	const openedScreenByItem = requestByItem(scope.openedOnScreen);
	const screenByItem = requestByItem(scope.onScreen);
	return scope.request
		.map((override) => {
			const item = gridItem(trees.wire, override.item_id);
			if (item === undefined) return override;
			// An item the modal opened on with nothing to ask of the server has no
			// judged arrays to keep, and one the request carries that the screen says
			// nothing about is not a grid anyone can be reading: both go out as the
			// diff built them.
			if (openedRequestByItem.get(override.item_id) === undefined) return override;
			const openedOnScreen = openedScreenByItem.get(override.item_id);
			const onScreen = screenByItem.get(override.item_id);
			if (openedOnScreen === undefined || onScreen === undefined) return override;
			const storedRequest = storedByItem.get(override.item_id) ?? {};
			const screen = { opened: openedOnScreen, now: onScreen };
			if (!gridUntouched(item, storedRequest, screen, override.overrides)) return override;
			// Held by reference, as the diff itself holds the arrays of the tree it
			// read: this row is on its way to the server, and copying a week's own
			// state to hand it straight back would only invite a snapshot helper
			// that this module, which no component owns, cannot reach for.
			const kept: ItemOverride = { ...override.overrides };
			for (const field of GRID_ARRAY_FIELDS) {
				if (kept[field] === undefined) continue;
				// An empty array prescribes nothing, which the diff never emits and the
				// merge reads as a no-op, so a week holding one stored no layout array
				// at all here.
				const value = storedRequest[field];
				if (isEmpty(value)) delete kept[field];
				else (kept[field] as unknown) = value;
			}
			return { ...override, overrides: kept };
		})
		.filter((override) => Object.keys(override.overrides).length > 0);
}

// The diffs of one week, the display one and the wire one, built the one way
// both the snapshot and every later question read them. Each is taken against
// the tree of TrainingTrees that answers for it, which is the whole of what
// makes the two diffs mean what their names say.
function weekDiffs(
	trees: TrainingTrees,
	items: TrainingItem[],
	layouts: GridLayouts
): { onScreen: SessionOverride[]; request: SessionOverride[] } {
	const onScreen = diffOverrides(trees.onScreen, items);
	return { onScreen, request: requestOverrides(trees.wire, items, onScreen, layouts) };
}

// The pair every later question about this week is measured against, taken once
// when the modal builds the tree.
//
// It is its own function because a week being opened and a week being weighed
// are two different questions, and weekOverrides answering both meant a call
// site that forgot to pass the snapshot silently got "this is the week being
// opened" rather than a type error, which is the hazard WeekGridScope exists to
// prevent. The stored week is not read here: nothing about what the coach was
// shown depends on it, which is the whole reason the two split cleanly.
export function openWeek(
	trees: TrainingTrees,
	items: TrainingItem[],
	layouts: GridLayouts
): OpenedWeek {
	const { onScreen, request } = weekDiffs(trees, items, layouts);
	return { openedOnScreen: onScreen, openedRequest: request };
}

// Everything the modal derives from the week on screen, wired here rather than
// in the component.
//
// Which tree is diffed against which, and which of those diffs answers what the
// coach has touched against which answers what the server is being asked for, is
// the whole of it. The two are not interchangeable and the modal reading one off
// the other is a bug of exactly the kind a unit spec is meant to catch, which it
// cannot while the specs wire the chain up a second time for themselves. So the
// wiring lives here and both go through it.
export interface WeekOverrides {
	// The diff the coach reads on this week, both trees normalised, so a layout
	// the normalisation inferred on each side is not read as this week's doing.
	// It is the display side of every pair here, and what it answers is whether
	// the coach has touched something, not what this week customises: the layout
	// they picked can prescribe exactly what the training already does, and then
	// this carries a row the request says nothing of.
	onScreen: SessionOverride[];
	// The same week as the server reads it: the coach's values written out in the
	// layout each item is declared in. The editor's own layout is a re-expression
	// of those values rather than a prescription, so it stays on screen.
	request: SessionOverride[];
	// What applying actually sends, which is the request with the grid of every
	// block the coach did not touch left as the week stored it. It is what the
	// week will hold, so it is also what any claim that this week customises a
	// block has to be read off.
	sent: SessionOverride[];
	// The refusals the block on screen can still be asked to clear, each carrying
	// the reasons that still stand and the fields of the row they are about.
	standing: SessionOverride[];
	// The refusals the merge and the normalisation already undid, which nothing on
	// screen asks for and applying is what drops.
	droppedByApply: SessionOverride[];
}

// `opened` is the pair openWeek took when the modal built the tree, and it is
// required: a week weighed against itself has by definition been touched
// nowhere, which is an answer, not a default.
export function weekOverrides(
	trees: TrainingTrees,
	items: TrainingItem[],
	stored: SessionOverride[],
	layouts: GridLayouts,
	opened: OpenedWeek
): WeekOverrides {
	const { onScreen, request } = weekDiffs(trees, items, layouts);
	const scope: WeekGridScope = { ...opened, onScreen, request };
	const sent = keepStoredGridArrays(trees, stored, scope);
	return {
		onScreen,
		request,
		sent,
		// Read off the row on its way to the server, field by field: a block the
		// coach has just cleared or rewritten stops being marked before they apply,
		// and a field the row still asks for keeps its marking through an edit to
		// any other field of the same block. Against the wire tree, which is the
		// tree that row was diffed against.
		standing: standingStaleOverrides(trees, stored, sent),
		droppedByApply: staleOverridesDroppedByApply(stored, opened)
	};
}

// What the week holds after the coach applies the modal. A refusal is carried
// onto a row that still asks the server for the field it refused, so a week
// merely opened and applied does not read as fixed while the save is still going
// to be refused.
//
// It is the same question standingStaleOverrides asks, of the same pair and the
// same tree, so a block the modal marks is a block the next save is still
// refused for and a block the coach rewrote goes out as a request the server has
// not judged. The row carried out is the one on its way to the server rather
// than the stored one, since that is what the week will hold, and it is that row
// the marking is attributed against: markedWith says why.
export function carryStaleFlags(
	trees: TrainingTrees,
	stored: SessionOverride[],
	sent: SessionOverride[]
): SessionOverride[] {
	const refused = new Map(staleOverrides(stored).map((override) => [override.item_id, override]));
	return sent.map((override) => {
		const stale = refused.get(override.item_id);
		if (!stale) return override;
		const refusals = standingRefusals(trees, stale, override.overrides);
		if (refusals.length === 0) return override;
		return markedWith(override, refusals);
	});
}

export const STALE_OVERRIDE_LEAD =
	'The training changed and no longer takes what this week asks of this block, so the athlete plays it as the training writes it and the week cannot be saved until this is cleared.';

// The same refusal on a block whose request the merge already undid. There is
// nothing on screen asking for it any more, so the coach is pointed at Apply
// rather than at a reset that has nothing left to shrink.
export const STALE_OVERRIDE_DROPPED_LEAD =
	'The training changed and no longer takes what this week asked of this block, and nothing of it is left to change here: the athlete plays it as the training writes it, and the week cannot be saved until the refused row goes.';

// Clearing is resetItemToBase: the server stores and judges what a week asks of
// an item as one row, so the refused part cannot be dropped on its own, and a
// coach who set a rest here as well loses that with it.
export const STALE_OVERRIDE_RESET_WARNING =
	'Resetting puts this block back to the training whole, so anything else this week asks of it goes too.';

// The refused row is the whole of what this week asked of the item, or the diff
// would have kept the rest of it on screen, so applying costs the coach nothing
// they can still see.
export const STALE_OVERRIDE_APPLY_NOTE =
	'Applying this week drops the refused row, and nothing else this week asks of the block goes with it.';

// What a coach calls each override key on the block it sits under. Typed over
// the key union, so a key the backend adds cannot leave a refusal marked against
// a field the block has no words for.
const OVERRIDE_FIELD_LABELS = {
	cycles: 'sets',
	cycle_rest_seconds: 'rest between sets',
	interval_seconds: 'interval',
	reps: 'rep count',
	reps_is_max: 'AMRAP marker',
	duration: 'duration',
	rest_seconds: 'rest',
	hb_worktime_seconds: 'work time',
	hand: 'hand mode',
	granularity: 'layout',
	load_is_max: 'max effort marker',
	loads: 'loads',
	left_loads: 'left hand loads',
	hand_positions: 'grips',
	edge_sizes_mm: 'edge sizes',
	variable_targets: 'percentage of an assessment'
} as const satisfies Record<OverrideKey, string>;

// cycles is a set on a repeater and a round on an emom, which the summary
// already reads off the item, so the item is asked here as well rather than the
// key alone. Only the type is read, which both trees of TrainingTrees agree on:
// the normalisation moves values around inside an item and never its type.
export function overrideFieldLabel(field: OverrideKey, base?: TrainingItem): string {
	if (field === 'cycles' && base?.type === 'emom') return 'rounds';
	if (field === 'cycle_rest_seconds' && base?.type === 'emom') return 'rest between rounds';
	return OVERRIDE_FIELD_LABELS[field];
}

// One refusal as the block under it has to render it: which of this week's
// values the check refuses, in the coach's words, and the check's own answer.
//
// The two can name different things, and that is pinned on the backend rather
// than an accident: a left_loads refusal is attributed to left_loads while its
// wording says "invalid loads". So the label is the authority on which value is
// at fault, and the wording is handed over as the check's own words rather than
// as a sentence naming a field, which is what keeps a coach from being sent to
// the wrong column.
export type StaleRefusalLine = {
	// The values the check refuses, named and joined, or empty where the refusal
	// is about the row as a whole and there is no field to point at.
	fields: string;
	// The refusal in the validator's own words. Empty for a marking that arrived
	// without one, which still says the training no longer takes the row.
	reason: string;
};

function joinFieldLabels(labels: string[]): string {
	if (labels.length <= 1) return labels.join('');
	return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// The refusals of a marked row, one line per reason. It is read off stale_fields
// rather than off a narrower shape so the row a marking travels on is the row
// the wire carries, and grouping happens where it is rendered.
//
// Only the fields the row carries are named, which is the same skip the marking
// is decided with. A refusal names every field the check read, the item's side
// of the disagreement included, and the line says "this week's": a week asking
// for a left hand column on a block the training now hangs with both hands
// together sets no hand mode, and naming one would send the coach to a value the
// training is what holds. Rows read straight off the server are the ones this
// matters for, since markedWith has already narrowed the fields of every row the
// portal marked itself.
export function staleRefusalLines(
	override: SessionOverride,
	base?: TrainingItem
): StaleRefusalLine[] {
	return refusalsOf(override).map((refusal) => ({
		fields: joinFieldLabels(
			refusal.fields
				.filter(isOverrideKey)
				.filter((field) => carriesField(override.overrides, field))
				.map((field) => overrideFieldLabel(field, base))
		),
		reason: refusal.reason.trim()
	}));
}
