import { describe, expect, it } from 'vitest';
import type { ItemOverride, SessionOverride, TrainingItem } from '$lib/api/client';
import {
	buildOverrideHistory,
	carryStaleFlags,
	diffOverrides,
	keepStoredGridArrays,
	mergeOverrides,
	overrideSummary,
	resetItemToBase,
	staleOverrideDroppedNotice,
	staleOverrideNotice,
	staleOverrides,
	staleOverridesDroppedByApply,
	standingStaleOverrides
} from './program-overrides';
import {
	commonConfig,
	currentLayout,
	normalizeHangboardItems,
	rebuildArrays,
	storedConfig
} from '$lib/components/training/hangboard-config';
import { applyItemReadDefaults } from '$lib/components/training/item-defaults';
import { prepareEditableTree } from '$lib/components/training/create-item';
import type { AssessmentCatalog } from '$lib/assessments';

const catalog: AssessmentCatalog = {};

function exercise(id: string, extra: Partial<TrainingItem> = {}): TrainingItem {
	return { id, _id: id, type: 'exercise', reps: 8, rest_seconds: 60, ...extra };
}

function repeater(id: string, extra: Partial<TrainingItem> = {}): TrainingItem {
	return {
		id,
		_id: id,
		type: 'repeater',
		reps: 2,
		cycles: 1,
		granularity: 'uniform',
		worktime_seconds: 7,
		loads: [{ value: 20, unit: 'kg' }],
		edge_sizes_mm: [20],
		...extra
	};
}

describe('mergeOverrides', () => {
	it('replaces only the fields the override names', () => {
		const merged = mergeOverrides(
			[exercise('a', { loads: [{ value: 20, unit: 'kg' }] })],
			[{ item_id: 'a', overrides: { reps: 10 } }]
		);
		expect(merged[0].reps).toBe(10);
		expect(merged[0].rest_seconds).toBe(60);
		expect(merged[0].loads).toEqual([{ value: 20, unit: 'kg' }]);
	});

	it('reads hb_worktime_seconds onto the item worktime', () => {
		const merged = mergeOverrides(
			[repeater('a')],
			[{ item_id: 'a', overrides: { hb_worktime_seconds: 10 } }]
		);
		expect(merged[0].worktime_seconds).toBe(10);
	});

	it('keeps the base value where the override array is empty', () => {
		const merged = mergeOverrides([repeater('a')], [{ item_id: 'a', overrides: { loads: [] } }]);
		expect(merged[0].loads).toEqual([{ value: 20, unit: 'kg' }]);
	});

	it('takes an empty variable_targets as a value', () => {
		const base = [
			exercise('a', {
				variable_targets: { reps: { assessment_id: 'x', percent: 80, fallback: 8 } }
			})
		];
		const merged = mergeOverrides(base, [{ item_id: 'a', overrides: { variable_targets: {} } }]);
		expect(merged[0].variable_targets).toEqual({});
	});

	it('retimes a duration and moves an emom clock', () => {
		const base: TrainingItem[] = [
			exercise('a', { reps: undefined, duration: 30 }),
			{ id: 'e', _id: 'e', type: 'emom', cycles: 10, interval_seconds: 60 }
		];
		const merged = mergeOverrides(base, [
			{ item_id: 'a', overrides: { duration: 45 } },
			{ item_id: 'e', overrides: { interval_seconds: 90 } }
		]);
		expect(merged[0].duration).toBe(45);
		expect(merged[1].interval_seconds).toBe(90);
	});

	it('takes a marker turned off as a value rather than a no op', () => {
		const base = [
			exercise('a', { reps_is_max: true }),
			repeater('h', { load_is_max: true, loads: [{ value: 0, unit: 'max' }] })
		];
		const merged = mergeOverrides(base, [
			{ item_id: 'a', overrides: { reps_is_max: false } },
			{
				item_id: 'h',
				overrides: { load_is_max: false, loads: [{ value: 25, unit: 'kg' }] }
			}
		]);
		expect(merged[0].reps_is_max).toBe(false);
		expect(merged[1].load_is_max).toBe(false);
	});

	it('reaches items nested in a container', () => {
		const base: TrainingItem[] = [
			{ id: 'c', _id: 'c', type: 'circuit', cycles: 3, items: [exercise('a')] }
		];
		const merged = mergeOverrides(base, [{ item_id: 'a', overrides: { reps: 12 } }]);
		expect(merged[0].items![0].reps).toBe(12);
	});

	it('clones, so the editor cannot write into the training it read', () => {
		const base = [exercise('a')];
		const merged = mergeOverrides(base, []);
		merged[0].reps = 99;
		expect(base[0].reps).toBe(8);
	});
});

