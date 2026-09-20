<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { AssessmentResponse } from '$lib/api/client';
	import { measuredAt, singleValue } from '$lib/components/assessment/assessment-records';
	import {
		formatRatio,
		formatRatioBasis,
		readRecordRatio
	} from '$lib/components/assessment/bodyweight-ratio';

	let {
		history,
		unit,
		formatValue,
		perHand = true,
		bodyweightRelative = false
	}: {
		history: AssessmentResponse[];
		unit: string;
		formatValue: (v: number) => string;
		// An assessment measured on one hand at a time draws a line per hand. One
		// measured as a single number draws one line, and calling it "right" would
		// be a lie the legend then repeats.
		perHand?: boolean;
		// Whether the line is the ratio to the bodyweight each result was pulled
		// at rather than the load itself. A season in which the athlete lost three
		// kilos moves the two lines in opposite directions, so a chart drawn in
		// kilograms under a card reading ratios tells a different story about the
		// same records.
		bodyweightRelative?: boolean;
	} = $props();

	let container: HTMLDivElement;
	let chart = $state<import('echarts').ECharts | null>(null);
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

	// The load a ratio was built from, keyed by the line it belongs to and the
	// point it was drawn at, so the tooltip can show what produced the number
	// without a second pass over the history. A ratio nobody can check against a
	// weight and a day is a number the coach has to take on trust, and the two
	// hands of one session are two different loads at the same instant, so the
	// timestamp alone does not name one of them.
	let ratioBasis = new Map<string, string>();

	function basisKey(seriesName: string, at: number): string {
		return `${seriesName}:${at}`;
	}

	// Whether the lines are ratios. An assessment that reads as one still draws
	// kilograms while nothing in the history has a denominator to divide by:
	// filtering every point out would leave an empty grid where the page used to
	// show the loads, which says less than the raw numbers did.
	function drawsRatios(data: AssessmentResponse[]): boolean {
		if (!bodyweightRelative) return false;
		return data.some(
			(a) =>
				readRecordRatio(a, a.right_value)?.ratio !== undefined ||
				readRecordRatio(a, a.left_value)?.ratio !== undefined
		);
	}

	function buildOptions(data: AssessmentResponse[]) {
		const theme = palette();
		ratioBasis = new Map();
		const asRatios = drawsRatios(data);
		// A record whose ratio had to be declined leaves a gap rather than a point
		// drawn in kilograms among ratios, which would read as a collapse.
		const points = (
			seriesName: string,
			pick: (a: AssessmentResponse) => number | null | undefined
		) =>
			data
				.map((a) => {
					const at = measuredAt(a);
					if (!asRatios) return [at, pick(a)] as const;
					const reading = readRecordRatio(a, pick(a));
					if (reading?.ratio !== undefined) {
						ratioBasis.set(basisKey(seriesName, at), formatRatioBasis(reading));
					}
					return [at, reading?.ratio] as const;
				})
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
						points('Left', (a) => a.left_value)
					),
					line(
						'Right',
						theme.right,
						points('Right', (a) => a.right_value)
					)
				]
			: [
					line(
						'Result',
						theme.right,
						points('Result', (a) => singleValue(a))
					)
				];

		const baseText = { fontFamily: theme.font, fontSize: 11 };
		const axisName = asRatios ? 'ratio' : unit;

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
						const reading = asRatios
							? `${formatRatio(p.value[1])} <span style="color:${theme.textFaint};">${ratioBasis.get(basisKey(p.seriesName, p.value[0])) ?? ''}</span>`
							: `${formatValue(p.value[1])} ${unit}`;
						return `<span style="color:${color};font-weight:700;">${p.seriesName}</span> ${reading}`;
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
				name: axisName,
				// A ratio has no meaningful zero: a weighted hang is always above 1,
				// and an axis starting at 0 leaves a season of training as a flat line
				// across the top fifth of the plot. Kilograms keep the zero, where the
				// distance from it is the result.
				scale: asRatios,
				nameTextStyle: { ...baseText, fontSize: 10, color: theme.textFaint },
				axisLabel: {
					...baseText,
					fontSize: 10,
					color: theme.textFaint,
					formatter: (val: number) => (asRatios ? formatRatio(val) : formatValue(val))
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
		// The options are not set here: assigning the instance re-runs the effect
		// below, which is the one place the chart is drawn from.
		chart = echarts.init(container, null, { renderer: 'svg' });

		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(container);
	});

	// The options are built before the instance is checked, so the props they read
	// are dependencies of this effect on its very first run. Guarding first would
	// register nothing at all: the instance is assigned after an await inside
	// onMount, so it is still null the first time through, and the chart would
	// then keep drawing whatever it was given at mount.
	$effect(() => {
		const options = buildOptions(history);
		chart?.setOption(options, { notMerge: true });
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
	});
</script>

<div bind:this={container} style="width: 100%; height: 220px;"></div>
