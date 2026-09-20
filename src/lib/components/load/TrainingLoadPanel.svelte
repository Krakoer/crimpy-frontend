<script lang="ts">
	import type { WeeklyTrainingLoad } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import TrainingLoadChart from '$lib/components/load/TrainingLoadChart.svelte';
	import {
		ACUTE_LOAD_BANDS,
		LOAD_CHANGE_BANDS,
		NO_VALUE,
		RATIO_BANDS,
		UNLABELLED_RATIO_BAND_NOTE,
		bandFor,
		bandRangeLabel,
		chronicBaselineNote,
		missingRatioNote,
		climbingShare,
		formatLoad,
		formatMinutes,
		formatPercent,
		formatRatio,
		formatRpe,
		formatWeekLabel,
		ratingCoverage,
		toneColor
	} from '$lib/training-load';

	interface Props {
		weeks: WeeklyTrainingLoad[];
		loading?: boolean;
		// The series could not be read. Distinct from an athlete with no
		// sessions, whose weeks come back as real zeros.
		failed?: boolean;
	}

	let { weeks, loading = false, failed = false }: Props = $props();

	const current = $derived(weeks.length > 0 ? weeks[weeks.length - 1] : null);
	const ratioBand = $derived(bandFor(RATIO_BANDS, current?.acute_chronic_ratio ?? null));
	const loadBand = $derived(bandFor(ACUTE_LOAD_BANDS, current?.acute_load ?? null));
	const changeBand = $derived(bandFor(LOAD_CHANGE_BANDS, current?.load_change_percent ?? null));
	const baselineNote = $derived(current ? chronicBaselineNote(current) : null);
	// The series always ends on the Monday of the week being trained now, so the
	// tiles are a week that has not finished. Said out loud, because otherwise
	// the biggest numbers on the page read as a verdict on a week that is two
	// days old.
	const currentWeekLabel = $derived(current ? formatWeekLabel(current.week_start) : '');
	const anyFailed = $derived(weeks.some((week) => week.failed_sessions > 0));
	const anyUnlabelled = $derived(
		weeks.some((week) => bandFor(RATIO_BANDS, week.acute_chronic_ratio)?.tone === 'unlabelled')
	);

	const cardStyle =
		'background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh);';
	const captionStyle =
		'font-size: 10.5px; color: var(--tx3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;';
</script>