describe('diffOverrides', () => {
	it('emits only what moved', () => {
		const base = [exercise('a')];
		const edited = structuredClone(base);
		edited[0].reps = 10;
		expect(diffOverrides(base, edited)).toEqual([{ item_id: 'a', overrides: { reps: 10 } }]);
	});

	it('drops an item nothing moved on', () => {
		const base = [exercise('a'), exercise('b')];
		const edited = structuredClone(base);
		edited[1].rest_seconds = 90;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'b', overrides: { rest_seconds: 90 } }
		]);
	});

	it('round trips through the merge', () => {
		const base = [exercise('a')];
		const edited = structuredClone(base);
		edited[0].reps = 10;
		edited[0].loads = [{ value: 25, unit: 'kg' }];
		const merged = mergeOverrides(base, diffOverrides(base, edited));
		expect(merged).toEqual(edited);
	});

	it('never emits an empty layout array, which the clients read as a no op', () => {
		const base = [repeater('a')];
		const edited = structuredClone(base);
		edited[0].loads = [];
		expect(diffOverrides(base, edited)).toEqual([]);
	});

	it('leaves the repeat fields off a hangboard_rep, which the backend refuses there', () => {
		const base = [
			{ id: 'a', _id: 'a', type: 'hangboard_rep', reps: 1, worktime_seconds: 7 } as TrainingItem
		];
		const edited = structuredClone(base);
		edited[0].reps = 3;
		edited[0].cycle_rest_seconds = 30;
		edited[0].worktime_seconds = 10;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { hb_worktime_seconds: 10 } }
		]);
	});

	it('leaves the rests off an emom, whose interval already is its rest', () => {
		const base = [
			{ id: 'a', _id: 'a', type: 'emom', cycles: 5, interval_seconds: 60 } as TrainingItem
		];
		const edited = structuredClone(base);
		edited[0].cycles = 8;
		edited[0].rest_seconds = 20;
		edited[0].cycle_rest_seconds = 20;
		expect(diffOverrides(base, edited)).toEqual([{ item_id: 'a', overrides: { cycles: 8 } }]);
	});

	it('emits the duration a week retimed', () => {
		const base = [exercise('a', { reps: undefined, duration: 30 })];
		const edited = structuredClone(base);
		edited[0].duration = 45;
		expect(diffOverrides(base, edited)).toEqual([{ item_id: 'a', overrides: { duration: 45 } }]);
	});

	it('emits the interval of an emom and of nothing else', () => {
		const base: TrainingItem[] = [
			{ id: 'e', _id: 'e', type: 'emom', cycles: 10, interval_seconds: 60 },
			{ id: 'c', _id: 'c', type: 'circuit', cycles: 3, interval_seconds: 60 }
		];
		const edited = structuredClone(base);
		edited[0].interval_seconds = 90;
		edited[1].interval_seconds = 90;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'e', overrides: { interval_seconds: 90 } }
		]);
	});

	it('emits the AMRAP marker of an exercise and of nothing else', () => {
		const base: TrainingItem[] = [exercise('a'), repeater('r')];
		const edited = structuredClone(base);
		edited[0].reps_is_max = true;
		edited[1].reps_is_max = true;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { reps_is_max: true } }
		]);
	});

	it('leaves the rep count out when the same edit opens it', () => {
		// The coach may type a number on the way to pressing AMRAP. Sending both
		// contradicts the chip and sits dead in the snapshot, which resolves the
		// marker first.
		const base = [exercise('a', { reps: 5 })];
		const edited = structuredClone(base);
		edited[0].reps = 8;
		edited[0].reps_is_max = true;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { reps_is_max: true } }
		]);
	});

	it('states a rep count closed again rather than dropping the marker', () => {
		const base = [exercise('a', { reps_is_max: true })];
		const edited = structuredClone(base);
		edited[0].reps_is_max = false;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { reps_is_max: false } }
		]);
	});

	it('sends the max effort marker with the loads it mirrors', () => {
		const base = [repeater('a', { load_is_max: true, loads: [{ value: 0, unit: 'max' }] })];
		const edited = structuredClone(base);
		edited[0].loads = [{ value: 25, unit: 'kg' }];
		edited[0].load_is_max = false;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { loads: [{ value: 25, unit: 'kg' }], load_is_max: false } }
		]);
	});

	it('leaves the max effort marker alone when the loads did not move', () => {
		// A training whose flag drifted from its load units must not read as a week
		// that overrode something, merely because the editor put the two back in step.
		const base = [repeater('a', { load_is_max: false, loads: [{ value: 0, unit: 'max' }] })];
		const edited = structuredClone(base);
		edited[0].load_is_max = true;
		expect(diffOverrides(base, edited)).toEqual([]);
	});

	it('resends the layout arrays when the grid is resized', () => {
		const base = [repeater('a')];
		const edited = structuredClone(base);
		edited[0].reps = 3;
		edited[0].loads = [
			{ value: 20, unit: 'kg' },
			{ value: 20, unit: 'kg' },
			{ value: 20, unit: 'kg' }
		];
		edited[0].granularity = 'rep';
		edited[0].edge_sizes_mm = [20, 20, 20];
		const [override] = diffOverrides(base, edited);
		expect(override.overrides.reps).toBe(3);
		expect(override.overrides.granularity).toBe('rep');
		expect(override.overrides.loads).toHaveLength(3);
		expect(override.overrides.edge_sizes_mm).toEqual([20, 20, 20]);
	});

	it('states an emptied variable target rather than dropping the key', () => {
		const base = [
			exercise('a', {
				variable_targets: { reps: { assessment_id: 'x', percent: 80, fallback: 8 } }
			})
		];
		const edited = structuredClone(base);
		delete edited[0].variable_targets;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { variable_targets: {} } }
		]);
	});

	it('clears the percentage of the field a week set as a number', () => {
		// Every client resolves the percentage before the plain value, so a week
		// that sends the seconds alone prescribes something the athlete never plays.
		const base = [
			exercise('a', {
				reps: undefined,
				duration: 60,
				variable_targets: { duration: { assessment_id: 'x', percent: 75, fallback: 60 } }
			})
		];
		const edited = structuredClone(base);
		edited[0].duration = 120;
		edited[0].variable_targets!.duration!.fallback = 120;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { duration: 120, variable_targets: {} } }
		]);
	});

	it('clears the percentage of a rep count a week set as a number', () => {
		const base = [
			exercise('a', {
				reps: 8,
				variable_targets: { reps: { assessment_id: 'x', percent: 75, fallback: 8 } }
			})
		];
		const edited = structuredClone(base);
		edited[0].reps = 12;
		edited[0].variable_targets!.reps!.fallback = 12;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'a', overrides: { reps: 12, variable_targets: {} } }
		]);
	});

	it('leaves the percentage of the other field standing', () => {
		const base = [
			exercise('a', {
				reps: 8,
				duration: 60,
				variable_targets: {
					duration: { assessment_id: 'x', percent: 75, fallback: 60 },
					reps: { assessment_id: 'y', percent: 90, fallback: 8 }
				}
			})
		];
		const edited = structuredClone(base);
		edited[0].duration = 120;
		expect(diffOverrides(base, edited)).toEqual([
			{
				item_id: 'a',
				overrides: {
					duration: 120,
					variable_targets: { reps: { assessment_id: 'y', percent: 90, fallback: 8 } }
				}
			}
		]);
	});

	it('leaves an item the training prescribes as a plain number alone', () => {
		const base = [exercise('a', { reps: undefined, duration: 60 })];
		const edited = structuredClone(base);
		edited[0].duration = 120;
		expect(diffOverrides(base, edited)).toEqual([{ item_id: 'a', overrides: { duration: 120 } }]);
	});

	it('leaves the plain number out when the week sets a percentage instead', () => {
		// The other half of the same contradiction: the number would sit in the
		// chip next to a percentage that is what actually plays.
		const base = [
			exercise('a', {
				reps: undefined,
				duration: 60,
				variable_targets: { duration: { assessment_id: 'x', percent: 75, fallback: 60 } }
			})
		];
		const edited = structuredClone(base);
		edited[0].duration = 120;
		edited[0].variable_targets!.duration = { assessment_id: 'x', percent: 90, fallback: 120 };
		expect(diffOverrides(base, edited)).toEqual([
			{
				item_id: 'a',
				overrides: {
					variable_targets: { duration: { assessment_id: 'x', percent: 90, fallback: 120 } }
				}
			}
		]);
	});

	it('reads a week that cleared the percentage back out unchanged', () => {
		const base = [
			exercise('a', {
				reps: undefined,
				duration: 60,
				variable_targets: { duration: { assessment_id: 'x', percent: 75, fallback: 60 } }
			})
		];
		const override = { duration: 120, variable_targets: {} };
		const merged = mergeOverrides(base, [{ item_id: 'a', overrides: override }]);
		expect(diffOverrides(base, merged)).toEqual([{ item_id: 'a', overrides: override }]);
	});

	it('reads a hand an override already carries back out, so Apply does not drop it', () => {
		const base = [repeater('a', { hand: 'both' })];
		const merged = mergeOverrides(base, [{ item_id: 'a', overrides: { hand: 'right' } }]);
		const [override] = diffOverrides(base, merged);
		expect(override.overrides.hand).toBe('right');
	});

	it('takes a field the API left null as the zero the editors write', () => {
		// The API sends a column nothing was prescribed in as null, and the editors
		// mirror the seconds into their own boxes and write a number straight back.
		const base = [exercise('a', { rest_seconds: null as unknown as undefined })];
		const edited = structuredClone(base);
		edited[0].rest_seconds = 0;
		expect(diffOverrides(base, edited)).toEqual([]);
	});

	it('diffs items nested in a container', () => {
		const base: TrainingItem[] = [
			{ id: 'c', _id: 'c', type: 'circuit', cycles: 3, items: [exercise('a')] }
		];
		const edited = structuredClone(base);
		edited[0].cycles = 4;
		edited[0].items![0].reps = 12;
		expect(diffOverrides(base, edited)).toEqual([
			{ item_id: 'c', overrides: { cycles: 4 } },
			{ item_id: 'a', overrides: { reps: 12 } }
		]);
	});
});

