<script lang="ts">
	import { getContext } from 'svelte';
	import {
		OVERRIDE_HISTORY_KEY,
		OVERRIDE_KEY,
		type OverrideHistoryContext,
		type OverrideMode
	} from '$lib/components/training/override-context';

	interface Props {
		itemId?: string;
	}

	let { itemId }: Props = $props();

	// Both are absent outside a program week, which is what keeps the same list
	// usable in the training editor.
	const mode = getContext<OverrideMode | undefined>(OVERRIDE_KEY);
	const history = getContext<OverrideHistoryContext | undefined>(OVERRIDE_HISTORY_KEY);

	let weeks = $derived(itemId ? (history?.byItem[itemId] ?? []) : []);
	let overridden = $derived(itemId ? (mode?.isOverridden(itemId) ?? false) : false);
	// Only worth a strip once a week has actually asked for something: an item no
	// week has ever touched would otherwise carry a row of "as written" under
	// every block of the training.
	let showsWeeks = $derived(weeks.length > 1 && weeks.some((entry) => entry.summary !== ''));
</script>

{#if itemId && mode && (showsWeeks || overridden)}
	<div
		style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 4px 2px 4px;"
	>
		{#if showsWeeks}
			<span
				style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--tx3); flex-shrink: 0;"
				>PER WEEK</span
			>
			{#each weeks as entry (entry.week)}
				<span
					title={entry.summary
						? `Week ${entry.week} asks for ${entry.summary}`
						: `Week ${entry.week} runs this as the training writes it`}
					style="
						display: inline-flex; align-items: baseline; gap: 4px;
						padding: 2px 7px; border-radius: 999px; font-size: 10.5px;
						border: 1px solid {entry.current ? 'var(--pr)' : 'var(--bd)'};
						background: {entry.current ? 'var(--pr-fog)' : 'var(--panel)'};
						color: {entry.summary ? 'var(--tx2)' : 'var(--tx3)'};
					"
				>
					<span style="font-weight: 700; color: {entry.current ? 'var(--pr)' : 'var(--tx3)'};"
						>W{entry.week}</span
					>
					{entry.summary || 'as written'}
				</span>
			{/each}
		{/if}
		<div style="flex: 1;"></div>
		{#if overridden && !mode.readOnly}
			<button
				onclick={() => mode.resetItem(itemId)}
				style="border: none; background: transparent; padding: 2px 4px; font-family: var(--font); font-size: 10.5px; font-weight: 600; color: var(--tx3); cursor: pointer;"
				>Reset to the training</button
			>
		{/if}
	</div>
{/if}
