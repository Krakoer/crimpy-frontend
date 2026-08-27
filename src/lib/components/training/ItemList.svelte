<script lang="ts">
	import type { Exercise, TrainingItem, TrainingItemType } from '$lib/api/client';
	import ExerciseItem from './ExerciseItem.svelte';
	import HangboardItem from './HangboardItem.svelte';
	import HangboardRepItem from './HangboardRepItem.svelte';
	import CircuitItem from './CircuitItem.svelte';
	import EmomItem from './EmomItem.svelte';
	import GroupItem from './GroupItem.svelte';
	import SortableWrapper from './SortableWrapper.svelte';
	import AddZone from './AddZone.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { BLOCK_PRESENTATION } from '$lib/block-presentation';
	import { createTrainingItem } from './create-item';
	import { containerChildTypes, type ContainerType } from './container-rules';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import { setContext, untrack } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import type { AssessmentCatalog } from '$lib/assessments';

	interface Props {
		items: TrainingItem[];
		exercises: Exercise[];
		catalog: AssessmentCatalog;
		allowedTypes?: TrainingItemType[];
		// What every container nested below may hold, when the training restricts
		// it. Circuits and groups both honour it, and both pass it further down, so
		// a training type that forbids a block forbids it at every depth.
		innerAllowedTypes?: TrainingItemType[];
		depth?: number;
		containerId?: string;
	}

	let {
		items = $bindable(),
		exercises,
		catalog,
		allowedTypes = ['exercise', 'circuit', 'emom', 'group', 'repeater', 'hangboard_rep'],
		innerAllowedTypes,
		depth = 0,
		containerId = 'root'
	}: Props = $props();

	let collapseSignals = $state({ collapse: 0, expand: 0 });

	untrack(() => {
		if (depth === 0) setContext(COLLAPSE_KEY, collapseSignals);
	});

	const GROUPING_TARGETS: ContainerType[] = ['circuit', 'emom', 'group'];

	let selecting = $state(false);
	let selectedIds = $state<string[]>([]);

	// Read back from the list rather than trusted as kept, so a block deleted or
	// dragged away while the bar is open leaves the selection by itself.
	let selectedItems = $derived(items.filter((item) => selectedIds.includes(item._id!)));

	function toggleSelected(id: string) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((selected) => selected !== id)
			: [...selectedIds, id];
	}

	function stopSelecting() {
		selecting = false;
		selectedIds = [];
	}

	// The Select link only shows above one block, so the bar has to leave with it
	// rather than sit there refusing every grouping.
	$effect(() => {
		if (selecting && items.length < 2) stopSelecting();
	});

	function blockLabel(type: TrainingItemType): string {
		return BLOCK_PRESENTATION[type].label.toLowerCase();
	}

	// Null when the selection can be wrapped, otherwise why it cannot, which the
	// bar reports through the snackbar. The buttons stay live so the reason is
	// reachable without a hover, which a touch screen does not have.
	function groupingIssue(containerType: ContainerType): string | null {
		if (selectedItems.length < 2) return 'Select at least two blocks to group them.';
		if (!allowedTypes.includes(containerType))
			return `This training takes no ${blockLabel(containerType)}.`;
		const childTypes = containerChildTypes(containerType, depth, innerAllowedTypes);
		const rejected = selectedItems.find((item) => !childTypes.includes(item.type));
		if (!rejected) return null;
		return `A ${blockLabel(containerType)} cannot hold a ${blockLabel(rejected.type)}.`;
	}

	function groupSelection(containerType: ContainerType) {
		const issue = groupingIssue(containerType);
		if (issue) {
			snackbar.show(issue, 'error');
			return;
		}
		const positions = items
			.map((item, index) => index)
			.filter((index) => selectedIds.includes(items[index]._id!));
		const grouped = positions.map((index) => items[index]);
		for (let i = positions.length - 1; i >= 0; i--) items.splice(positions[i], 1);
		const container = createTrainingItem(containerType);
		container.items = grouped;
		items.splice(positions[0], 0, container);
		stopSelecting();
	}

	function addItem(type: TrainingItemType, exerciseId?: string) {
		items.push(createTrainingItem(type, exerciseId));
	}

	function removeItem(index: number) {
		items.splice(index, 1);
	}

	function duplicateItem(index: number) {
		const clone = structuredClone($state.snapshot(items[index]));
		function freshenIds(node: TrainingItem) {
			delete node.id;
			node._id = crypto.randomUUID();
			if (node.items) node.items.forEach(freshenIds);
		}
		freshenIds(clone);
		items.splice(index + 1, 0, clone);
	}
</script>

