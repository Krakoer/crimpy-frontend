<script lang="ts">
	import type { Exercise, SessionItem } from '$lib/api/client';
	import ItemListView from './ItemListView.svelte';

	interface Props {
		items: SessionItem[];
		exercises: Exercise[];
	}

	let { items, exercises }: Props = $props();
</script>

<ItemListView {items} {exercises} />
