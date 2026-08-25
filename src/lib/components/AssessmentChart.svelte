<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { AssessmentResponse } from '$lib/api/client';
	import { measuredAt, singleValue } from '$lib/components/assessment/assessment-records';

	let {
		history,
		unit,
		formatValue,
		perHand = true
	}: {
		history: AssessmentResponse[];
		unit: string;
		formatValue: (v: number) => string;
		// An assessment measured on one hand at a time draws a line per hand. One
		// measured as a single number draws one line, and calling it "right" would
		// be a lie the legend then repeats.
		perHand?: boolean;
	} = $props();

	let container: HTMLDivElement;
	let chart: import('echarts').ECharts | null = null;
	let resizeObserver: ResizeObserver | null = null;

	// Echarts wants concrete colors, so the Alpine variables are read off the
	// document once rather than hardcoded here where they would drift.
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
			left: value('--gn', '#6b8f71'),
			right: value('--pr', '#c2714f')
		};
	}

	function shortDate(value: number | string): string {
		return new Date(Number(value)).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short'
		});
	}

	function buildOptions(data: AssessmentResponse[]) {
		const theme = palette();
		const points = (pick: (a: AssessmentResponse) => number | null | undefined) =>
			data
				.map((a) => [measuredAt(a), pick(a)] as const)
				.filter(
					(point): point is readonly [number, number] => point[1] !== null && point[1] !== undefined
				)
				.map((point) => [point[0], point[1]]);

		const line = (name: string, color: string, values: number[][]) => ({
			name,
			type: 'line',
			data: values,
			smooth: false,
			symbol: 'circle',
			symbolSize: 5,
			lineStyle: { color, width: 2 },
			itemStyle: { color }
		});

		const series = perHand
			? [
					line(
						'Left',
						theme.left,
						points((a) => a.left_value)
					),
					line(
						'Right',
						theme.right,
						points((a) => a.right_value)
					)
				]
			: [
					line(
						'Result',
						theme.right,
						points((a) => singleValue(a))
					)
				];

		const baseText = { fontFamily: theme.font, fontSize: 11 };

		return {
			textStyle: baseText,
			tooltip: {
				trigger: 'axis',
				backgroundColor: theme.panel,
				borderColor: theme.border,
				borderWidth: 1,
				textStyle: { ...baseText, color: theme.text },
				formatter: (
					params: Array<{ axisValue: string | number; seriesName: string; value: [number, number] }>
				) => {
					const date = new Date(params[0].axisValue).toLocaleDateString('en-GB', {
						day: 'numeric',
						month: 'short',
						year: 'numeric'
					});
					const lines = params.map((p) => {
						const color = p.seriesName === 'Left' ? theme.left : theme.right;
						return `<span style="color:${color};font-weight:700;">${p.seriesName}</span> ${formatValue(p.value[1])} ${unit}`;
					});
					return `<div style="font-family:${theme.font};font-size:11px;">${date}<br/>${lines.join('<br/>')}</div>`;
				},
				axisPointer: { type: 'cross', lineStyle: { color: theme.border, type: 'dashed' } }
			},
			legend: {
				show: perHand,
				data: series.map((s) => s.name),
				right: 0,
				top: 0,
				itemWidth: 16,
				itemHeight: 2,
				textStyle: { ...baseText, color: theme.textSoft }
			},
			grid: { left: 48, right: 16, top: perHand ? 28 : 12, bottom: 48 },
			xAxis: {
				type: 'time',
				axisLabel: { ...baseText, fontSize: 10, color: theme.textFaint, formatter: shortDate },
				axisLine: { lineStyle: { color: theme.border } },
				splitLine: { show: false }
			},
			yAxis: {
				type: 'value',
				name: unit,
				nameTextStyle: { ...baseText, fontSize: 10, color: theme.textFaint },
				axisLabel: {
					...baseText,
					fontSize: 10,
					color: theme.textFaint,
					formatter: (val: number) => formatValue(val)
				},
				axisLine: { show: false },
				splitLine: { lineStyle: { color: theme.borderLight } }
			},
			dataZoom: [
				{ type: 'inside', xAxisIndex: 0, filterMode: 'none' },
				{
					type: 'slider',
					xAxisIndex: 0,
					height: 18,
					bottom: 4,
					borderColor: theme.border,
					fillerColor: 'rgba(194, 113, 79, 0.08)',
					handleStyle: { color: theme.right },
					textStyle: { ...baseText, fontSize: 9, color: theme.textFaint },
					labelFormatter: (_: number, val: string) => shortDate(val)
				}
			],
			series
		};
	}

	onMount(async () => {
		const echarts = await import('echarts');
		chart = echarts.init(container, null, { renderer: 'svg' });
		chart.setOption(buildOptions(history));

		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(container);
	});

	$effect(() => {
		if (chart) {
			chart.setOption(buildOptions(history), { notMerge: true });
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
	});
</script>

<div bind:this={container} style="width: 100%; height: 220px;"></div>
