import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	OVERRIDE_ITEM_FIELDS,
	type ItemOverride,
	type OverrideKey,
	type SessionOverride,
	type TrainingItem,
	type TrainingItemType
} from '$lib/api/client';
import {
	diffOverrides,
	mergeOverrides,
	overrideFieldLabel,
	overrideSummary,
	resetItemToBase,
	standingStaleOverrides
} from './program-overrides';

// contract/override-keys.json is the backend's itemOverride key set, vendored
// here and in crimpy-app. A key the backend names and this portal does not read
// is dropped from the prescription the athlete plays rather than merely ignored,
// so every function that touches an override is held to the whole list.
type ContractKey = {
	key: OverrideKey;
	item_field: keyof TrainingItem;
	sample: unknown;
};

const contract = JSON.parse(
	readFileSync(new URL('../../contract/override-keys.json', import.meta.url), 'utf8')
) as { keys: ContractKey[] };

const sampleOverride = Object.fromEntries(
	contract.keys.map((entry) => [entry.key, entry.sample])
) as ItemOverride;

// A base whose every field differs from the sample the contract carries, so a
// merged field that still reads the base value means the key was dropped.
function baseItem(extra: Partial<TrainingItem> = {}): TrainingItem {
	return {
		id: 'a',
		_id: 'a',
		type: 'repeater',
		cycles: 1,
		cycle_rest_seconds: 30,
		interval_seconds: 60,
		reps: 2,
		reps_is_max: false,
		duration: 30,
		rest_seconds: 10,
		worktime_seconds: 5,
		hand: 'split',
		granularity: 'uniform',
		load_is_max: false,
		loads: [{ unit: 'kg', value: 1 }],
		left_loads: [{ unit: 'kg', value: 2 }],
		hand_positions: [['OC']],
		edge_sizes_mm: [10],
		variable_targets: {},
		...extra
	};
}

// What has to move on an item for the diff to emit each key. The types are not
// interchangeable: the backend refuses an interval anywhere but an emom, a
// repeat field on a single hang, and an open rep count off an exercise, so the
// diff keeps those keys off the types that would be refused. Typed as a record
// over the key union, so a key added to the contract has to be given a case
// here rather than quietly going unchecked.
const diffCases: Record<OverrideKey, { type: TrainingItemType; to: Partial<TrainingItem> }> = {
	cycles: { type: 'repeater', to: { cycles: 4 } },
	cycle_rest_seconds: { type: 'repeater', to: { cycle_rest_seconds: 120 } },
	interval_seconds: { type: 'emom', to: { interval_seconds: 90 } },
	reps: { type: 'repeater', to: { reps: 8 } },
	reps_is_max: { type: 'exercise', to: { reps_is_max: true } },
	duration: { type: 'exercise', to: { duration: 45 } },
	rest_seconds: { type: 'repeater', to: { rest_seconds: 60 } },
	hb_worktime_seconds: { type: 'repeater', to: { worktime_seconds: 7 } },
	hand: { type: 'repeater', to: { hand: 'alternate' } },
	granularity: { type: 'repeater', to: { granularity: 'rep' } },
	// The marker mirrors the load units and only ever goes out with them.
	load_is_max: {
		type: 'repeater',
		to: { load_is_max: true, loads: [{ unit: 'max', value: 0 }] }
	},
	loads: { type: 'repeater', to: { loads: [{ unit: 'kg', value: 25 }] } },
	left_loads: { type: 'repeater', to: { left_loads: [{ unit: 'kg', value: 20 }] } },
	hand_positions: { type: 'repeater', to: { hand_positions: [['HC', 'FC']] } },
	edge_sizes_mm: { type: 'repeater', to: { edge_sizes_mm: [20, 18] } },
	variable_targets: {
		type: 'exercise',
		to: { variable_targets: { reps: { assessment_id: 'a1', percent: 75, fallback: 8 } } }
	}
};

