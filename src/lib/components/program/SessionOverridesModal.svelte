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
		diffOverrides,
		findItem,
		itemIsOverridden,
		keepStoredGridArrays,
		mergeOverrides,
		resetItemToBase,
		standingStaleOverrides,
		staleOverrideDroppedNotice,
		staleOverrideNotice,
		staleOverridesDroppedByApply,
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
	// What the week asked for the moment the tree was built, which is the only
	// baseline a refusal can be measured against: the merge and the normalisation
	// rewrite a grid item's arrays into the layout the training now declares, so
	// the stored row cannot be re-emitted and comparing against it would leave
	// every grid override unmarked.
	let openingRequest = $state<SessionOverride[]>([]);

	$effect(() => {
		if (!training || editedTraining === training.id) return;
		const merged = mergeOverrides(baseItems, $state.snapshot(overrides) as SessionOverride[]);
		normalizeHangboardItems(merged);
		applyItemReadDefaults(merged, loadAssessments);
		prepareEditableTree(merged);
		// Cloned, because the diff hands back the very arrays of the tree it read:
		// a grid it merely pointed at would follow the coach's edits and then say
		// they had touched nothing.
		openingRequest = structuredClone(diffOverrides(baseItems, merged));
		items = merged;
		editedTraining = training.id;
	});

	// What this week would ask for if the coach applied now.
	let edited = $derived(diffOverrides(baseItems, items));

	// The overrides the server refused, still asking what they asked when it did.
	// Read against the tree on screen rather than against the saved week, so a
	// block the coach has just cleared stops being marked before they apply.
	let standing = $derived(standingStaleOverrides(overrides, openingRequest, edited));

	// The refused rows the merge and the normalisation already undid. Nothing on
	// screen asks for them, so the block is marked without being offered a reset,
	// and applying the week is what drops them.
	let droppedByApply = $derived(staleOverridesDroppedByApply(overrides, openingRequest));

	let markedBlocks = $derived(standing.length + droppedByApply.length);

	// What applying actually sends. The tree on screen is normalised into the
	// layout the training now declares, which rewrites an array a week wrote
	// against another row count, so a grid the coach has not touched goes back as
	// the week stored it rather than as the normalisation guessed it.
	let request = $derived(keepStoredGridArrays(overrides, openingRequest, edited));

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
		isOverridden: (itemId: string) => itemIsOverridden(baseItems, items, itemId),
		staleNotice: (itemId: string) => {
			const stale = standing.find((override) => override.item_id === itemId);
			if (stale) {
				return { text: staleOverrideNotice(stale.stale_reason), clearedByApply: false };
			}
			const dropped = droppedByApply.find((override) => override.item_id === itemId);
			if (dropped) {
				return { text: staleOverrideDroppedNotice(dropped.stale_reason), clearedByApply: true };
			}
			return null;
		},
		resetItem: (itemId: string) => resetItemToBase(baseItems, items, itemId),
		baseItem: (itemId: string) => findItem(baseItems, itemId)
	};
	setContext(OVERRIDE_KEY, mode);

	// Handed to the strips through the context rather than down the list, behind a
	// getter so the training arriving after the modal opened fills them in where
	// they already are. The week being edited reads from the tree on screen rather
	// than from what is saved, so a number just typed shows up in its own chip
	// beside the weeks it is being adapted from.
	let history = $derived<OverrideHistoryByItem>(
		training
			? buildOverrideHistory(
					baseItems,
					scheduledWeeks.map((week) => (week.current ? { ...week, overrides: edited } : week)),
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

	// A refusal the server answered is carried onto an override that goes back
	// asking exactly what the server refused, so a week merely opened and applied
	// does not read as fixed while the save is still going to be refused. What
	// the marking above is measured against is the week the modal opened on; what
	// this is measured against is the row the server judged, since that is what
	// decides the next save.
	function apply() {
		onApply(carryStaleFlags(overrides, request));
	}

	// Fresh keys, for the same reason resetItemToBase mints one: an editor that
	// mirrors a field into its own boxes reads the item when it is created, and a
	// reused one would write the cleared value straight back.
	function clearAll() {
		const cleared = mergeOverrides(baseItems, []);
		normalizeHangboardItems(cleared);
		applyItemReadDefaults(cleared, loadAssessments);
		prepareEditableTree(cleared);
		items = cleared;
	}

	let customisedCount = $derived(edited.length);

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