<div style="display: flex; flex-direction: column; gap: 16px;">
	{#if loading}
		<div
			style="{cardStyle} padding: 48px 24px; text-align: center; color: var(--tx3); font-size: 13px;"
		>
			Loading the weekly load...
		</div>
	{:else if failed}
		<div
			style="{cardStyle} padding: 48px 24px; text-align: center; color: var(--tx3); font-size: 13px;"
		>
			The weekly load could not be read, so nothing here is known.
		</div>
	{:else if weeks.length === 0}
		<div
			style="{cardStyle} padding: 48px 24px; text-align: center; color: var(--tx3); font-size: 13px;"
		>
			No weeks to show yet.
		</div>
	{:else}
		<!-- This week at a glance -->
		<div style="display: flex; align-items: baseline; gap: 8px; padding: 0 4px;">
			<div style={captionStyle}>Week of {currentWeekLabel}</div>
			<div style="font-size: 11px; color: var(--tx3);">
				still in progress, so every figure below is a part week
			</div>
		</div>
		<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
			{#each [{ k: 'AL:CL ratio', v: formatRatio(current?.acute_chronic_ratio ?? null), note: ratioBand?.label ?? (current ? missingRatioNote(current) : ''), c: ratioBand ? toneColor(ratioBand.tone) : 'var(--tx3)' }, { k: 'Acute load', v: formatLoad(current?.acute_load ?? null), note: loadBand?.label ?? 'Not rated, so not known', c: loadBand ? toneColor(loadBand.tone) : 'var(--tx3)' }, { k: 'Week on week', v: formatPercent(current?.load_change_percent ?? null), note: changeBand?.label ?? 'Nothing to compare', c: changeBand ? toneColor(changeBand.tone) : 'var(--tx3)' }, { k: 'Mean RPE', v: formatRpe(current?.mean_rpe ?? null), note: current ? ratingCoverage(current) : '', c: 'var(--tx)' }] as tile (tile.k)}
				<div style="{cardStyle} padding: 14px 16px;">
					<div style={captionStyle}>{tile.k}</div>
					<div
						style="font-size: 26px; font-weight: 700; color: {tile.c}; letter-spacing: -0.02em; margin-top: 2px;"
					>
						{tile.v}
					</div>
					<div style="font-size: 11px; color: var(--tx2); margin-top: 4px;">{tile.note}</div>
				</div>
			{/each}
		</div>

		<!-- Chart -->
		<div style="{cardStyle} padding: 16px;">
			<div
				style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px;"
			>
				<div style="font-size: 13px; font-weight: 700; color: var(--tx);">
					Weekly load and AL:CL
				</div>
				<div style="font-size: 11px; color: var(--tx3);">
					{weeks.length} weeks, Monday to Sunday in your own time
				</div>
			</div>
			<!-- Said here rather than in a chart legend: the bars take the colour of
			     the band they land in, so a single swatch could not stand for them. -->
			<div style="font-size: 11px; color: var(--tx2); margin-bottom: 6px;">
				Bars are the week's acute load, coloured by the band it falls in. The dashed line is the
				chronic load, the mean of the last three weeks. The panel below is the ratio of the two.
			</div>
			<TrainingLoadChart {weeks} />

			<!-- Band legend. Two rows, each naming the panel it keys: the bars are
			     coloured by the acute load bands and the ratio points by the AL:CL
			     bands, and the two scales share their tones, so one unlabelled row
			     of ranges would be read against whichever panel the eye lands on.
			     The bands are the coach's reference and are named as such, so the
			     chart never looks like it is pronouncing on the athlete. -->
			<div
				style="display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--bd2); margin-top: 8px;"
			>
				{#each [{ title: 'Bars, acute load', bands: ACUTE_LOAD_BANDS }, { title: 'Lower panel, AL:CL', bands: RATIO_BANDS }] as row (row.title)}
					<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px;">
						<span style="{captionStyle} min-width: 132px;">{row.title}</span>
						{#each row.bands as band (band.label)}
							<div style="display: flex; align-items: center; gap: 6px;">
								<span
									style="width: 10px; height: 10px; border-radius: 3px; background: {toneColor(
										band.tone
									)};"
								></span>
								<span style="font-size: 11px; color: var(--tx2);">{bandRangeLabel(band)}</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<!-- Guidance note. Wording is deliberate: these bands are the coaching
		     sheet's, not something Crimpy has validated. -->
		<div
			style="{cardStyle} padding: 12px 16px; display: flex; gap: 10px; align-items: flex-start; background: var(--panel2);"
		>
			<span style="flex-shrink: 0; margin-top: 1px;">
				<Icon name="alert" size={15} color="var(--tx3)" />
			</span>
			<div style="font-size: 11.5px; color: var(--tx2); line-height: 1.6;">
				<strong style="color: var(--tx);">Your reference bands, not a Crimpy verdict.</strong>
				These thresholds come from your coaching sheet and are a common formulation rather than anything
				Crimpy has measured against this athlete. Read them as guidance beside what you already know about
				them.
				{#if anyUnlabelled}
					<br />{UNLABELLED_RATIO_BAND_NOTE}
				{/if}
				{#if anyFailed}
					<br />A session marked ECHEC is reported on its own and stays out of the mean RPE: it
					names an outcome rather than a point on the 5 to 10 scale. Its minutes still count as
					training done.
				{/if}
			</div>
		</div>

		<!-- Week by week -->
		<div style="{cardStyle} padding: 16px; overflow-x: auto;">
			<div style="font-size: 13px; font-weight: 700; color: var(--tx); margin-bottom: 10px;">
				Week by week
			</div>
			<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
				<thead>
					<tr>
						{#each ['Week', 'Sessions', 'Total', 'Climb / strength', 'Mean RPE', 'AL', 'CL', 'AL:CL', 'Change'] as heading (heading)}
							<th
								style="{captionStyle} text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--bd); white-space: nowrap;"
								>{heading}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each [...weeks].reverse() as week (week.week_start)}
						{@const rowRatioBand = bandFor(RATIO_BANDS, week.acute_chronic_ratio)}
						{@const rowChangeBand = bandFor(LOAD_CHANGE_BANDS, week.load_change_percent)}
						{@const rowShare = climbingShare(week)}
						<tr>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); white-space: nowrap;"
							>
								<span style="color: var(--tx); font-weight: 600;">
									{formatWeekLabel(week.week_start)}
								</span>
								{#if week.week_number !== null}
									<span style="color: var(--tx3);"> W{week.week_number}</span>
								{/if}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); color: var(--tx2);"
							>
								{week.session_count}
								{#if week.failed_sessions > 0}
									<span
										style="margin-left: 5px; padding: 1px 6px; border-radius: 999px; background: var(--bd2); color: var(--tx2); font-size: 10px; font-weight: 700;"
										title="Marked ECHEC, kept out of the mean RPE"
										>ECHEC {week.failed_sessions}</span
									>
								{/if}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); color: var(--tx2);"
							>
								{formatMinutes(week.total_minutes)}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); color: var(--tx2); white-space: nowrap;"
							>
								{#if rowShare === null}
									{NO_VALUE}
								{:else}
									{Math.round(rowShare * 100)}% / {100 - Math.round(rowShare * 100)}%
								{/if}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); color: var(--tx2);"
							>
								{formatRpe(week.mean_rpe)}
								{#if week.session_count > 0 && week.rated_sessions < week.session_count}
									<span style="color: var(--tx3);">
										({week.rated_sessions}/{week.session_count})</span
									>
								{/if}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); color: var(--tx2);"
							>
								{formatLoad(week.acute_load)}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); color: var(--tx2);"
							>
								{formatLoad(week.chronic_load)}
								{#if week.chronic_load !== null && week.chronic_weeks < 3}
									<span style="color: var(--tx3);" title={chronicBaselineNote(week) ?? ''}>
										({week.chronic_weeks}w)
									</span>
								{/if}
							</td>
							<td
								style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2); white-space: nowrap;"
							>
								<span
									style="font-weight: 700; color: {rowRatioBand
										? toneColor(rowRatioBand.tone)
										: 'var(--tx3)'};"
									title={rowRatioBand?.label ?? missingRatioNote(week)}
								>
									{formatRatio(week.acute_chronic_ratio)}
								</span>
							</td>
							<td style="padding: 7px 10px 7px 0; border-bottom: 1px solid var(--bd2);">
								<span
									style="color: {rowChangeBand ? toneColor(rowChangeBand.tone) : 'var(--tx3)'};"
								>
									{formatPercent(week.load_change_percent)}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if baselineNote}
				<div style="font-size: 11px; color: var(--tx3); margin-top: 10px;">{baselineNote}</div>
			{/if}
		</div>
	{/if}
</div>
