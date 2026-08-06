<script lang="ts">
	import { ASSESSMENT_TYPES, assessmentTypesForField, type VariableField } from '$lib/assessments';

	interface Props {
		field: VariableField;
		assessmentType: number;
		fallback: number;
		fallbackUnit: string;
		label?: string;
		onchange?: () => void;
	}

	let {
		field,
		assessmentType = $bindable(),
		fallback = $bindable(),
		fallbackUnit,
		label = 'OF',
		onchange
	}: Props = $props();

	let types = $derived(assessmentTypesForField(field));

	const labelStyle =
		'font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;';
	const controlStyle =
		'padding: 5px 4px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 12px; color: var(--tx); outline: none; background: #fff;';
</script>

<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
	{#if label}<span style={labelStyle}>{label}</span>{/if}
	<select
		bind:value={assessmentType}
		{onchange}
		onclick={(e) => e.stopPropagation()}
		style={controlStyle}
	>
		{#each types as type (type)}
			<option value={type}>{ASSESSMENT_TYPES[type].label}</option>
		{/each}
	</select>
	<span style={labelStyle}>FALLBACK</span>
	<input
		type="number"
		min="0"
		step="0.5"
		bind:value={fallback}
		oninput={onchange}
		onclick={(e) => e.stopPropagation()}
		style="{controlStyle} width: 56px; text-align: center;"
	/>
	<span style="font-size: 11px; color: var(--tx3);">{fallbackUnit}</span>
</div>
