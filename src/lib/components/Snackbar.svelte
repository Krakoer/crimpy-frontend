<script lang="ts">
	import { snackbar } from '$lib/stores/snackbar.svelte';

	const TONES: Record<string, { background: string; color: string }> = {
		success: { background: '#f3f8f4', color: 'var(--gn)' },
		error: { background: '#fdf3f3', color: 'var(--rd)' },
		warning: { background: '#fdf7ee', color: 'var(--gd)' }
	};

	let tone = $derived(TONES[snackbar.type] ?? TONES.success);
</script>

{#if snackbar.visible}
	<div
		class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
		style="
			display: flex; align-items: center; gap: 12px;
			font-family: var(--font); font-size: 13px; font-weight: 600;
			padding: 10px 16px; border-radius: var(--rs); max-width: min(90vw, 620px);
			background: {tone.background};
			border: 1px solid {tone.color};
			color: {tone.color};
			box-shadow: var(--sh-hi);
		"
		role="status"
		aria-live="polite"
	>
		{snackbar.message}
		<button
			onclick={snackbar.dismiss}
			style="
				background: none; border: none; cursor: pointer; padding: 0;
				font-size: 14px; line-height: 1; opacity: 0.5;
				color: inherit; font-family: var(--font);
			"
			aria-label="Dismiss">x</button
		>
	</div>
{/if}
