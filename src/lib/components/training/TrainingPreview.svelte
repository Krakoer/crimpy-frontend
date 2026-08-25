<script lang="ts">
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import ItemListView from './ItemListView.svelte';
	import type { AssessmentCatalog } from '$lib/assessments';

	interface Props {
		items: TrainingItem[];
		exercises: Exercise[];
		catalog: AssessmentCatalog;
	}

	let { items, exercises, catalog }: Props = $props();
</script>

<ItemListView {items} {exercises} {catalog} />
