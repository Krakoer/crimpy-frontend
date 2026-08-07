<script lang="ts">
	import type { TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';
	import {
		HANGBOARD_HANDS,
		hangboardGranularity,
		hangboardHand,
		hangboardReps,
		hangboardRowCount,
		isTwoHandedMode
	} from './hangboard-granularity';

	interface Props {
		item: TrainingItem;
	}

	let { item }: Props = $props();

	let collapsed = $state(false);

	const HB_COLOR = '#4A7C8C';

	const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
		bw: 'BW',
		percent_bw: '% BW',
		kg: 'kg',
		lbs: 'lbs',
		max: 'MAX'
	};

	let granularity = $derived(hangboardGranularity(item));
	let rowCount = $derived(hangboardRowCount(item, granularity));
	let repsPerSet = $derived(hangboardReps(item));
	let twoHanded = $derived(isTwoHandedMode(hangboardHand(item)));
	// Grips of the hand that loads describes: the right one when the hands are
	// configured separately, the single shared array otherwise.
	let handGripIndex = $derived(twoHanded ? 1 : 0);
	let columnCount = $derived(twoHanded ? 6 : 4);
	let handLabel = $derived(
		HANGBOARD_HANDS.find((h) => h.value === hangboardHand(item))?.label ?? 'Both'
	);
	let handHint = $derived(HANGBOARD_HANDS.find((h) => h.value === hangboardHand(item))?.hint ?? '');
	let granularityLabel = $derived(
		granularity === 'set' ? 'PER-SET' : granularity === 'rep' ? 'PER-REP' : 'UNIFORM'
	);

	function fmtLoad(value: number, unit: LoadUnit): string {
		if (unit === 'max') return 'MAX';
		return `${value} ${LOAD_UNIT_LABELS[unit]}`;
	}

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
					<span style="font-size: 13px; font-weight: 700; color: var(--tx);" title={handHint}
						>{handLabel}</span
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
						style="font-size: 10px; font-weight: 600; color: {granularity === 'uniform'
							? 'var(--tx3)'
							: HB_COLOR}; letter-spacing: 0.04em;"
					>
						{granularityLabel}
					</span>
				</div>

				{#if granularity === 'uniform'}
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
							{#if !twoHanded}
								<span style="font-size: 14px; font-weight: 700; color: var(--tx);">
									{item.loads?.[0] ? fmtLoad(item.loads[0].value, item.loads[0].unit) : '-'}
								</span>
							{:else}
								<div style="display: flex; flex-direction: column; gap: 2px;">
									<div style="display: flex; align-items: center; gap: 6px;">
										<span style="font-size: 10px; color: var(--tx3); width: 10px;">L</span>
										<span style="font-size: 14px; font-weight: 700; color: var(--tx);"
											>{item.left_loads?.[0]
												? fmtLoad(item.left_loads[0].value, item.left_loads[0].unit)
												: '-'}</span
										>
									</div>
									<div style="display: flex; align-items: center; gap: 6px;">
										<span style="font-size: 10px; color: var(--tx3); width: 10px;">R</span>
										<span style="font-size: 14px; font-weight: 700; color: var(--tx);"
											>{item.loads?.[0]
												? fmtLoad(item.loads[0].value, item.loads[0].unit)
												: '-'}</span
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
								>{item.hand_positions?.[handGripIndex]?.[0] ?? '-'}</span
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
									{#if !twoHanded}
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
								{#each Array.from({ length: rowCount }, (_, i) => i) as repIdx (repIdx)}
									{#if granularity === 'set' && repIdx % repsPerSet === 0}
										<tr>
											<td
												colspan={columnCount}
												style="padding: 8px 10px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: {HB_COLOR}; background: color-mix(in srgb, {HB_COLOR} 8%, transparent); border-bottom: 1px solid var(--bd);"
												>Set {repIdx / repsPerSet + 1}</td
											>
										</tr>
									{/if}
									<tr style="border-bottom: 1px solid var(--bd2);">
										<td
											style="padding: 6px 10px; font-weight: 700; color: var(--tx2); font-size: 12px;"
											>{(repIdx % repsPerSet) + 1}</td
										>
										<td style="padding: 6px 10px; text-align: center; color: var(--tx);"
											>{item.edge_sizes_mm?.[repIdx] ?? '-'}</td
										>
										{#if !twoHanded}
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.loads?.[repIdx]
													? fmtLoad(item.loads[repIdx].value, item.loads[repIdx].unit)
													: '-'}
											</td>
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.hand_positions?.[0]?.[repIdx] ?? '-'}
											</td>
										{:else}
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.left_loads?.[repIdx]
													? fmtLoad(item.left_loads[repIdx].value, item.left_loads[repIdx].unit)
													: '-'}
											</td>
											<td style="padding: 6px 10px; text-align: center; color: var(--tx);">
												{item.loads?.[repIdx]
													? fmtLoad(item.loads[repIdx].value, item.loads[repIdx].unit)
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