describe('overrideSummary', () => {
	it('names the values the week asks for', () => {
		const summary = overrideSummary(
			exercise('a'),
			{ reps: 10, loads: [{ value: 22.5, unit: 'kg' }] },
			catalog
		);
		expect(summary).toBe('10 reps, 22.5 kg');
	});

	it('calls the cycles of an emom rounds', () => {
		const base = { id: 'a', _id: 'a', type: 'emom', cycles: 5 } as TrainingItem;
		expect(overrideSummary(base, { cycles: 8 }, catalog)).toBe('8 rounds');
	});

	it('names the timings a week moved', () => {
		expect(overrideSummary(exercise('a'), { duration: 45 }, catalog)).toBe('45s');
		const emom = { id: 'e', _id: 'e', type: 'emom', cycles: 10 } as TrainingItem;
		expect(overrideSummary(emom, { interval_seconds: 90 }, catalog)).toBe('every 1mn 30s');
	});

	it('names an open rep count, and the count that closes it again', () => {
		expect(overrideSummary(exercise('a'), { reps_is_max: true }, catalog)).toBe('AMRAP');
		expect(
			overrideSummary(
				exercise('a', { reps: 8, reps_is_max: true }),
				{ reps_is_max: false },
				catalog
			)
		).toBe('8 reps');
	});

	it('names the plain value a week that cleared the percentage falls back to', () => {
		// Left unnamed the chip is blank, and the strip hides a block the footer
		// counts as customised.
		expect(overrideSummary(exercise('a', { reps: 8 }), { variable_targets: {} }, catalog)).toBe(
			'8 reps'
		);
		expect(
			overrideSummary(
				exercise('a', { reps: undefined, duration: 90 }),
				{ variable_targets: {} },
				catalog
			)
		).toBe('1mn 30s');
	});

	it('says the loads climb rather than naming every one', () => {
		const summary = overrideSummary(
			repeater('a'),
			{
				loads: [
					{ value: 20, unit: 'kg' },
					{ value: 25, unit: 'kg' }
				]
			},
			catalog
		);
		expect(summary).toBe('20 kg and up');
	});
});