// The marker carries no words of its own: it mirrors the load units, and the
// load the summary already names is what says the week asks for a max effort.
const silentSummaryKeys: OverrideKey[] = ['load_is_max'];

describe('the override key contract', () => {
	it('names the same keys as the backend', () => {
		expect(Object.keys(OVERRIDE_ITEM_FIELDS).sort()).toEqual(
			contract.keys.map((entry) => entry.key).sort()
		);
	});

	it('maps every key to a field the item carries', () => {
		for (const entry of contract.keys) {
			expect(OVERRIDE_ITEM_FIELDS[entry.key]).toBe(entry.item_field);
		}
	});

	it('merges every key onto the item', () => {
		for (const entry of contract.keys) {
			// Without this the assertion below can pass on a key nothing merges,
			// where the base happens to already hold the sample.
			expect(
				baseItem()[entry.item_field],
				`${entry.key}: the base has to differ from the contract sample or the merge proves nothing`
			).not.toEqual(entry.sample);
			const merged = mergeOverrides(
				[baseItem()],
				[{ item_id: 'a', overrides: { [entry.key]: entry.sample } }]
			);
			expect(merged[0][entry.item_field], `${entry.key} never reaches the item`).toEqual(
				entry.sample
			);
		}
	});

	it('emits every key from the diff', () => {
		for (const entry of contract.keys) {
			const testCase = diffCases[entry.key];
			const base = baseItem({ type: testCase.type });
			const edited = baseItem({ type: testCase.type, ...testCase.to });
			const [diffed] = diffOverrides([base], [edited]);
			expect(diffed?.overrides, `${entry.key} is not sent when a coach changes it`).toHaveProperty(
				entry.key
			);
		}
	});

	it('summarises every key a coach can see', () => {
		for (const entry of contract.keys) {
			if (silentSummaryKeys.includes(entry.key)) continue;
			const summary = overrideSummary(baseItem(), { [entry.key]: entry.sample }, {});
			expect(summary.trim(), `${entry.key} shows as nothing on the week`).not.toBe('');
		}
	});

	it('names every key a refusal can be attributed to', () => {
		// The week read attributes a refusal to the override key it is about, so a
		// key the backend adds and this portal has no words for would leave a coach
		// marked against a field the block cannot name.
		for (const entry of contract.keys) {
			expect(
				overrideFieldLabel(entry.key).trim(),
				`${entry.key} has no words a marked block can use`
			).not.toBe('');
		}
	});

	it('keeps a refusal on any key standing through an edit to another field', () => {
		// Krakoer/crimpy#100 over the whole key set: the server refuses one field of
		// a row it stores whole, so the marking is read per field and an edit
		// elsewhere on the block leaves it alone.
		for (const entry of contract.keys) {
			const other: OverrideKey = entry.key === 'rest_seconds' ? 'duration' : 'rest_seconds';
			const stored: SessionOverride[] = [
				{
					item_id: 'a',
					overrides: { [entry.key]: entry.sample },
					override_stale: true,
					stale_fields: [{ field: entry.key, reason: 'the training no longer takes it' }]
				}
			];
			const sent: SessionOverride[] = [
				{ item_id: 'a', overrides: { [entry.key]: entry.sample, [other]: 7 } }
			];
			expect(
				standingStaleOverrides([baseItem()], stored, sent).map((override) => override.item_id),
				`a refusal about ${entry.key} is dropped when another field of the row moves`
			).toEqual(['a']);
		}
	});

	it('puts every key back when the item is reset', () => {
		const base = baseItem();
		const edited = mergeOverrides([baseItem()], [{ item_id: 'a', overrides: sampleOverride }]);
		resetItemToBase([base], edited, 'a');
		// The reset gives the item a fresh key, which is what makes the editors
		// read the restored values rather than write their own back.
		expect({ ...edited[0], _id: base._id }).toEqual(base);
	});
});
