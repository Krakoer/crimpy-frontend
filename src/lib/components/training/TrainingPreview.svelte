<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ItemListView from './ItemListView.svelte';

	interface Props {
		items: TrainingItem[];
		exercises: Exercise[];
	}

	let { items, exercises }: Props = $props();
</script>

<ItemListView {items} {exercises} />