describe('buildOverrideHistory', () => {
	const row = (key: string, week: number, placement: string, overrides: ItemOverride | null) => ({
		key,
		week,
		placement,
		overrides: overrides ? [{ item_id: 'a', overrides }] : [],
		current: key === 'current'
	});

	it('gives every scheduled row its own chip, named by its week', () => {
		const history = buildOverrideHistory(
			[exercise('a')],
			[row('w1', 1, 'Mon', null), row('current', 2, 'Mon', { reps: 10 })],
			catalog
		);
		expect(
			history.a.map((entry) => [entry.key, entry.label, entry.summary, entry.current])
		).toEqual([
			['w1', 'W1', '', false],
			['current', 'W2', '10 reps', true]
		]);
	});

	it('names the day when one week schedules the training twice', () => {
		// Two chips reading W2 would key the strip on the same value and take the
		// page down with it, as well as saying nothing about which row is which.
		const history = buildOverrideHistory(
			[exercise('a')],
			[row('mon', 2, 'Mon', { reps: 10 }), row('thu', 2, 'Thu', { reps: 6 })],
			catalog
		);
		expect(history.a.map((entry) => entry.key)).toEqual(['mon', 'thu']);
		expect(history.a.map((entry) => entry.label)).toEqual(['W2 Mon', 'W2 Thu']);
	});
});

describe('stale overrides', () => {
	const refused = {
		id: 'row-1',
		item_id: 'a',
		overrides: { reps_is_max: true },
		override_stale: true,
		stale_reason:
			'reps_is_max leaves the rep count open and cannot also be a percentage of an assessment'
	};

	it('names only the overrides the server refused', () => {
		expect(
			staleOverrides([refused, { item_id: 'b', overrides: { reps: 5 }, override_stale: false }])
		).toEqual([refused]);
	});

	const opening = [{ item_id: 'a', overrides: { reps_is_max: true } }];

	it('keeps the refusal standing while the week asks the same thing', () => {
		// The modal rebuilds the request from the training item, so the same
		// override comes back as a different object with its keys in another order.
		// Nothing of an exercise is rewritten on its way out, so the request sent is
		// the diff itself.
		const current = [{ item_id: 'a', overrides: { reps_is_max: true } }];
		expect(standingStaleOverrides([refused], opening, current, current)).toEqual([refused]);
	});

	it('drops the refusal once the block is cleared or rewritten', () => {
		expect(standingStaleOverrides([refused], opening, [], [])).toEqual([]);
		const rewritten = [{ item_id: 'a', overrides: { reps: 4 } }];
		expect(standingStaleOverrides([refused], opening, rewritten, rewritten)).toEqual([]);
	});

	it('carries the refusal onto a week applied without clearing it', () => {
		// The request goes back as the server refused it, key for key, so what it
		// answered still holds.
		const applied = carryStaleFlags(
			[refused],
			[
				{ item_id: 'a', overrides: { reps_is_max: true } },
				{ item_id: 'b', overrides: { reps: 5 } }
			]
		);
		expect(applied[0].override_stale).toBe(true);
		expect(applied[0].stale_reason).toBe(refused.stale_reason);
		expect(applied[1].override_stale).toBeUndefined();
	});

	it('lets a rewritten override go back to the server unflagged', () => {
		// Only the write path judges a value the read never saw, so the save is
		// what tells the coach whether the rewrite holds.
		const applied = carryStaleFlags([refused], [{ item_id: 'a', overrides: { reps: 4 } }]);
		expect(applied[0].override_stale).toBeUndefined();
	});

	it('quotes the validator rather than passing its words off as coach copy', () => {
		const notice = staleOverrideNotice(refused.stale_reason);
		expect(notice).toContain('The training changed');
		expect(notice).toContain(`The check refuses it as: ${refused.stale_reason}`);
	});

	it('still says what happened when the refusal came without a reason', () => {
		expect(staleOverrideNotice()).toContain('The training changed');
		expect(staleOverrideNotice('  ')).not.toContain('refuses it as');
	});
});

