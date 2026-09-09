<script lang="ts">
	import { setContext } from 'svelte';
	import type { SessionOverride, Training, TrainingItem } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import ItemList from '$lib/components/training/ItemList.svelte';
	import {
		OVERRIDE_HISTORY_KEY,
		OVERRIDE_KEY,
		type OverrideHistoryByItem,
		type OverrideMode
	} from '$lib/components/training/override-context';
	import { normalizeHangboardItems } from '$lib/components/training/hangboard-config';
	import { prepareEditableTree } from '$lib/components/training/create-item';
	import { applyItemReadDefaults } from '$lib/components/training/item-defaults';
	import {
		buildOverrideHistory,
		carryStaleFlags,
		declaredGridLayouts,
		emptyGridLayouts,
		emptyOpenedWeek,
		findItem,
		mergeBaseTree,
		mergeOverrides,
		openWeek,
		resetItemToBase,
		staleRefusalLines,
		STALE_OVERRIDE_DROPPED_LEAD,
		STALE_OVERRIDE_LEAD,
		trainingTrees,
		weekOverrides,
		withOpenedLayouts,
		type GridLayouts,
		type OpenedWeek,
		type ScheduledRow
	} from '$lib/program-overrides';
	import { assessmentsForField, type AssessmentCatalog } from '$lib/assessments';
	import { trainingTypeInfo } from '$lib/trainingTypes';

	interface Props {
		training: Training | null;
		// What the coach is looking at, so the header says which of the several
		// weeks scheduling this training they are about to change.
		weekNumber: number;
		placement: string;
		overrides: SessionOverride[];
		// Every row of the program that schedules the same training, so the strip
		// under each item can say what the others already ask of it.
		scheduledWeeks: ScheduledRow[];
		catalog: AssessmentCatalog;
		readOnly: boolean;
		readOnlyReason: string;
		// Whether the athlete has already played this session, which is what
		// decides if clearing is one Edit away or refused outright.
		locked: boolean;
		loading: boolean;
		loadError: string;
		onClose: () => void;
		onApply: (overrides: SessionOverride[]) => void;
	}

	let {
		training,
		weekNumber,
		placement,
		overrides,
		scheduledWeeks,
		catalog,
		readOnly,
		readOnlyReason,
		locked,
		loading,
		loadError,
		onClose,
		onApply
	}: Props = $props();

	// The training as it is written, normalised the way the editor expects to read
	// it, so a field the normalisation fills in is not mistaken for a change this
	// week asked for.
	let loadAssessments = $derived(assessmentsForField('load', catalog));

	// Snapshotted rather than read through: the training and the week's overrides
	// both arrive as state the page owns, and the editor below writes into the
	// tree it is given, so anything short of a copy would edit the program under
	// a coach who has not pressed Apply yet.
	let baseItems = $derived.by(() => {
		if (!training) return [];
		const items = $state.snapshot(training.items) as TrainingItem[];
		normalizeHangboardItems(items);
		applyItemReadDefaults(items, loadAssessments);
		return items;
	});

	let items = $state<TrainingItem[]>([]);
	let editedTraining = $state<string | null>(null);
	// The layout the training and the week declare each grid item in, read while
	// both are still to hand: the normalisation below replaces it with the layout
	// the item's values call for, and nothing in the tree then says what it was.
	let layouts = $state<GridLayouts>(emptyGridLayouts());
	// The week as it was the moment the tree was built, which is what everything
	// below asking whether the coach has moved something is measured against.
	let opened = $state<OpenedWeek>(emptyOpenedWeek());

	$effect(() => {
		if (!training || editedTraining === training.id) return;
		const declared = $state.snapshot(training.items) as TrainingItem[];
		const storedWeek = $state.snapshot(overrides) as SessionOverride[];
		// The week's row lands on the training written out in the layout that row
		// is written in, not on the layout the training's own values happened to
		// collapse to: eight varying loads written against eight rows say nothing a
		// tree holding one row can hold, and the seven the merge dropped never
		// reached the diff the request is built from either.
		const declaredLayouts = declaredGridLayouts(declared, storedWeek);
		const merged = mergeOverrides(mergeBaseTree(baseItems, declaredLayouts), storedWeek);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, loadAssessments);
		prepareEditableTree(merged);
		const openedLayouts = withOpenedLayouts(declaredLayouts, merged);
		// Cloned, because the diffs hand back the very arrays of the tree they
		// read: a grid they merely pointed at would follow the coach's edits and
		// then say they had touched nothing.
		opened = structuredClone(
			openWeek(trainingTrees(baseItems, openedLayouts), merged, openedLayouts)
		);
		layouts = openedLayouts;
		items = merged;
		editedTraining = training.id;
	});

	// The training as the editor reads it and as the write path lays it out, which
	// is the pair every question below is asked against. The tree the week's own
	// row was merged onto is not one of them: it is read once above and nothing
	// here lands a row, so carrying it along would rebuild it on every keystroke
	// for nobody. The modal held only the first of the pair until
	// Krakoer/crimpy#100 round one, so a refusal about a row diffed against the
	// second had nothing but the first to be weighed against, and the modal had no
	// way to build the second for itself.
	let trees = $derived(trainingTrees(baseItems, layouts));

	// What the coach has touched, what the server is being asked for, what
	// applying sends and which refusals still stand. Which of those diffs answers
	// which question, and which tree each is taken against, is decided in
	// program-overrides rather than here, so the specs exercise the chain the
	// modal runs on.
	let week = $derived(weekOverrides(trees, items, overrides, layouts, opened));

	// What applying actually sends. An array a week wrote against a row count no
	// layout of the training explains cannot be re-expressed at all, so a grid the
	// coach has not touched goes back as the week stored it.
	//
	// It is also what every claim below that this week customises a block is read
	// off. Customised for this week is a statement about the week rather than
	// about how the editor happens to render it, and the diff on screen can carry
	// a block the request says nothing of: a coach who picks the layout a grid
	// already reads as prescribes nothing new, so counting that block would claim
	// a customisation the apply then drops.
	let sent = $derived(week.sent);

	// The overrides the server refused, still asking what they asked when it did.
	let standing = $derived(week.standing);

	// The refused rows the merge and the normalisation already undid. Nothing on
	// screen asks for them, so the block is marked without being offered a reset,
	// and applying the week is what drops them.
	let droppedByApply = $derived(week.droppedByApply);

	let markedBlocks = $derived(standing.length + droppedByApply.length);

	const mode: OverrideMode = {
		get readOnly() {
			return readOnly;
		},
		get readOnlyReason() {
			return readOnlyReason;
		},
		get locked() {
			return locked;
		},
		isOverridden: (itemId: string) => sent.some((override) => override.item_id === itemId),
		// The lines name the fields the server attributed the refusal to, read
		// against the training item so a set is a set and a round is a round.
		staleNotice: (itemId: string) => {
			const stale = standing.find((override) => override.item_id === itemId);
			if (stale) {
				return {
					lead: STALE_OVERRIDE_LEAD,
					refusals: staleRefusalLines(stale, findItem(baseItems, itemId)),
					clearedByApply: false
				};
			}
			const dropped = droppedByApply.find((override) => override.item_id === itemId);
			if (dropped) {
				return {
					lead: STALE_OVERRIDE_DROPPED_LEAD,
					refusals: staleRefusalLines(dropped, findItem(baseItems, itemId)),
					clearedByApply: true
				};
			}
			return null;
		},
		resetItem: (itemId: string) => resetItemToBase(baseItems, items, itemId),
		baseItem: (itemId: string) => findItem(baseItems, itemId)
	};
	setContext(OVERRIDE_KEY, mode);

	// Handed to the strips through the context rather than down the list, behind a
	// getter so the training arriving after the modal opened fills them in where
	// they already are. The week being edited reads from the row it is about to
	// hold rather than from what is saved, so a number just typed shows up in its
	// own chip beside the weeks it is being adapted from, and the chip says the
	// same thing about this week as the other chips say about theirs rather than
	// claiming a customisation the apply would drop.
	let history = $derived<OverrideHistoryByItem>(
		training
			? buildOverrideHistory(
					baseItems,
					scheduledWeeks.map((row) => (row.current ? { ...row, overrides: sent } : row)),
					catalog
				)
			: {}
	);
	setContext(OVERRIDE_HISTORY_KEY, {
		get byItem() {
			return history;
		}
	});

	let type = $derived(trainingTypeInfo(training?.training_type));

	// A refusal the server answered is carried onto a row that still asks for the
	// field the server refused, so a week merely opened and applied does not read
	// as fixed while the save is still going to be refused. It is measured against
	// the row on its way out, which is what the marking above is measured against
	// too, so the block on screen and the week carried out of here cannot disagree
	// about which refusals still stand.
	function apply() {
		onApply(carryStaleFlags(trees, overrides, sent));
	}

	// Fresh keys, for the same reason resetItemToBase mints one: an editor that
	// mirrors a field into its own boxes reads the item when it is created, and a
	// reused one would write the cleared value straight back.
	//
	// The tree merged onto is the editor's own rather than mergeBaseTree: no row
	// lands here, so there is no layout to land one in, and what the coach is left
	// reading is the training exactly as the editor reads it.
	function clearAll() {
		const cleared = mergeOverrides(baseItems, []);
		normalizeHangboardItems(cleared);
		applyItemReadDefaults(cleared, loadAssessments);
		prepareEditableTree(cleared);
		items = cleared;
	}

	let customisedCount = $derived(sent.length);

	// A week whose only leftover is a refused row the merge undid asks nothing on
	// screen, so counting it as written would read as a contradiction of the
	// banner above. It is said as what applying does instead.
	let footerSummary = $derived(
		customisedCount > 0
			? `${customisedCount} ${customisedCount === 1 ? 'block' : 'blocks'} customised for this week`
			: droppedByApply.length > 0
				? 'Applying drops what this week asks that the training no longer takes'
				: 'This week runs the training as it is written'
	);

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	style="position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
	aria-label="Week {weekNumber} training parameters"
