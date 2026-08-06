<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import { formatLoad } from '$lib/assessments';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
	}

	let { item }: Props = $props();

	let collapsed = $state(false);

	const HB_COLOR = '#4A7C8C';

	let perRep = $derived((item.edge_sizes_mm?.length ?? 0) > 1);

	let collapsedSummary = $derived.by(() => {
		const sets = item.cycles ?? 1;
		const reps = item.reps ?? 1;
		const work = item.worktime_seconds ?? 0;
		const rest = item.rest_seconds ?? 0;
		return `${sets} sets x ${reps} reps · ${work}s on / ${rest}s off`;
	});

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
	style="background: #fff; border-radius: var(--rl); border: 1px solid color-mix(in srgb, {HB_COLOR} 30%, transparent); box-shadow: var(--sh); overflow: hidden;"
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
			style="width: 4px; height: 20px; background: {HB_COLOR}; border-radius: 2px; flex-shrink: 0;"
		></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span
			style="font-size: 13px; font-weight: 700; color: {HB_COLOR}; flex: 1; display: flex; align-items: center; gap: 8px;"
		>
			Hangboard
			{#if collapsed}
				<span style="font-size: 11px; color: var(--tx3); font-weight: 500;">{collapsedSummary}</span
				>
			{/if}
		</span>
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2);">
			<div
				style="display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 18px; border-bottom: 1px solid var(--bd2);"
			>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>SETS</span
					>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);"
						>{item.cycles ?? 1}</span
					>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>REPS</span
					>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);">{item.reps ?? 1}</span>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>WORK</span
					>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);"
						>{item.worktime_seconds ?? 0}s</span
					>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>REP REST</span
					>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);"
						>{item.rest_seconds ?? 0}s</span
					>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>SET REST</span
					>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);"
						>{item.cycle_rest_seconds ?? 0}s</span
					>
				</div>
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>HAND</span
					>
					<span style="font-size: 13px; font-weight: 700; color: var(--tx);"
						>{item.hand ?? 'both'}</span
					>
				</div>
			</div>

			<div style="padding: 12px 18px;">
				<div
					style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;"
				>
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>REP PARAMETERS</span
					>
					<span
						style="font-size: 10px; font-weight: 600; color: {perRep
							? HB_COLOR
							: 'var(--tx3)'}; letter-spacing: 0.04em;"
					>
						{perRep ? 'PER-REP ON' : 'PER-REP OFF'}
					</span>
				</div>

				{#if !perRep}
					<div style="display: flex; gap: 20px; flex-wrap: wrap;">
						<div style="display: flex; flex-direction: column; gap: 2px;">
							<span
								style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
								>EDGE (mm)</span
							>
							<span style="font-size: 14px; font-weight: 700; color: var(--tx);"
								>{item.edge_sizes_mm?.[0] ?? '-'}</span
							>
						</div>
						<div style="display: flex; flex-direction: column; gap: 2px;">
							<span
								style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
								>LOAD</span
							>
							{#if item.hand !== 'split'}
								<span style="font-size: 14px; font-weight: 700; color: var(--tx);">
									{item.loads?.[0] ? formatLoad(item.loads[0]) : '-'}
								</span>
							{:else}
								<div style="display: flex; flex-direction: column; gap: 2px;">
									<div style="display: flex; align-items: center; gap: 6px;">
										<span style="font-size: 10px; color: var(--tx3); width: 10px;">L</span>
										<span style="font-size: 14px; font-weight: 700; color: var(--tx);"
											>{item.loads?.[0] ? formatLoad(item.loads[0]) : '-'}</span
										>
									</div>
									<div style="display: flex; align-items: center; gap: 6px;">
										<span style="font-size: 10px; color: var(--tx3); width: 10px;">R</span>
										<span style="font-size: 14px; font-weight: 700; color: var(--tx);"
											>{item.loads?.[1] ? formatLoad(item.loads[1]) : '-'}</span
										>
									</div>
								</div>
							{/if}
						</div>
						<div style="display: flex; flex-direction: column; gap: 2px;">
							<span
								style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
								>GRIP</span
							>
							<span style="font-size: 14px; font-weight: 700; color: var(--tx);"
								>{item.hand_positions?.[0]?.[0] ?? '-'}</span
							>
						</div>
					</div>
				{:else}
					<div style="overflow-x: auto;">
						<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
							<thead>
								<tr style="background: var(--panel2);">
									<th
										style="padding: 6px 10px; text-align: left; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
										>REP</th
									>
									<th
										style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
										>EDGE (mm)</th
									>
									{#if item.hand !== 'split'}
										<th
											style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
											>LOAD</th
										>
										<th
											style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
											>GRIP</th
										>
									{:else}
										<th
											style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
											>L LOAD</th
										>
										<th
											style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
											>R LOAD</th
										>
										<th
											style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
											>L GRIP</th
										>
										<th
											style="padding: 6px 10px; text-align: center; font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em; border-bottom: 1px solid var(--bd);"
											>R GRIP</th
										>
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each Array.from({ length: item.reps ?? 1 }, (_, i) => i) as repIdx (repIdx)}
									<tr style="border-bottom: 1px solid var(--bd2);">
										<td
											style="padding: 6px 10px; font-weight: 700; color: var(--tx2); font-size: 12px;"
											>{repIdx + 1}</td
										>
										<td style="padding: 6px 10px; text-align: center; color: var(--tx);"
											>{item.edge_sizes_mm?.[repIdx] ?? '-'}</td
										>
										{#if item.hand !== 'split'}
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.loads?.[repIdx] ? formatLoad(item.loads[repIdx]) : '-'}
											</td>
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.hand_positions?.[0]?.[repIdx] ?? '-'}
											</td>
										{:else}
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.loads?.[2 * repIdx] ? formatLoad(item.loads[2 * repIdx]) : '-'}
											</td>
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.loads?.[2 * repIdx + 1]
													? formatLoad(item.loads[2 * repIdx + 1])
													: '-'}
											</td>
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.hand_positions?.[0]?.[repIdx] ?? '-'}
											</td>
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.hand_positions?.[1]?.[repIdx] ?? '-'}
											</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