// A grid item is the case a comparison against the stored row cannot answer: the
// merge and the normalisation rewrite loads, grips and edges into the layout the
// training now declares, so the modal never re-emits the array the server
// refused. These run the modal's own pipeline rather than a hand written diff,
// which is what made the hole invisible to the first round of tests.
describe('a stale override on a grid item', () => {
	const kg = (value: number) => ({ value, unit: 'kg' as const });
	const REFUSED_REASON = 'loads holds 18 entries but the granularity declares 24 rows';

	// Three sets of the given reps, one load and one edge per rep, the sets
	// loaded differently so the layout the training declares is the one its own
	// values call for.
	function gridTraining(reps: number): TrainingItem[] {
		const rows = 3 * reps;
		const items: TrainingItem[] = [
			{
				id: 'grid',
				_id: 'grid',
				type: 'repeater',
				cycles: 3,
				reps,
				granularity: 'set',
				worktime_seconds: 7,
				rest_seconds: 3,
				loads: Array.from({ length: rows }, (_, row) => kg(20 + Math.floor(row / reps) * 2)),
				edge_sizes_mm: Array.from({ length: rows }, () => 20)
			}
		];
		normalizeHangboardItems(items);
		applyItemReadDefaults(items, []);
		return items;
	}

	// The week stores the loads it was written against, six reps a set, while the
	// training now runs eight.
	const stored: SessionOverride[] = [
		{
			item_id: 'grid',
			overrides: { loads: Array.from({ length: 18 }, (_, row) => kg(25 + row)) },
			override_stale: true,
			stale_reason: REFUSED_REASON
		}
	];

	// What the modal holds the moment it opens the week on the current training.
	function openModal() {
		const baseItems = gridTraining(8);
		const merged = mergeOverrides(baseItems, stored);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, []);
		prepareEditableTree(merged);
		// Cloned as the modal clones it: the diff hands back the arrays of the tree
		// it read, and the request the modal opened on has to hold still.
		return {
			baseItems,
			items: merged,
			opening: structuredClone(diffOverrides(baseItems, merged))
		};
	}

	it('cannot be recognised by comparing the request against the stored row', () => {
		const { opening } = openModal();
		expect(opening[0].overrides.loads).not.toEqual(stored[0].overrides.loads);
	});

	it('is marked, so the block can offer clearing', () => {
		const { baseItems, items, opening } = openModal();
		const current = diffOverrides(baseItems, items);
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		const standing = standingStaleOverrides(stored, opening, current, sent);
		expect(standing.map((override) => override.item_id)).toEqual(['grid']);
		expect(standing[0].stale_reason).toBe(REFUSED_REASON);
	});

	it('stays marked while the coach edits something else on the block', () => {
		// The refused arrays go back whatever the coach types beside them, so the
		// marking cannot be answered by the whole row still matching: unmarking the
		// block here would tell a coach the week is clean and then have the save
		// refuse it, with nothing left on screen saying why.
		const { baseItems, items, opening } = openModal();
		items[0].rest_seconds = 90;
		const current = diffOverrides(baseItems, items);
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		expect(sent[0].overrides.rest_seconds).toBe(90);
		expect(sent[0].overrides.loads).toEqual(stored[0].overrides.loads);

		const standing = standingStaleOverrides(stored, opening, current, sent);
		expect(standing.map((override) => override.item_id)).toEqual(['grid']);
		expect(carryStaleFlags(stored, sent)[0].override_stale).toBe(true);
	});

	it('is rewritten into the layout the training declares for the editor to read', () => {
		// The editor addresses every rep of every set, so the tree it is handed
		// carries one entry per row the granularity declares. The eighteen loads
		// the coach typed against six reps a set are spread over twenty four rows
		// and the rows the training added are filled from a fallback, which is a
		// guess: nothing stored says which layout those numbers were typed against.
		const { baseItems, items } = openModal();
		const emitted = diffOverrides(baseItems, items);
		expect(emitted[0].overrides.loads).toHaveLength(24);
		expect(emitted[0].overrides.loads).not.toEqual(stored[0].overrides.loads);
	});

	it('goes back to the server as the week stored it while the coach leaves it alone', () => {
		// The guess above stays on screen. Applying a week nobody touched writes
		// nothing: the coach's eighteen loads are still the week's, so they can be
		// read, kept or cleared rather than being replaced by a rewrite of
		// themselves.
		const { baseItems, items, opening } = openModal();
		const sent = keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items));
		expect(sent).toHaveLength(1);
		expect(sent[0].overrides).toEqual(stored[0].overrides);
	});

	it('keeps its marking on an apply, since the request the server refused goes back', () => {
		// The marking in the modal answers whether the coach touched the item; what
		// the flag carried out of it answers is whether the next save is refused.
		// The two agree now that an untouched grid goes back as it was stored.
		const { baseItems, items, opening } = openModal();
		const sent = keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items));
		const applied = carryStaleFlags(stored, sent);
		const flagged = applied.find((override) => override.item_id === 'grid');
		expect(flagged?.override_stale).toBe(true);
		expect(flagged?.stale_reason).toBe(REFUSED_REASON);
	});

	it('goes back laid out again once the coach edits a load', () => {
		// A grid the coach worked in is theirs, and every array of it has to agree
		// with the row count the training declares, so it goes out whole.
		const { baseItems, items, opening } = openModal();
		items[0].loads![0] = kg(99);
		const sent = keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items));
		expect(sent[0].overrides.loads).toHaveLength(24);
		expect(sent[0].overrides.loads![0]).toEqual(kg(99));
	});

	it('goes back laid out again once the coach resizes the grid', () => {
		// Resizing is the coach asking for the arrays to be laid out against the
		// new row count, and the backend refuses a resize that does not resend
		// them, so the stored arrays are not what goes back there.
		const { baseItems, items, opening } = openModal();
		const item = items[0];
		const seed = commonConfig(item);
		const before = currentLayout(item, 'set');
		item.reps = 4;
		rebuildArrays(item, 'set', before, seed);
		const sent = keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items));
		expect(sent[0].overrides.reps).toBe(4);
		expect(sent[0].overrides.loads).toHaveLength(12);
	});

	it('loses its marking once the coach rewrites the grid', () => {
		// What goes back then is the coach's own work laid out against the row
		// count the training declares, which is not the row the server refused.
		const { baseItems, items, opening } = openModal();
		items[0].loads![0] = kg(99);
		const current = diffOverrides(baseItems, items);
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		expect(standingStaleOverrides(stored, opening, current, sent)).toEqual([]);
	});

	it('leaves an override on another item alone', () => {
		// An item that lays nothing out as a grid is answered by the training, the
		// way the diff answers it, rather than by whether its fields happen to look
		// like a grid.
		const { baseItems, items, opening } = openModal();
		const current = [
			...diffOverrides(baseItems, items),
			{ item_id: 'amrap', overrides: { reps_is_max: true } }
		];
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		expect(sent.find((override) => override.item_id === 'amrap')?.overrides).toEqual({
			reps_is_max: true
		});
	});

	it('keeps a non-grid refusal, which does go back byte for byte', () => {
		const refused: SessionOverride[] = [
			{
				item_id: 'amrap',
				overrides: { reps_is_max: true },
				override_stale: true,
				stale_reason: 'reps_is_max leaves the rep count open'
			}
		];
		const applied = carryStaleFlags(refused, [
			{ item_id: 'amrap', overrides: { reps_is_max: true } }
		]);
		expect(applied[0].override_stale).toBe(true);
	});

	it('loses its marking once the coach clears the block', () => {
		const { baseItems, items, opening } = openModal();
		resetItemToBase(baseItems, items, 'grid');
		const current = diffOverrides(baseItems, items);
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		expect(standingStaleOverrides(stored, opening, current, sent)).toEqual([]);
		expect(carryStaleFlags(stored, sent)).toEqual(sent);
	});
});