>
	<div
		class="flex flex-col"
		style="
			width: 100%; max-width: 860px; max-height: 88vh;
			background: var(--panel); border-radius: var(--rl);
			border: 1px solid var(--bd); box-shadow: var(--sh-hi); overflow: hidden;
		"
	>
		<div
			class="flex shrink-0 items-center gap-3"
			style="padding: 18px 20px; background: {type.tint}; border-bottom: 1px solid var(--bd);"
		>
			<div
				class="flex items-center justify-center"
				style="width: 40px; height: 40px; border-radius: var(--rs); background: var(--panel); flex-shrink: 0;"
			>
				<Icon name="settings" size={20} color={type.color} />
			</div>
			<div style="min-width: 0; flex: 1;">
				<div
					style="font-size: 11px; font-weight: 700; color: {type.color}; letter-spacing: 0.06em; text-transform: uppercase;"
				>
					Week {weekNumber} - {placement}
				</div>
				<h2
					class="truncate"
					style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 1px;"
				>
					{training?.title ?? 'Training'}
				</h2>
			</div>
			<button
				onclick={onClose}
				class="flex items-center justify-center"
				style="width: 30px; height: 30px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); cursor: pointer; color: var(--tx2); flex-shrink: 0;"
				aria-label="Close"
			>
				<Icon name="x" size={15} color="var(--tx2)" />
			</button>
		</div>

		<div
			data-testid="session-overrides-body"
			class="overrides-body space-y-3 overflow-y-auto"
			style="padding: 16px 20px; background: var(--bg); flex: 1;"
		>
			<p style="font-size: 12px; color: var(--tx2); margin: 0;">
				{readOnly
					? readOnlyReason
					: 'The exercises and the blocks belong to the training. What this week asks of them is yours to change here, and only this week changes.'}
			</p>

			{#if markedBlocks > 0}
				<div
					data-testid="stale-overrides-banner"
					class="flex items-start gap-2"
					style="border: 1px solid var(--gd); background: var(--gd-lt); border-radius: var(--rs); padding: 9px 11px;"
				>
					<div style="padding-top: 1px;"><Icon name="alert" size={14} color="var(--gd)" /></div>
					<span style="font-size: 12px; color: var(--tx2);">
						{markedBlocks === 1
							? 'One block below asks for something the training no longer takes.'
							: `${markedBlocks} blocks below ask for something the training no longer takes.`} The athlete
						is handed the training as it is written there, and this week cannot be saved until that is
						cleared. Each marked block below says how.
					</span>
				</div>
			{/if}

			{#if loadError}
				<div
					style="border: 1px solid var(--rd); background: var(--panel); border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
				>
					{loadError}
				</div>
			{:else if loading || !training}
				<div style="padding: 28px 0; text-align: center; font-size: 13px; color: var(--tx3);">
					Loading the training...
				</div>
			{:else if items.length === 0}
				<div style="padding: 28px 0; text-align: center; font-size: 13px; color: var(--tx3);">
					This training holds no block to configure.
				</div>
			{:else}
				<!-- A disabled fieldset freezes every input below it in one place, so a
				     played session is read-only without each editor knowing about it. -->
				<fieldset disabled={readOnly} style="display: contents;">
					<ItemList bind:items exercises={[]} {catalog} />
				</fieldset>
			{/if}
		</div>

		<div
			class="flex shrink-0 items-center gap-2"
			style="padding: 12px 20px; border-top: 1px solid var(--bd); background: var(--panel);"
		>
			<span style="font-size: 12px; color: var(--tx3);">{footerSummary}</span>
			<div style="flex: 1;"></div>
			{#if !readOnly && customisedCount > 0}
				<button
					onclick={clearAll}
					style="padding: 7px 12px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); font-family: var(--font); font-size: 12.5px; font-weight: 600; color: var(--tx2); cursor: pointer;"
					>Clear customisation</button
				>
			{/if}
			<button
				onclick={onClose}
				style="padding: 7px 12px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); font-family: var(--font); font-size: 12.5px; font-weight: 600; color: var(--tx2); cursor: pointer;"
				>{readOnly ? 'Close' : 'Cancel'}</button
			>
			{#if !readOnly}
				<button
					onclick={apply}
					disabled={!training}
					style="padding: 7px 14px; border-radius: var(--rs); border: 1px solid var(--pr); background: var(--pr); font-family: var(--font); font-size: 12.5px; font-weight: 700; color: #fff; cursor: pointer;"
					>Apply</button
				>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Every control the week may not move is disabled, whether by the read only
	   fieldset or by the editor itself, and has to read that way: the editors
	   paint their own backgrounds, so a disabled input would otherwise look live
	   to a coach who cannot change it. */
	.overrides-body :global(input:disabled),
	.overrides-body :global(select:disabled),
	.overrides-body :global(textarea:disabled),
	.overrides-body :global(button:disabled) {
		opacity: 0.55;
		cursor: default;
	}
</style>
