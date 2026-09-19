<script lang="ts">
	import type { SessionRpe } from '$lib/rpe';
	import { sessionRpeColor, sessionRpeTint, sessionRpeTitle } from '$lib/rpe';

	interface Props {
		rpe: SessionRpe;
		// The week grid packs a session into one short line, so there the badge is
		// the value alone. Everywhere with room for it, the scale is named, since
		// a bare number does not say which of the two RPE scales it sits on.
		compact?: boolean;
	}

	let { rpe, compact = false }: Props = $props();

	const color = $derived(sessionRpeColor(rpe));
	const tint = $derived(sessionRpeTint(rpe));
	const title = $derived(sessionRpeTitle(rpe));
</script>

<span
	data-testid="session-rpe"
	data-compact={compact ? 'true' : 'false'}
	{title}
	style="
		display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
		padding: {compact ? '0 4px' : '3px 8px'}; border-radius: 999px;
		background: {tint}; color: {color};
		font-size: {compact ? '9px' : '10.5px'}; font-weight: 700;
		letter-spacing: 0.04em; white-space: nowrap;
	"
>
	{#if !compact}
		<span style="opacity: 0.75;">RPE</span>
	{/if}
	{compact ? rpe.mark : rpe.short}
</span>
