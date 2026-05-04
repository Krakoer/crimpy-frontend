<script lang="ts">
	import { snackbar } from '$lib/stores/snackbar.svelte';
</script>

{#if snackbar.visible}
	<div
		class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border-2 px-5 py-3"
		style="
			font-family: monospace;
			font-size: 13px;
			font-weight: bold;
			letter-spacing: 0.5px;
			background-color: {snackbar.type === 'error' ? '#fff5f5' : '#f5fff8'};
			border-color: {snackbar.type === 'error' ? '#B85450' : '#2d7a4f'};
			color: {snackbar.type === 'error' ? '#B85450' : '#2d7a4f'};
			box-shadow: 3px 3px 0 0 rgba(0,0,0,0.15);
			white-space: nowrap;
		"
		role="status"
		aria-live="polite"
	>
		{snackbar.message}
		<button
			onclick={snackbar.dismiss}
			class="ml-4 opacity-50 transition-opacity hover:opacity-100"
			aria-label="Dismiss"
		>x</button>
	</div>
{/if}