<div class="flex flex-col gap-2">
	{#if depth === 0}
		<div style="display: flex; gap: 8px; margin-bottom: 4px; padding: 0 4px; align-items: center;">
			<span
				onclick={() => {
					collapseSignals.expand++;
				}}
				style="font-size: 12px; color: var(--pr); font-weight: 600; cursor: pointer;"
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && collapseSignals.expand++}>Expand all</span
			>
			<span style="color: var(--tx3);">·</span>
			<span
				onclick={() => {
					collapseSignals.collapse++;
				}}
				style="font-size: 12px; color: var(--tx3); font-weight: 600; cursor: pointer;"
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && collapseSignals.collapse++}>Collapse all</span
			>
			{#if !selecting && items.length > 1}
				<span style="color: var(--tx3);">·</span>
				<button
					onclick={() => (selecting = true)}
					style="font-size: 12px; color: var(--tx3); font-weight: 600; cursor: pointer; border: none; background: transparent; padding: 0; font-family: var(--font);"
					>Select</button
				>
			{/if}
			<div style="flex: 1;"></div>
			<span style="font-size: 12px; color: var(--tx3);">{items.length} blocks</span>
		</div>

		{#if selecting}
			<div
				data-testid="selection-bar"
				style="
					display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
					padding: 8px 12px; margin-bottom: 4px; border-radius: var(--rs);
					border: 1px solid var(--pr-lt); background: var(--pr-fog);
				"
			>
				<span style="font-size: 12px; font-weight: 600; color: var(--tx2);"
					>{selectedItems.length} selected</span
				>
				<div style="flex: 1;"></div>
				{#each GROUPING_TARGETS as target (target)}
					{@const issue = groupingIssue(target)}
					{@const block = BLOCK_PRESENTATION[target]}
					<button
						onclick={() => groupSelection(target)}
						title={issue ?? undefined}
						style="
							display: flex; align-items: center; gap: 5px;
							padding: 5px 11px; border-radius: var(--rs);
							border: 1px solid var(--bd); background: #fff;
							font-family: var(--font); font-size: 12px; font-weight: 600;
							color: {block.color}; cursor: pointer;
							opacity: {issue ? 0.55 : 1};
						"
					>
						<Icon name={block.icon} size={12} color={block.color} />
						Group into {blockLabel(target)}
					</button>
				{/each}
				<button
					onclick={stopSelecting}
					style="font-size: 12px; color: var(--tx3); font-weight: 600; cursor: pointer; border: none; background: transparent; padding: 5px 4px; font-family: var(--font);"
					>Cancel</button
				>
			</div>
		{/if}
	{/if}

	{#snippet blockRow(item: TrainingItem, i: number)}
		<SortableWrapper id={item._id!} group={containerId} index={i}>
			{#if item.type === 'exercise'}
				<ExerciseItem
					bind:item={items[i]}
					{catalog}
					{exercises}
					onRemove={() => removeItem(i)}
					onDuplicate={() => duplicateItem(i)}
				/>
			{:else if item.type === 'repeater'}
				<HangboardItem
					bind:item={items[i]}
					{catalog}
					onRemove={() => removeItem(i)}
					onDuplicate={() => duplicateItem(i)}
				/>
			{:else if item.type === 'hangboard_rep'}
				<HangboardRepItem
					bind:item={items[i]}
					{catalog}
					onRemove={() => removeItem(i)}
					onDuplicate={() => duplicateItem(i)}
				/>
			{:else if item.type === 'circuit'}
				<CircuitItem
					bind:item={items[i]}
					{exercises}
					{catalog}
					onRemove={() => removeItem(i)}
					onDuplicate={() => duplicateItem(i)}
					{depth}
					{innerAllowedTypes}
				/>
			{:else if item.type === 'emom'}
				<EmomItem
					bind:item={items[i]}
					{exercises}
					{catalog}
					onRemove={() => removeItem(i)}
					onDuplicate={() => duplicateItem(i)}
					{depth}
					{innerAllowedTypes}
				/>
			{:else if item.type === 'group'}
				<GroupItem
					bind:item={items[i]}
					{exercises}
					{catalog}
					onRemove={() => removeItem(i)}
					onDuplicate={() => duplicateItem(i)}
					{depth}
					{innerAllowedTypes}
				/>
			{/if}
		</SortableWrapper>
	{/snippet}

	{#each items as item, i (item._id)}
		{#if depth === 0}
			<!-- The checkbox column only exists at the root, and its row stays put
			while selection is off, so toggling it rebuilds no block. Deeper lists
			render the block alone, leaving their drag and drop tree untouched. -->
			<div style="display: flex; align-items: flex-start; gap: 8px;">
				{#if selecting}
					<input
						type="checkbox"
						aria-label="Select block {i + 1}, {BLOCK_PRESENTATION[item.type].label}"
						checked={selectedIds.includes(item._id!)}
						onchange={() => toggleSelected(item._id!)}
						style="margin-top: 13px; cursor: pointer; accent-color: var(--pr); flex-shrink: 0;"
					/>
				{/if}
				<div style="flex: 1; min-width: 0;">
					{@render blockRow(item, i)}
				</div>
			</div>
		{:else}
			{@render blockRow(item, i)}
		{/if}
	{/each}

	<AddZone {containerId} {allowedTypes} onAdd={addItem} />
</div>
