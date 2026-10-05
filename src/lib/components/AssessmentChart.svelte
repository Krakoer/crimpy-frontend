<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { AssessmentResponse } from '$lib/api/client';
	import { measuredAt, singleValue } from '$lib/components/assessment/assessment-records';
	import {
		dateLabelInterval,
		dayAt,
		dayOffset,
		valueAxisRange,
		type SeriesTokens
	} from '$lib/components/assessment/chart-axes';
	import {
		drawsRatios,
		formatRatio,
		plottedRecords,
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
	// One point of a line: its day and value, and for a ratio the load and the
	// weigh-in it was built from.
	interface ChartPoint {
		value: [number, number];
		basis?: string;
		// A pull kept from a training, drawn hollow and named in the tooltip so it
		// does not read as a test.
		kept?: boolean;
		symbol?: string;
		symbolSize?: number;
	}

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

	function shortDate(date: Date): string {
		return date.toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short'
		});
	}

	function buildOptions(data: AssessmentResponse[]) {
		const theme = palette();
		const asRatios = drawsRatios(data, bodyweightRelative);
		// The x axis counts whole days from the first plotted day to the last, the
		// way the app's does, so its labels fall on both and a clock change cannot
		// move one onto the wrong date. Only the records the chart puts a point
		// for count: in ratio mode one with no ratio is a gap, and spanning it
		// would pad the axis with days that hold nothing. Two tests on one day
		// share that day's place.
		const plotted = plottedRecords(data, bodyweightRelative).map(measuredAt);
		const first = plotted.length === 0 ? 0 : Math.min(...plotted);
		const spanDays = plotted.length === 0 ? 0 : dayOffset(first, Math.max(...plotted));
		const interval = dateLabelInterval(spanDays);
		// The labelled days, pinned rather than stepped by the interval: once the
		// chart is zoomed, echarts would start stepping from the window edge and
		// land labels between days.
		const labelledDays = Array.from(
			{ length: Math.floor(spanDays / interval) + 1 },
			(_, index) => index * interval
		);
		const dateOf = (offset: number) => shortDate(dayAt(first, offset));
		// A record whose ratio had to be declined leaves a gap rather than a point
		// drawn in kilograms among ratios, which would read as a collapse.
		//
		// Each point carries the load its ratio was built from, so the tooltip can
		// show what produced the number. A ratio nobody can check against a weight
		// and a day is a number the coach has to take on trust. It rides on the
		// point rather than in a lookup by position: two hands of one session, and
		// two sessions on one day, share a position and not a load.
		const origin = (a: AssessmentResponse): Partial<ChartPoint> =>
			a.origin === 'training' ? { kept: true, symbol: 'emptyCircle', symbolSize: 8 } : {};
		const points = (pick: (a: AssessmentResponse) => number | null | undefined): ChartPoint[] =>
			data.flatMap((a) => {
				const at = dayOffset(first, measuredAt(a));
				if (!asRatios) {
					const value = pick(a);
					return value === null || value === undefined
						? []
						: [{ value: [at, value], ...origin(a) }];
				}
				const reading = readRecordRatio(a, pick(a));
				if (reading?.ratio === undefined) return [];
				return [{ value: [at, reading.ratio], basis: formatRatioBasis(reading), ...origin(a) }];
			});

		// The left hand solid and the right dashed, both in the metric's hue. A
		// single value assessment draws its one line solid.
		const line = (name: string, dashed: boolean, values: ChartPoint[]) => ({
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
						points((a) => a.left_value)
					),
					line(
						'Right',
						true,
						points((a) => a.right_value)
					)
				]
			: [
					line(
						'Result',
						false,
						points((a) => singleValue(a))
					)
				];

		// Never zoomed under the unit's minimum span, and starting from a round
		// number under the lowest result rather than from zero or from the result.
		const range = valueAxisRange(
			series.flatMap((s) => s.data.map((point) => point.value[1])),
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
					params: Array<{
						axisValue: string | number;
						seriesName: string;
						value: [number, number];
						data: ChartPoint;
					}>
				) => {
					const date = dayAt(first, Number(params[0].axisValue)).toLocaleDateString('en-GB', {
						day: 'numeric',
						month: 'short',
						year: 'numeric'
					});
					const lines = params.map((p) => {
						const color = theme.seriesText;
						const reading = asRatios
							? `${formatRatio(p.value[1])} <span style="color:${theme.textFaint};">${p.data.basis ?? ''}</span>`
							: `${formatValue(p.value[1])} ${unit}`;
						const kept = p.data.kept
							? ` <span style="color:${theme.text};">from a training</span>`
							: '';
						return `<span style="color:${color};font-weight:700;">${p.seriesName}</span> ${reading}${kept}`;
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
				type: 'value',
				// The first test to the last, not a season padded around them, labelled
				// on both of those days.
				min: 0,
				max: spanDays,
				interval,
				axisLabel: {
					...baseText,
					fontSize: 10,
					color: theme.textFaint,
					formatter: dateOf,
					customValues: labelledDays
				},
				axisTick: { customValues: labelledDays },
				axisPointer: {
					label: { ...pointerLabel, formatter: ({ value }: { value: number }) => dateOf(value) }
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
				axisTick: { show: false },
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
					labelFormatter: (value: number) => dateOf(value)
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