// The normalisation rewrites every array of the item, not only the one the week
// stored, so a week that asked the block for one thing comes back asking for
// three. Those extra arrays are the training's own values reshaped, which is a
// prescription no coach ever wrote, and the week must not start carrying them.
describe('a grid override the normalisation reaches past', () => {
	const kg = (value: number) => ({ value, unit: 'kg' as const });

	// Two sets of two reps, the edges and the grips varying from set to set, so
	// collapsing the item to a single row cannot keep them.
	function gridTraining(): TrainingItem[] {
		const items: TrainingItem[] = [
			{
				id: 'grid',
				_id: 'grid',
				type: 'repeater',
				cycles: 2,
				reps: 2,
				hand: 'both',
				granularity: 'set',
				worktime_seconds: 7,
				rest_seconds: 3,
				loads: [kg(20), kg(20), kg(22), kg(22)],
				edge_sizes_mm: [20, 20, 14, 14],
				hand_positions: [['HC', 'HC', 'FC', 'FC']]
			}
		];
		normalizeHangboardItems(items);
		applyItemReadDefaults(items, []);
		return items;
	}

	// The week asks the block for one load everywhere, which is the shape the
	// item declared when the coach wrote it.
	const stored: SessionOverride[] = [
		{ item_id: 'grid', overrides: { granularity: 'uniform', loads: [kg(30)] } }
	];

	function openModal(week: SessionOverride[] = stored) {
		const baseItems = gridTraining();
		const merged = mergeOverrides(baseItems, week);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, []);
		prepareEditableTree(merged);
		// Cloned as the modal clones it: the diff hands back the arrays of the tree
		// it read, and the request the modal opened on has to hold still.
		return {
			baseItems,
			items: merged,
			opening: structuredClone(diffOverrides(baseItems, merged))
		};
	}

	it('reaches the edges and the grips the week never asked about', () => {
		const emitted = openModal().opening;
		expect(emitted[0].overrides.edge_sizes_mm).toEqual([20]);
		expect(emitted[0].overrides.hand_positions).toEqual([['HC']]);
	});

	it('sends back only what the week asked for', () => {
		const { baseItems, items, opening } = openModal();
		const sent = keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items));
		expect(sent).toHaveLength(1);
		expect(sent[0].overrides).toEqual(stored[0].overrides);
	});

	it('drops the row entirely when the arrays were the whole of it', () => {
		// Nothing but rewritten arrays is nothing the week asked for, so the row
		// goes rather than being sent empty.
		const opening: SessionOverride[] = [{ item_id: 'grid', overrides: { loads: [kg(30)] } }];
		expect(keepStoredGridArrays(gridTraining(), [], opening, opening)).toEqual([]);
	});

	it('drops an array the week stored empty rather than handing it back', () => {
		// An empty layout array prescribes nothing: every client leaves the base
		// value in place, the merge agrees, and the diff never emits one. A week
		// holding one asks the block for nothing there, so nothing is what goes
		// back, rather than the one array the request must never carry.
		const week: SessionOverride[] = [
			{ item_id: 'grid', overrides: { granularity: 'uniform', loads: [], rest_seconds: 30 } }
		];
		const { baseItems, items, opening } = openModal(week);
		const sent = keepStoredGridArrays(baseItems, week, opening, diffOverrides(baseItems, items));
		expect(sent[0].overrides).toEqual({ granularity: 'uniform', rest_seconds: 30 });
	});
});

