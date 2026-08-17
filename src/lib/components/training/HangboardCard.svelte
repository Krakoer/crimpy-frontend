<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		title: string;
		summary: string;
		// The editors keep the summary beside the title at all times; the read-only
		// cards show it only once the body is hidden.
		summaryOnlyWhenCollapsed?: boolean;
		// Omitted by the read-only cards, which carry no actions.
		onRemove?: () => void;
		onDuplicate?: () => void;
		// Bound by a card that owns keyboard shortcuts, so it can focus itself and
		// tell whether the focus is still inside it.
		element?: HTMLDivElement | null;
		collapsed?: boolean;
		body: Snippet;
	}

	let {
		title,
		summary,
		summaryOnlyWhenCollapsed = false,
		onRemove,
		onDuplicate,
		element = $bindable(null),
		collapsed = $bindable(false),
		body
	}: Props = $props();

	let confirmDelete = $state(false);

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(
		COLLAPSE_KEY
	);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});

	// A pending delete confirmation owns the header, so a click meant for Cancel
	// never folds the card instead.
	function toggle() {
		if (!confirmDelete) collapsed = !collapsed;
	}
</script>

<div class="hb-card" bind:this={element} tabindex="-1">
	<div
		class="hb-header"
		style="background: {collapsed ? '#fff' : 'var(--panel2)'};"
		onclick={toggle}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && toggle()}
	>
		<div class="hb-accent"></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span class="hb-title">
			{title}
			{#if collapsed || !summaryOnlyWhenCollapsed}
				<span class="hb-summary">{summary}</span>
			{/if}
		</span>
		{#if onRemove || onDuplicate}
			<div
				style="display: flex; gap: 3px; flex-shrink: 0;"
				onclick={(e) => e.stopPropagation()}
				role="none"
			>
				{#if confirmDelete}
					<button class="hb-pill hb-danger" onclick={onRemove}>Delete</button>
					<button class="hb-pill" onclick={() => (confirmDelete = false)}>Cancel</button>
				{:else}
					{#if onDuplicate}
						<button
							class="hb-act-btn"
							onclick={onDuplicate}
							title="Duplicate"
							aria-label="Duplicate"
						>
							<Icon name="copy" size={11} color="currentColor" />
						</button>
					{/if}
					{#if onRemove}
						<button
							class="hb-act-btn"
							onclick={() => (confirmDelete = true)}
							title="Delete"
							aria-label="Delete"
						>
							<Icon name="trash" size={11} color="currentColor" />
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>

	{#if !collapsed}
		<div class="hb-body">{@render body()}</div>
	{/if}
</div>

<style>
	/* Focusable so a card can own its own keyboard shortcuts, but never drawn as
	   focused: it is a container the coach never tabs to. */
	.hb-card {
		background: #fff;
		border-radius: var(--rl);
		border: 1px solid color-mix(in srgb, var(--hb) 30%, transparent);
		box-shadow: var(--sh);
		overflow: hidden;
		outline: none;
	}

	.hb-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		cursor: pointer;
	}

	.hb-accent {
		width: 4px;
		height: 20px;
		background: var(--hb);
		border-radius: 2px;
		flex-shrink: 0;
	}

	.hb-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--hb);
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.hb-summary {
		font-size: 11px;
		color: var(--tx3);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hb-body {
		border-top: 1px solid var(--bd2);
		padding: 16px 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.hb-pill {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx2);
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font);
	}

	.hb-pill.hb-danger {
		border-color: #e57373;
		color: #e57373;
	}

	.hb-act-btn {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx3);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.hb-act-btn:hover {
		border-color: var(--hb);
		color: var(--hb);
	}

	.hb-pill:focus-visible,
	.hb-act-btn:focus-visible {
		outline: 2px solid var(--hb);
		outline-offset: 1px;
	}
</style>
