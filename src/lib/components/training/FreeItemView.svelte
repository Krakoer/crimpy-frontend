<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';
	import { BLOCK_PRESENTATION } from '$lib/block-presentation';
	import ItemCommentDisplay from './ItemCommentDisplay.svelte';

	interface Props {
		item: TrainingItem;
	}

	let { item }: Props = $props();

	const NOTE_COLOR = BLOCK_PRESENTATION.free.color;

	let collapsed = $state(false);

	let text = $derived((item.free_text ?? '').trim());
	let summary = $derived(text.split('\n')[0]);

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(
		COLLAPSE_KEY
	);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div
	style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed
			? '#fff'
			: 'var(--panel2)'};"
		onclick={() => (collapsed = !collapsed)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && (collapsed = !collapsed)}
	>
		<div
			style="width: 4px; height: 20px; background: {NOTE_COLOR}; border-radius: 2px; flex-shrink: 0;"
		></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span
			style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;"
		>
			Note
			{#if collapsed && summary}
				<span
					style="font-size: 11px; color: var(--tx3); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
					>{summary}</span
				>
			{/if}
		</span>
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2); padding: 12px 14px;">
			{#if text}
				<p
					style="margin: 0; font-size: 13px; line-height: 1.5; color: var(--tx); white-space: pre-wrap; overflow-wrap: anywhere;"
				>
					{item.free_text}
				</p>
			{:else}
				<p style="margin: 0; font-size: 13px; color: var(--tx3);">No text</p>
			{/if}

			<!-- A note carries its own text, so the portal offers no separate comment
			on one. The column is type agnostic though, and a training written
			elsewhere can hold one, which the coach should still see. -->
			{#if item.comment?.trim()}
				<div style="margin-top: 10px;">
					<ItemCommentDisplay {item} inset={null} />
				</div>
			{/if}
		</div>
	{/if}
</div>