// The case the substitution cannot be blind to: a week whose stored arrays the
// server takes, laid out for the very layout the training declares, that the
// normalisation still moves. Every value of the merged item agrees, so it reads
// back as varying by nothing and collapses to a single row, and the request the
// modal opens on declares that collapse. Putting the stored arrays into it would
// hand the write path a row whose arrays are eight rows long beside a
// granularity declaring one, which it refuses in the same words it refuses a
// week the coach really did outgrow, on a week nothing was ever wrong with.
describe('a grid override the normalisation collapses', () => {
	const kg = (value: number) => ({ value, unit: 'kg' as const });

	// Two sets of four reps, loaded per set, hung on one edge with one grip.
	function gridTraining(): TrainingItem[] {
		const items: TrainingItem[] = [
			{
				id: 'grid',
				_id: 'grid',
				type: 'repeater',
				cycles: 2,
				reps: 4,
				hand: 'both',
				granularity: 'set',
				worktime_seconds: 7,
				rest_seconds: 3,
				loads: [kg(10), kg(10), kg(10), kg(10), kg(12), kg(12), kg(12), kg(12)],
				edge_sizes_mm: Array.from({ length: 8 }, () => 20),
				hand_positions: [Array.from({ length: 8 }, () => 'HC')]
			}
		];
		normalizeHangboardItems(items);
		applyItemReadDefaults(items, []);
		return items;
	}

	// One load for all eight rows this training declares, which is a row the
	// server takes: it is never marked stale, so there is no notice, no reset and
	// nothing on screen to tell the coach anything is amiss.
	const stored: SessionOverride[] = [
		{ item_id: 'grid', overrides: { loads: Array.from({ length: 8 }, () => kg(14)) } }
	];

	// How many rows the write path reads the request as declaring, mirrored from
	// hangboardRowCount in crimpy-backend/internal/handler/training_items.go. It
	// judges the item the override is merged onto, so a field the request leaves
	// out is the training's.
	function declaredRows(base: TrainingItem, override: ItemOverride): number {
		const granularity = override.granularity ?? base.granularity ?? 'uniform';
		const reps = override.reps ?? base.reps ?? 1;
		const cycles = override.cycles ?? base.cycles ?? 1;
		if (granularity === 'set') return cycles * reps;
		if (granularity === 'rep') return reps;
		return 1;
	}

	function openModal() {
		const baseItems = gridTraining();
		const merged = mergeOverrides(baseItems, stored);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, []);
		prepareEditableTree(merged);
		return {
			baseItems,
			items: merged,
			opening: structuredClone(diffOverrides(baseItems, merged))
		};
	}

	function sentRequest() {
		const { baseItems, items, opening } = openModal();
		return {
			baseItems,
			sent: keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items))
		};
	}

	it('is a row the server takes, laid out for the training as it stands', () => {
		const base = gridTraining()[0];
		expect(stored[0].overrides.loads).toHaveLength(declaredRows(base, stored[0].overrides));
		expect(stored[0].override_stale).toBeUndefined();
	});

	it('is collapsed to a single row for the editor to read', () => {
		const opening = openModal().opening;
		expect(opening[0].overrides.granularity).toBe('uniform');
		expect(opening[0].overrides.loads).toHaveLength(1);
	});

	it('goes back declaring the layout the arrays it carries are laid out for', () => {
		// The invariant a request owes whatever else it does: one entry per row it
		// declares itself. Eight stored loads under a granularity declaring one row
		// is the row the write path refuses, and it is not the coach's doing, so
		// there would be no notice on the block and no reset to escape it with.
		const { baseItems, sent } = sentRequest();
		const request = sent[0].overrides;
		const rows = declaredRows(baseItems[0], request);
		expect(rows).toBe(1);
		expect(request.loads).toHaveLength(rows);
		expect(request.edge_sizes_mm).toHaveLength(rows);
		expect(request.hand_positions?.[0]).toHaveLength(rows);
	});

	it('goes back as the normalisation reads it, since the layout moved with it', () => {
		// A layout field the coach never set that no longer says what the week
		// stored is the normalisation having moved it, and the stored arrays were
		// written against the layout the week stored. So the whole normalised grid
		// goes out, which is the one thing that agrees with itself.
		const { sent } = sentRequest();
		const { opening } = openModal();
		expect(sent).toHaveLength(1);
		expect(sent[0].overrides).toEqual(opening[0].overrides);
	});

	it('prescribes what the week prescribed, rep for rep', () => {
		// Which is what makes sending the collapse sound here: it is the same hang
		// on every rep either way, so the coach's numbers survive being written in
		// the layout the item now reads back as.
		const { sent } = sentRequest();
		const before = mergeOverrides(gridTraining(), stored)[0];
		const after = mergeOverrides(gridTraining(), sent)[0];
		for (let set = 0; set < 2; set++) {
			for (let rep = 0; rep < 4; rep++) {
				expect(storedConfig(after, set, rep)).toEqual(storedConfig(before, set, rep));
			}
		}
	});
});

