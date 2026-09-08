import { describe, expect, it } from 'vitest';
import type { ItemOverride, SessionOverride, TrainingItem } from '$lib/api/client';
import {
	buildOverrideHistory,
	carryStaleFlags,
	diffOverrides,
	mergeOverrides,
	overrideSummary,
	resetItemToBase,
	staleOverrideNotice,
	staleOverrides,
	standingStaleOverrides
} from './program-overrides';
import { normalizeHangboardItems } from '$lib/components/training/hangboard-config';
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
		const current = [{ item_id: 'a', overrides: { reps_is_max: true } }];
		expect(standingStaleOverrides([refused], opening, current)).toEqual([refused]);
	});

	it('drops the refusal once the block is cleared or rewritten', () => {
		expect(standingStaleOverrides([refused], opening, [])).toEqual([]);
		expect(
			standingStaleOverrides([refused], opening, [{ item_id: 'a', overrides: { reps: 4 } }])
		).toEqual([]);
	});

	it('carries the refusal onto a week applied without clearing it', () => {
		const applied = carryStaleFlags([refused], opening, [
			{ item_id: 'a', overrides: { reps_is_max: true } },
			{ item_id: 'b', overrides: { reps: 5 } }
		]);
		expect(applied[0].override_stale).toBe(true);
		expect(applied[0].stale_reason).toBe(refused.stale_reason);
		expect(applied[1].override_stale).toBeUndefined();
	});

	it('lets a rewritten override go back to the server unflagged', () => {
		// Only the write path judges a value the read never saw, so the save is
		// what tells the coach whether the rewrite holds.
		const applied = carryStaleFlags([refused], opening, [{ item_id: 'a', overrides: { reps: 4 } }]);
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

	// Three sets of the given reps, one load and one edge per rep.
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
				loads: Array.from({ length: rows }, () => kg(20)),
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
		return { baseItems, items: merged, opening: diffOverrides(baseItems, merged) };
	}

	it('cannot be recognised by comparing the request against the stored row', () => {
		const { opening } = openModal();
		expect(opening[0].overrides.loads).not.toEqual(stored[0].overrides.loads);
	});

	it('is marked, so the block can offer clearing', () => {
		const { baseItems, items, opening } = openModal();
		const standing = standingStaleOverrides(stored, opening, diffOverrides(baseItems, items));
		expect(standing.map((override) => override.item_id)).toEqual(['grid']);
		expect(standing[0].stale_reason).toBe(REFUSED_REASON);
	});

	it('keeps its marking through an open and an apply with no edit', () => {
		const { baseItems, items, opening } = openModal();
		const applied = carryStaleFlags(stored, opening, diffOverrides(baseItems, items));
		const flagged = applied.find((override) => override.item_id === 'grid');
		expect(flagged?.override_stale).toBe(true);
		expect(flagged?.stale_reason).toBe(REFUSED_REASON);
	});

	it('loses its marking once the coach clears the block', () => {
		const { baseItems, items, opening } = openModal();
		resetItemToBase(baseItems, items, 'grid');
		const current = diffOverrides(baseItems, items);
		expect(standingStaleOverrides(stored, opening, current)).toEqual([]);
		expect(carryStaleFlags(stored, opening, current)).toEqual(current);
	});
});
