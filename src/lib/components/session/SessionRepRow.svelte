<script lang="ts">
	import type { RepData } from '$lib/api/client';
	import { gripShort, isOnTarget } from '$lib/sessions';

	interface Props {
		rep: RepData;
		position: number;
		accent: string;
		// Whether the list this row belongs to prescribes edges at all, so a
		// session done off the hangboard keeps no empty column.
		showEdge: boolean;
		// The best rep of the session, which a rep with no prescribed load is
		// measured against: a full bar would otherwise read as having met a
		// target that was never set. Null for a session the sensor never answered
		// for, which leaves every bar of it empty rather than scaling its zeros
		// against each other.
		reference: number | null;
	}

	let { rep, position, accent, showEdge, reference }: Props = $props();

	const fillRatio = $derived.by(() => {
		const target = rep.target_weight > 0 ? rep.target_weight : (reference ?? 0);
		if (target <= 0) return 0;
		return Math.min(1, rep.average_weight / target);
	});
</script>

<div style="display: flex; align-items: center; gap: 10px;">
	<span style="font-size: 11px; color: var(--tx3); font-weight: 600; width: 28px; flex-shrink: 0;"
		>#{position}</span
	>
	<span style="font-size: 11px; font-weight: 700; color: {accent}; width: 16px; flex-shrink: 0;"
		>{rep.right_hand ? 'R' : 'L'}</span
	>
	<span
		style="font-size: 11px; color: var(--tx3); width: 32px; flex-shrink: 0;"
		title={gripShort(rep.grip_position)}>{gripShort(rep.grip_position)}</span
	>
	{#if showEdge}
		<span style="font-size: 11px; color: var(--tx3); width: 34px; flex-shrink: 0;"
			>{rep.edge_size_mm ? `${rep.edge_size_mm}mm` : ''}</span
		>
	{/if}
	<div
		style="flex: 1; height: 6px; border-radius: 999px; background: var(--bd2); overflow: hidden;"
	>
		<div
			style="height: 100%; width: {fillRatio * 100}%; background: {isOnTarget(rep)
				? 'var(--gn)'
				: accent};"
		></div>
	</div>
	<span
		style="font-size: 12px; font-weight: 600; color: var(--tx); width: 92px; text-align: right; flex-shrink: 0;"
	>
		{rep.average_weight.toFixed(1)}{rep.target_weight > 0
			? ` / ${rep.target_weight.toFixed(1)}`
			: ''} kg
	</span>
</div>