// The mirror of the case above: a week whose stored row declares a layout field
// the training has since adopted. The week wrote its own granularity back when
// the training was uniform, which the variation selector permits, and it is the
// layout the training itself now declares, so the diff omits the field as
// unchanged and the two rows read as disagreeing about a grid they both ask for.
// Its arrays are the ones the server refuses, so nothing but the substitution
// stands between the coach's numbers and a guess that saves.
describe('a grid override the training has caught up with', () => {
	const kg = (value: number) => ({ value, unit: 'kg' as const });
	const REFUSED_REASON = 'loads holds 6 entries but the granularity declares 8 rows';

	// Two sets of four reps loaded per set: eight rows, which the week was told
	// about only after it had written six.
	function gridTraining(): TrainingItem[] {
		const items: TrainingItem[] = [
			{
				id: 'grid',
				_id: 'grid',
				type: 'repeater',
				cycles: 2,
				reps: 4,
				hand: 'both',
				granularity: 'set',
				worktime_seconds: 7,
				rest_seconds: 3,
				loads: [kg(10), kg(10), kg(10), kg(10), kg(12), kg(12), kg(12), kg(12)],
				edge_sizes_mm: Array.from({ length: 8 }, () => 20),
				hand_positions: [Array.from({ length: 8 }, () => 'HC')]
			}
		];
		normalizeHangboardItems(items);
		applyItemReadDefaults(items, []);
		return items;
	}

	// Six loads for a 2x3 grid, under the granularity the week declared itself.
	// The server refuses it against the training as it now stands, so the block
	// carries a notice and a reset and the week cannot be saved until it goes.
	const stored: SessionOverride[] = [
		{
			item_id: 'grid',
			overrides: {
				granularity: 'set',
				loads: [kg(30), kg(31), kg(32), kg(40), kg(41), kg(42)]
			},
			override_stale: true,
			stale_reason: REFUSED_REASON
		}
	];

	// The write path's row count, restated here rather than imported so this
	// checks the request against the backend rule and not against the copy of it
	// the code under test reads.
	function declaredRows(base: TrainingItem, override: ItemOverride): number {
		const granularity = override.granularity ?? base.granularity ?? 'uniform';
		const reps = override.reps ?? base.reps ?? 1;
		const cycles = override.cycles ?? base.cycles ?? 1;
		if (granularity === 'set') return cycles * reps;
		if (granularity === 'rep') return reps;
		return 1;
	}

	function openModal() {
		const baseItems = gridTraining();
		const merged = mergeOverrides(baseItems, stored);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, []);
		prepareEditableTree(merged);
		return {
			baseItems,
			items: merged,
			opening: structuredClone(diffOverrides(baseItems, merged))
		};
	}

	function sentRequest() {
		const { baseItems, items, opening } = openModal();
		return {
			baseItems,
			sent: keepStoredGridArrays(baseItems, stored, opening, diffOverrides(baseItems, items))
		};
	}

	it('declares the same eight rows as the training, which its six loads do not fill', () => {
		const base = gridTraining()[0];
		expect(declaredRows(base, stored[0].overrides)).toBe(8);
		expect(stored[0].overrides.loads).toHaveLength(6);
	});

	it('opens on a grid the normalisation filled out to eight rows', () => {
		// Which is the guess: two rows the coach never typed, taken from a
		// fallback, in a request the server would take.
		const opening = openModal().opening;
		expect(opening[0].overrides.loads).toHaveLength(8);
	});

	it('goes back as the week stored it, since the request declares that layout', () => {
		// The granularity is not in the row because the training declares it now
		// and the diff emits only what differs, so the request and the stored row
		// declare the same eight rows either way. That is the comparison that
		// decides this, not the raw fields.
		const { baseItems, sent } = sentRequest();
		expect(sent).toHaveLength(1);
		expect(sent[0].overrides).toEqual({ loads: stored[0].overrides.loads });
		expect(declaredRows(baseItems[0], sent[0].overrides)).toBe(
			declaredRows(baseItems[0], stored[0].overrides)
		);
	});

	it('prescribes what the week prescribed, load for load', () => {
		const { sent } = sentRequest();
		const before = mergeOverrides(gridTraining(), stored)[0];
		const after = mergeOverrides(gridTraining(), sent)[0];
		expect(after.loads).toEqual(before.loads);
	});

	it('stays refused, marked and clearable after the apply', () => {
		const { baseItems, items, opening } = openModal();
		const current = diffOverrides(baseItems, items);
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		expect(carryStaleFlags(stored, sent)[0].override_stale).toBe(true);
		expect(carryStaleFlags(stored, sent)[0].stale_reason).toBe(REFUSED_REASON);
		expect(standingStaleOverrides(stored, opening, current, sent).map((o) => o.item_id)).toEqual([
			'grid'
		]);
	});
});

// A refusal the merge and the normalisation undo between the week read and the
// tree on screen. The week asks the item for a left hand column, the training
// now hangs both hands together, and the diff has nothing to emit: the block
// cannot be reset, since there is nothing on screen left to shrink, and applying
// is what drops the row the server refuses.
describe('a stale override the merge already undid', () => {
	const kg = (value: number) => ({ value, unit: 'kg' as const });
	const REFUSED_REASON = 'left_loads is set but the "both" mode hangs both hands together';

	const stored: SessionOverride[] = [
		{
			item_id: 'grid',
			overrides: { left_loads: [kg(14), kg(14), kg(16), kg(16)] },
			override_stale: true,
			stale_reason: REFUSED_REASON
		}
	];

	function openModal() {
		const baseItems: TrainingItem[] = [
			{
				id: 'grid',
				_id: 'grid',
				type: 'repeater',
				cycles: 2,
				reps: 2,
				hand: 'both',
				granularity: 'set',
				worktime_seconds: 7,
				rest_seconds: 3,
				loads: [kg(10), kg(10), kg(12), kg(12)],
				edge_sizes_mm: [20, 20, 18, 18],
				hand_positions: [['HC', 'HC', 'FC', 'FC']]
			}
		];
		normalizeHangboardItems(baseItems);
		applyItemReadDefaults(baseItems, []);
		const merged = mergeOverrides(baseItems, stored);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, []);
		prepareEditableTree(merged);
		// Cloned as the modal clones it: the diff hands back the arrays of the tree
		// it read, and the request the modal opened on has to hold still.
		return {
			baseItems,
			items: merged,
			opening: structuredClone(diffOverrides(baseItems, merged))
		};
	}

	it('leaves the modal with nothing to diff on the item', () => {
		expect(openModal().opening).toEqual([]);
	});

	it('is not a refusal the block can be asked to clear', () => {
		const { baseItems, items, opening } = openModal();
		const current = diffOverrides(baseItems, items);
		const sent = keepStoredGridArrays(baseItems, stored, opening, current);
		expect(standingStaleOverrides(stored, opening, current, sent)).toEqual([]);
	});

	it('is marked all the same, and named as one applying drops', () => {
		const dropped = staleOverridesDroppedByApply(stored, openModal().opening);
		expect(dropped.map((override) => override.item_id)).toEqual(['grid']);
		expect(staleOverrideDroppedNotice(dropped[0].stale_reason)).toContain(REFUSED_REASON);
		expect(staleOverrideDroppedNotice(dropped[0].stale_reason)).toContain(
			'nothing of it is left to change here'
		);
	});

	it('is dropped by the apply, so the week saves', () => {
		const { baseItems, items } = openModal();
		expect(carryStaleFlags(stored, diffOverrides(baseItems, items))).toEqual([]);
	});
});
