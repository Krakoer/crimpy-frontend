<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		label: string;
		onAdd: () => void;
	}

	let { label, onAdd }: Props = $props();
</script>

<!-- A click inside a block card must not reach the header, which folds it. -->
<button
	onclick={(e) => {
		e.stopPropagation();
		onAdd();
	}}
	style="display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 5px; border: 1px dashed var(--bd); background: #fff; color: var(--tx3-sm); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);"
>
	<Icon name="plus" size={11} color="var(--tx3)" />
	{label}
</button>
