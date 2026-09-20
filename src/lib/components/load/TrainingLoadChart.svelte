<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { WeeklyTrainingLoad } from '$lib/api/client';
	import {
		ACUTE_LOAD_BANDS,
		RATIO_BANDS,
		bandFor,
		formatLoad,
		formatRatio,
		formatRpe,
		formatWeekLabel,
		type Band
	} from '$lib/training-load';

	let { weeks }: { weeks: WeeklyTrainingLoad[] } = $props();

	let container: HTMLDivElement;
	let chart: import('echarts').ECharts | null = null;
	let resizeObserver: ResizeObserver | null = null;

	// Echarts wants concrete colors, so the Alpine variables are read off the
	// document once rather than hardcoded here where they would drift. Same
	// approach as AssessmentChart.
	function palette() {
		const styles = getComputedStyle(document.documentElement);
		const value = (name: string, fallback: string) =>
			styles.getPropertyValue(name).trim() || fallback;
		return {
			font: value('--font', 'Figtree, system-ui, sans-serif'),
			panel: value('--panel', '#fff'),
			border: value('--bd', '#e8e0d6'),
			borderLight: value('--bd2', '#f0eadf'),
			text: value('--tx', '#2d241d'),
			textSoft: value('--tx2', '#7a6e62'),
			textFaint: value('--tx3', '#b0a496'),
			terracotta: value('--pr', '#c2714f'),
			sage: value('--gn', '#6b8f71'),
			gold: value('--gd', '#d4a15e')
		};
	}

	type Theme = ReturnType<typeof palette>;

	function bandColor(band: Band, theme: Theme): string {
		switch (band.tone) {
			case 'low':
				return theme.gold;
			case 'good':
				return theme.sage;
			case 'high':
				return theme.terracotta;
			case 'unlabelled':
				return theme.textSoft;
		}
	}

	// The band grounds have to sit well behind the line, which is why they are
	// drawn as a wash rather than as the flat colour the line itself carries.
	function wash(hex: string, alpha: number): string {
		const parsed = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
		if (!parsed) return hex;
		const int = parseInt(parsed[1], 16);
		return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
	}

	// One markArea per band, spanning the whole width of its grid. The top and
	// bottom bands are open ended in the reference sheet, so they are closed off
	// against the axis the chart is actually drawn to.
	// The AL:CL bands are thin enough that their names would sit on top of one
	// another, so only the load panel names them in place; the legend under the
	// chart names all four with their ranges either way.
	function bandAreas(
		bands: Band[],
		theme: Theme,
		axisMin: number,
		axisMax: number,
		showLabels: boolean
	) {
		return bands.map((band) => [
			{
				yAxis: band.from ?? axisMin,
				itemStyle: { color: wash(bandColor(band, theme), band.tone === 'unlabelled' ? 0.1 : 0.12) },
				label: {
					show: showLabels,
					// On the band's own upper edge, which is where the chronic line
					// also runs, so the name is set on a plate of the panel colour
					// rather than left to fight the line for the same pixels.
					position: 'insideTopRight' as const,
					color: theme.textFaint,
					fontFamily: theme.font,
					fontSize: 9,
					backgroundColor: theme.panel,
					padding: [2, 4, 2, 4],
					borderRadius: 3,
					formatter: band.label
				}
			},
			{ yAxis: band.to ?? axisMax }
		]);
	}

	// The axis has to leave the top band visible even when nothing reaches it,
	// which is what the floor is for, and has to clear the tallest bar, which is
	// what the headroom is for. Rounded up to a round hundred so the labels read.
	function niceMax(values: number[], floor: number, headroomPercent: number): number {
		const peak = values.length === 0 ? 0 : Math.max(...values);
		const withHeadroom = (peak * headroomPercent) / 100;
		return Math.max(floor, Math.ceil(withHeadroom / 100) * 100);
	}

	function buildOptions(data: WeeklyTrainingLoad[]) {
		const theme = palette();
		const labels = data.map((week) => formatWeekLabel(week.week_start));

		const acute = data.map((week) => week.acute_load);
		const chronic = data.map((week) => week.chronic_load);
		const ratios = data.map((week) => week.acute_chronic_ratio);

		const loadMax = niceMax(
			[...acute, ...chronic].filter((v): v is number => v !== null),
			4600,
			115
		);
		const ratioPeak = Math.max(1.7, ...ratios.filter((v): v is number => v !== null));
		const ratioMax = Math.ceil((ratioPeak + 0.2) * 10) / 10;

		const baseText = { fontFamily: theme.font, fontSize: 11 };
		const axisLabel = { ...baseText, fontSize: 10, color: theme.textFaint };

		return {
			textStyle: baseText,
			animation: false,
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'shadow' },
				backgroundColor: theme.panel,
				borderColor: theme.border,
				borderWidth: 1,
				textStyle: { ...baseText, color: theme.text },
				formatter: (params: Array<{ dataIndex: number }>) => {
					const week = data[params[0]?.dataIndex ?? 0];
					if (!week) return '';
					const ratioBand = bandFor(RATIO_BANDS, week.acute_chronic_ratio);
					const rows = [
						`Week of ${formatWeekLabel(week.week_start)}${week.week_number === null ? '' : `, week ${week.week_number}${week.program_name === null ? '' : ` of ${week.program_name}`}`}`,
						`Sessions ${week.session_count}, ${week.total_minutes} min`,
						`Mean RPE ${formatRpe(week.mean_rpe)} over ${week.rated_sessions} rated`,
						`Acute ${formatLoad(week.acute_load)}, chronic ${formatLoad(week.chronic_load)}`,
						`AL:CL ${formatRatio(week.acute_chronic_ratio)}${ratioBand ? ` (${ratioBand.label})` : ''}`
					];
					if (week.failed_sessions > 0) {
						rows.push(`${week.failed_sessions} ECHEC, outside the mean`);
					}
					return `<div style="font-family:${theme.font};font-size:11px;line-height:1.6;">${rows.join('<br/>')}</div>`;
				}
			},
			grid: [
				{ left: 52, right: 16, top: 16, height: 178 },
				{ left: 52, right: 16, top: 236, height: 118 }
			],
			xAxis: [
				{
					type: 'category',
					gridIndex: 0,
					data: labels,
					axisLabel: { ...axisLabel, show: false },
					axisLine: { lineStyle: { color: theme.border } },
					axisTick: { show: false }
				},
				{
					type: 'category',
					gridIndex: 1,
					data: labels,
					axisLabel,
					axisLine: { lineStyle: { color: theme.border } },
					axisTick: { show: false }
				}
			],
			yAxis: [
				{
					type: 'value',
					gridIndex: 0,
					min: 0,
					max: loadMax,
					name: 'load',
					nameTextStyle: { ...baseText, fontSize: 10, color: theme.textFaint },
					axisLabel,
					axisLine: { show: false },
					splitLine: { lineStyle: { color: theme.borderLight } }
				},
				{
					type: 'value',
					gridIndex: 1,
					min: 0,
					max: ratioMax,
					name: 'AL:CL',
					nameTextStyle: { ...baseText, fontSize: 10, color: theme.textFaint },
					axisLabel,
					axisLine: { show: false },
					splitLine: { lineStyle: { color: theme.borderLight } }
				}
			],
			series: [
				{
					name: 'Acute load',
					type: 'bar',
					xAxisIndex: 0,
					yAxisIndex: 0,
					data: acute.map((value, index) => ({
						value,
						itemStyle: {
							color: (() => {
								const band = bandFor(ACUTE_LOAD_BANDS, data[index]?.acute_load ?? null);
								return band ? bandColor(band, theme) : theme.textFaint;
							})()
						}
					})),
					barMaxWidth: 26,
					itemStyle: { borderRadius: [3, 3, 0, 0] },
					markArea: {
						silent: true,
						data: bandAreas(ACUTE_LOAD_BANDS, theme, 0, loadMax, true)
					}
				},
				{
					name: 'Chronic load',
					type: 'line',
					xAxisIndex: 0,
					yAxisIndex: 0,
					data: chronic,
					smooth: false,
					connectNulls: false,
					symbol: 'circle',
					symbolSize: 5,
					lineStyle: { color: theme.text, width: 2, type: 'dashed' },
					itemStyle: { color: theme.text },
					z: 5
				},
				{
					name: 'AL:CL',
					type: 'line',
					xAxisIndex: 1,
					yAxisIndex: 1,
					data: ratios.map((value, index) => ({
						value,
						itemStyle: {
							color: (() => {
								const band = bandFor(RATIO_BANDS, data[index]?.acute_chronic_ratio ?? null);
								return band ? bandColor(band, theme) : theme.textFaint;
							})()
						}
					})),
					smooth: false,
					connectNulls: false,
					symbol: 'circle',
					symbolSize: 6,
					lineStyle: { color: theme.textSoft, width: 2 },
					markArea: {
						silent: true,
						data: bandAreas(RATIO_BANDS, theme, 0, ratioMax, false)
					},
					z: 5
				}
			]
		};
	}

	onMount(async () => {
		const echarts = await import('echarts');
		chart = echarts.init(container, null, { renderer: 'svg' });
		chart.setOption(buildOptions(weeks));

		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(container);
	});

	$effect(() => {
		if (chart) {
			chart.setOption(buildOptions(weeks), { notMerge: true });
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
	});
</script>

<div bind:this={container} style="width: 100%; height: 382px;"></div>
