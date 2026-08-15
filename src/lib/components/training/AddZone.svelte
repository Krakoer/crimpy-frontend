<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import type { Exercise, TrainingItemType } from '$lib/api/client';
	import SelectExerciseModal from './SelectExerciseModal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { HANGBOARD_COLOR } from './hangboard-config';

	interface Props {
		containerId: string;
		allowedTypes: TrainingItemType[];
		onAdd: (type: TrainingItemType, exerciseId?: string) => void;
	}

	let { containerId, allowedTypes, onAdd }: Props = $props();

	const droppable = createDroppable({
		get id() {
			return containerId;
		}
	});

	let expanded = $state(false);
	let showExerciseModal = $state(false);

	// Keyed by the item type the button creates: a key that does not match one
	// leaves the button with no name and no icon.
	const typeLabels: Record<string, string> = {
		circuit: 'Circuit',
		group: 'Group',
		repeater: 'Hangboard',
		hangboard_rep: 'Hang rep',
		exercise: 'Exercise'
	};
	const typeIcons: Record<string, string> = {
		circuit: 'link',
		group: 'layers',
		repeater: 'grip',
		hangboard_rep: 'clock',
		exercise: 'dumbbell'
	};
	const typeColors: Record<string, string> = {
		exercise: 'var(--pr)',
		circuit: 'var(--pr)',
		group: 'var(--tx2)',
		repeater: HANGBOARD_COLOR,
		hangboard_rep: HANGBOARD_COLOR
	};

	function handleTypeClick(type: TrainingItemType) {
		if (type === 'exercise') {
			showExerciseModal = true;
		} else {
			onAdd(type);
			expanded = false;
		}
	}

	function handleExerciseSelect(exercise: Exercise) {
		onAdd('exercise', exercise.id);
		showExerciseModal = false;
		expanded = false;
	}
</script>

<div {@attach droppable.attach} class="mt-2" style="border-radius: var(--rl);">
	{#if !expanded}
		<button
			onclick={() => (expanded = true)}
			class="w-full"
			style="
				padding: 10px 14px; border-radius: var(--rl);
				border: 1.5px dashed {droppable.isDropTarget ? 'var(--pr)' : 'var(--bd)'};
				display: flex; align-items: center; justify-content: center; gap: 6px;
				color: {droppable.isDropTarget ? 'var(--pr)' : 'var(--tx3)'};
				font-size: 12.5px; font-weight: 500; cursor: pointer;
				background: {droppable.isDropTarget ? 'var(--pr-fog)' : 'transparent'};
				font-family: var(--font); transition: border-color 0.15s, color 0.15s;
			"
		>
			<Icon name="plus" size={13} color="currentColor" />
			Add item
		</button>
	{:else}
		<div
			style="
			padding: 10px 14px; border-radius: var(--rl);
			border: 1px solid var(--bd); background: var(--panel2);
			display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
		"
		>
			{#each allowedTypes as type (type)}
				<button
					onclick={() => handleTypeClick(type)}
					style="
						display: flex; align-items: center; gap: 5px;
						padding: 6px 12px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: #fff;
						cursor: pointer; font-family: var(--font); font-size: 12px; font-weight: 600;
						color: {typeColors[type]};
					"
				>
					<Icon name={typeIcons[type]} size={12} color={typeColors[type]} />
					{typeLabels[type]}
				</button>
			{/each}
			<span
				onclick={() => (expanded = false)}
				style="font-size: 11px; color: var(--tx3); cursor: pointer; margin-left: 4px;"
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && (expanded = false)}>Cancel</span
			>
		</div>
	{/if}
</div>

{#if showExerciseModal}
	<SelectExerciseModal
		onSelect={handleExerciseSelect}
		onClose={() => {
			showExerciseModal = false;
			expanded = false;
		}}
	/>
{/if}
