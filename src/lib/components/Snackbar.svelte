<script lang="ts">
	import { snackbar } from '$lib/stores/snackbar.svelte';
</script>

{#if snackbar.visible}
	<div
		class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
		style="
			display: flex; align-items: center; gap: 12px;
			font-family: var(--font); font-size: 13px; font-weight: 600;
			padding: 10px 16px; border-radius: var(--rs); white-space: nowrap;
			background: {snackbar.type === 'error' ? '#fdf3f3' : '#f3f8f4'};
			border: 1px solid {snackbar.type === 'error' ? 'var(--rd)' : 'var(--gn)'};
			color: {snackbar.type === 'error' ? 'var(--rd)' : 'var(--gn)'};
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
