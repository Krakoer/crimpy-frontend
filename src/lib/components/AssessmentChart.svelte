<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { AssessmentResponse } from '$lib/api/client';

	let {
		history,
		unit,
		formatValue
	}: {
		history: AssessmentResponse[];
		unit: string;
		formatValue: (v: number) => string;
	} = $props();

	let container: HTMLDivElement;
	let chart: import('echarts').ECharts | null = null;
	let resizeObserver: ResizeObserver | null = null;

	function buildOptions(data: AssessmentResponse[]) {
		const leftData = data
			.filter((a) => a.LeftValue !== null)
			.map((a) => [new Date(a.UpdatedAt).getTime(), a.LeftValue as number]);
		const rightData = data
			.filter((a) => a.RightValue !== null)
			.map((a) => [new Date(a.UpdatedAt).getTime(), a.RightValue as number]);

		return {
			textStyle: { fontFamily: 'monospace', fontSize: 11 },
			tooltip: {
				trigger: 'axis',
				backgroundColor: '#fff',
				borderColor: '#e5e7eb',
				borderWidth: 1,
				textStyle: { fontFamily: 'monospace', fontSize: 11, color: '#333' },
				formatter: (params: any[]) => {
					const date = new Date(params[0].axisValue).toLocaleDateString('en-GB', {
						day: 'numeric',
						month: 'short',
						year: 'numeric'
					});
					const lines = params.map((p: any) => {
						const color = p.seriesName === 'Left' ? '#5A8C5A' : '#C6613F';
						const val = formatValue(p.value[1]);
						return `<span style="color:${color};font-weight:700;">${p.seriesName}</span> ${val} ${unit}`;
					});
					return `<div style="font-family:monospace;font-size:11px;">${date}<br/>${lines.join('<br/>')}</div>`;
				},
				axisPointer: { type: 'cross', lineStyle: { color: '#ccc', type: 'dashed' } }
			},
			legend: {
				data: ['Left', 'Right'],
				right: 0,
				top: 0,
				itemWidth: 16,
				itemHeight: 2,
				textStyle: { fontFamily: 'monospace', fontSize: 11, color: '#555' }
			},
			grid: { left: 48, right: 16, top: 28, bottom: 48 },
			xAxis: {
				type: 'time',
				axisLabel: {
					fontFamily: 'monospace',
					fontSize: 10,
					color: '#999',
					formatter: (val: number) =>
						new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
				},
				axisLine: { lineStyle: { color: '#e5e7eb' } },
				splitLine: { show: false }
			},
			yAxis: {
				type: 'value',
				name: unit,
				nameTextStyle: { fontFamily: 'monospace', fontSize: 10, color: '#999' },
				axisLabel: {
					fontFamily: 'monospace',
					fontSize: 10,
					color: '#999',
					formatter: (val: number) => formatValue(val)
				},
				axisLine: { show: false },
				splitLine: { lineStyle: { color: '#f0f0f0' } }
			},
			dataZoom: [
				{ type: 'inside', xAxisIndex: 0, filterMode: 'none' },
				{
					type: 'slider',
					xAxisIndex: 0,
					height: 18,
					bottom: 4,
					borderColor: '#e5e7eb',
					fillerColor: 'rgba(198,97,63,0.08)',
					handleStyle: { color: '#C6613F' },
					textStyle: { fontFamily: 'monospace', fontSize: 9, color: '#aaa' },
					labelFormatter: (_: number, val: string) => {
						const d = new Date(Number(val));
						return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
					}
				}
			],
			series: [
				{
					name: 'Left',
					type: 'line',
					data: leftData,
					smooth: false,
					symbol: 'circle',
					symbolSize: 5,
					lineStyle: { color: '#5A8C5A', width: 2 },
					itemStyle: { color: '#5A8C5A' }
				},
				{
					name: 'Right',
					type: 'line',
					data: rightData,
					smooth: false,
					symbol: 'circle',
					symbolSize: 5,
					lineStyle: { color: '#C6613F', width: 2 },
					itemStyle: { color: '#C6613F' }
				}
			]
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
