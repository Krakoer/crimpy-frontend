<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { AssessmentResponse } from '$lib/api/client';
	import { measuredAt, singleValue } from '$lib/components/assessment/assessment-records';
	import { valueAxisRange, type SeriesTokens } from '$lib/components/assessment/chart-axes';
	import {
		drawsRatios,
		formatRatio,
		formatRatioBasis,
		readRecordRatio
	} from '$lib/components/assessment/bodyweight-ratio';

	let {
		tokens,
		history,
		unit,
		rawUnit,
		formatValue,
		perHand = true,
		bodyweightRelative = false
	}: {
		// The hue the lines are drawn in and the text form naming them: one per
		// metric, the hands told apart by line style. See seriesTokens.
		tokens: SeriesTokens;
		history: AssessmentResponse[];
		unit: string;
		// The unit as assessment_definitions.unit holds it, which sets the
		// narrowest span the value axis may zoom to.
		rawUnit: string;
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
			// Every use of this is real type: axis labels at 10px, the slider
			// labels at 9px and the tooltip's ratio-basis line. --tx3 is 2.44:1
			// on the white card these charts sit on, so the faint voice here is
			// the readable form. The palette is read off the document at runtime,
			// which is a route no source scan can follow, so this pairing is
			// named in palette-contrast.test.ts instead. See Krakoer/crimpy#137.
			textFaint: value('--tx3-sm', '#787066'),
			// One hue for the metric; the hands are told apart by line style. The
			// tooltip writes the series names at 11px bold on a --panel ground, where
			// an accent can sit under the text floor, so the line and the marker take
			// the hue and the words its text form. See Krakoer/crimpy#128 and #164.
			series: value(tokens.line, '#2d241d'),
			seriesText: value(tokens.text, '#2d241d')
		};
	}

	// The slider's window, a wash of the series hue rather than a hardcoded one,
	// so it cannot keep a colour the lines no longer use.
	function translucent(hex: string, alpha: number): string {
		const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
		if (!match) return hex;
		const [r, g, b] = match.slice(1).map((pair) => parseInt(pair, 16));
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

	function buildOptions(data: AssessmentResponse[]) {
		const theme = palette();
		ratioBasis = new Map();
		const asRatios = drawsRatios(data, bodyweightRelative);
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

		// The left hand solid and the right dashed, both in the metric's hue. A
		// single value assessment draws its one line solid.
		const line = (name: string, dashed: boolean, values: number[][]) => ({
			name,
			type: 'line',
			data: values,
			smooth: false,
			symbol: 'circle',
			symbolSize: 5,
			lineStyle: { color: theme.series, width: 2, type: dashed ? 'dashed' : 'solid' },
			itemStyle: { color: theme.series }
		});

		const series = perHand
			? [
					line(
						'Left',
						false,
						points('Left', (a) => a.left_value)
					),
					line(
						'Right',
						true,
						points('Right', (a) => a.right_value)
					)
				]
			: [
					line(
						'Result',
						false,
						points('Result', (a) => singleValue(a))
					)
				];

		// Never zoomed under the unit's minimum span, and starting from a round
		// number under the lowest result rather than from zero or from the result.
		const range = valueAxisRange(
			series.flatMap((s) => s.data.map((point) => point[1])),
			rawUnit,
			asRatios
		);

		const baseText = { fontFamily: theme.font, fontSize: 11 };
		const axisName = asRatios ? 'ratio' : unit;
		// The labels the cross pointer writes on each axis, in the chart's own
		// voice rather than echarts' default dark blue, and through the axes'
		// formatters so they carry no more precision than the chart does.
		const pointerLabel = {
			...baseText,
			fontSize: 10,
			color: theme.text,
			backgroundColor: theme.panel,
			borderColor: theme.border,
			borderWidth: 1
		};

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
						const color = theme.seriesText;
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
				// The first test to the last, not a season padded around them.
				min: 'dataMin',
				max: 'dataMax',
				splitNumber: 4,
				axisLabel: { ...baseText, fontSize: 10, color: theme.textFaint, formatter: shortDate },
				axisPointer: {
					label: { ...pointerLabel, formatter: ({ value }: { value: number }) => shortDate(value) }
				},
				axisLine: { lineStyle: { color: theme.border } },
				splitLine: { show: false }
			},
			yAxis: {
				type: 'value',
				name: axisName,
				min: range?.min,
				max: range?.max,
				interval: range?.interval,
				nameTextStyle: { ...baseText, fontSize: 10, color: theme.textFaint },
				axisLabel: {
					...baseText,
					fontSize: 10,
					color: theme.textFaint,
					formatter: (val: number) => (asRatios ? formatRatio(val) : formatValue(val))
				},
				axisPointer: {
					label: {
						...pointerLabel,
						formatter: ({ value }: { value: number }) =>
							asRatios ? formatRatio(value) : formatValue(value)
					}
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
					fillerColor: translucent(theme.series, 0.08),
					handleStyle: { color: theme.series },
					moveHandleStyle: { color: translucent(theme.series, 0.3) },
					dataBackground: {
						lineStyle: { color: theme.border },
						areaStyle: { color: theme.borderLight }
					},
					selectedDataBackground: {
						lineStyle: { color: theme.series },
						areaStyle: { color: translucent(theme.series, 0.12) }
					},
					emphasis: {
						handleStyle: { color: theme.series },
						moveHandleStyle: { color: theme.series }
					},
					textStyle: { ...baseText, fontSize: 9, color: theme.textFaint },
					labelFormatter: (_: number, val: string) => shortDate(val)
				}
			],
			series
		};
	}

	onMount(async () => {
		const echarts = await import('echarts');
		// The component can be gone by the time the chunk lands, and Svelte sets a
		// bind:this back to null on destroy, so init would be handed nothing.
		if (!container) return;
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
