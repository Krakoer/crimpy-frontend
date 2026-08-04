<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		maxWidth = 420,
		children
	}: { title: string; maxWidth?: number; children: Snippet } = $props();
</script>

<svelte:head>
	<title>{title} - Crimpy</title>
</svelte:head>

<div
	style="
		min-height: 100vh;
		display: flex; align-items: center; justify-content: center;
		padding: 40px 20px;
		background: var(--bg);
		font-family: var(--font);
		color: var(--tx);
	"
>
	<div style="width: 100%; max-width: {maxWidth}px;">
		<div
			style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 22px;"
		>
			<div
				style="
					width: 36px; height: 36px;
					border-radius: 10px;
					background: var(--pr);
					display: flex; align-items: center; justify-content: center;
					box-shadow: 0 4px 10px rgba(194, 113, 79, 0.25);
				"
			>
				<Icon name="mountain" size={20} color="#fff" />
			</div>
			<div>
				<div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--tx);">
					Crimpy
				</div>
				<div
					style="font-size: 10.5px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; margin-top: -1px;"
				>
					Coach Studio
				</div>
			</div>
		</div>

		<div
			style="
				background: var(--panel);
				border: 1px solid var(--bd);
				border-radius: var(--rl);
				box-shadow: var(--sh);
			"
		>
			{@render children()}
		</div>
	</div>
</div>
