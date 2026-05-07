<script lang="ts">
	import { createDroppable } from '@dnd-kit/svelte';
	import type { Exercise, TrainingItemType } from '$lib/api/client';
	import SelectExerciseModal from './SelectExerciseModal.svelte';

	interface Props {
		containerId: string;
		allowedTypes: TrainingItemType[];
		onAdd: (type: TrainingItemType, exerciseId?: string) => void;
	}

	let { containerId, allowedTypes, onAdd }: Props = $props();

	const droppable = createDroppable({ get id() { return containerId; } });

	let expanded = $state(false);
	let showExerciseModal = $state(false);

	const typeLabels: Record<string, string> = {
		circuit: 'Circuit',
		section: 'Section',
		hangboard: 'Hangboard',
		exercise: 'Exercise'
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

<div
	{@attach droppable.attach}
	class="mt-2"
	style:background-color={droppable.isDropTarget ? '#fdf6f0' : undefined}
>
	{#if !expanded}
		<button
			onclick={() => (expanded = true)}
			class="w-full border border-dashed py-3 transition-colors"
			style:border-color={droppable.isDropTarget ? '#C6613F' : '#d1d5db'}
			style:color={droppable.isDropTarget ? '#C6613F' : '#9ca3af'}
			style="font-family: monospace; font-size: 13px;"
		>
			+ Add items or drop them here
		</button>
	{:else}
		<div class="border border-dashed border-gray-400 p-3">
			<div class="mb-2 flex flex-wrap gap-2">
				{#each allowedTypes as type}
					<button
						onclick={() => handleTypeClick(type)}
						class="border border-black px-3 py-1.5 transition-colors hover:border-gray-500 hover:text-gray-600"
						style="font-family: monospace; font-size: 13px;"
					>
						{typeLabels[type]} +
					</button>
				{/each}
			</div>
			<button
				onclick={() => (expanded = false)}
				class="text-gray-400 transition-colors hover:text-gray-700"
				style="font-family: monospace; font-size: 12px;"
			>
				cancel
			</button>
		</div>
	{/if}
</div>

{#if showExerciseModal}
	<SelectExerciseModal
		onSelect={handleExerciseSelect}
		onClose={() => { showExerciseModal = false; }}
	/>
{/if}
