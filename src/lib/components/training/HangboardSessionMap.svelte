<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SessionMapRow, SessionMapStep } from './hangboard-config';

	interface Props {
		rows: SessionMapRow[];
		onStepClick?: (address: number, event: MouseEvent) => void;
		onSelectSet?: (index: number) => void;
		setActions?: Snippet<[number]>;
	}

	let { rows, onStepClick, onSelectSet, setActions }: Props = $props();
</script>

{#snippet tile(step: SessionMapStep)}
	<span class="hb-step-badge">{step.badge}</span>
	{#if step.showValues}
		<span class="hb-step-edge">{step.edgeLine}</span>
		<span class="hb-step-detail">{step.detailLine}</span>
	{/if}
{/snippet}

<div class="hb-sets">
	{#each rows as row (row.index)}
		<div class="hb-set">
			{#if onSelectSet}
				<button
					class="hb-set-label hb-clickable"
					class:hb-on={row.selected}
					onclick={() => onSelectSet(row.index)}
					title="Select this whole set"
					aria-pressed={row.selected}>Set {row.index + 1}</button
				>
			{:else}
				<span class="hb-set-label">Set {row.index + 1}</span>
			{/if}
			<div class="hb-steps">
				{#each row.steps as step (step.address)}
					{#if onStepClick}
						<button
							class="hb-step hb-clickable"
							class:hb-wide={step.showValues}
							class:hb-full={step.full}
							class:hb-on={step.selected}
							class:hb-custom={step.customised}
							onclick={(e) => onStepClick(step.address, e)}
							title={step.title}
							aria-pressed={step.selected}
						>
							{@render tile(step)}
						</button>
					{:else}
						<div
							class="hb-step"
							class:hb-wide={step.showValues}
							class:hb-full={step.full}
							class:hb-custom={step.customised}
							title={step.title}
						>
							{@render tile(step)}
						</div>
					{/if}
				{/each}
			</div>
			{@render setActions?.(row.index)}
		</div>
	{/each}
</div>

<style>
	.hb-sets {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 380px;
		overflow: auto;
		padding: 2px;
	}

	.hb-set {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.hb-set-label {
		width: 58px;
		flex-shrink: 0;
		padding: 5px 6px;
		border-radius: var(--rs);
		border: 1px solid transparent;
		background: transparent;
		color: var(--tx3);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: left;
		font-family: var(--font);
	}

	.hb-set-label.hb-on {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, transparent);
		color: var(--hb);
	}

	.hb-steps {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		flex: 1;
		min-width: 0;
	}

	.hb-step {
		width: 40px;
		height: 40px;
		padding: 0;
		border-radius: var(--rs);
		border: 1px solid var(--bd);
		background: #fff;
		color: var(--tx2);
		font-family: var(--font);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hb-clickable {
		cursor: pointer;
	}

	.hb-step.hb-wide {
		width: auto;
		min-width: 112px;
		height: auto;
		padding: 6px 10px;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		text-align: left;
	}

	.hb-step.hb-full {
		flex: 1;
	}

	.hb-step.hb-custom {
		border-color: var(--hb);
		background: color-mix(in srgb, var(--hb) 12%, transparent);
		color: var(--hb);
	}

	.hb-step.hb-on {
		border-color: var(--hb);
		background: var(--hb);
		color: #fff;
	}

	.hb-step-badge {
		font-size: 12px;
		font-weight: 700;
		color: inherit;
	}

	.hb-step.hb-wide .hb-step-badge {
		font-size: 9px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.75;
	}

	.hb-step-edge {
		font-size: 11px;
		font-weight: 700;
		color: inherit;
	}

	.hb-step-detail {
		font-size: 10px;
		white-space: nowrap;
		opacity: 0.8;
	}

	.hb-step:focus-visible,
	.hb-set-label:focus-visible {
		outline: 2px solid var(--hb);
		outline-offset: 2px;
	}
</style>
