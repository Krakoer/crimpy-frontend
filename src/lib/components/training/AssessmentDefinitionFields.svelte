<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { AssessmentUnit } from '$lib/assessments';
	import type { AssessmentDraft } from './assessment-draft';

	interface Props {
		draft: AssessmentDraft;
		// Frozen once results have been measured against the unit, or a training
		// reads a number against it: the first would restate the history, the
		// second would leave a prescription quietly using its fallback.
		measured?: boolean;
	}

	let { draft = $bindable(), measured = false }: Props = $props();

	const UNITS: { value: AssessmentUnit; label: string; hint: string }[] = [
		{ value: 'repetitions', label: 'Reps', hint: 'a count, as in a pyramid to failure' },
		{ value: 'seconds', label: 'Seconds', hint: 'a hold or a hang to failure' },
		{ value: 'kilograms', label: 'Kilograms', hint: 'a force, as on a sensor' }
	];

	const labelStyle =
		'font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;';
	const inputStyle =
		'padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: #fff; width: 100%;';
</script>

<div
	style="border: 1px solid var(--bd); border-radius: var(--r); padding: 12px 14px; background: var(--panel2);"
>
	<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
		<input type="checkbox" bind:checked={draft.enabled} disabled={measured} />
		<span style="display: flex; align-items: center; gap: 6px;">
			<Icon name="spark" size={14} color="var(--pl)" />
			<span style="font-size: 13px; font-weight: 600; color: var(--tx);"
				>This training is an assessment</span
			>
		</span>
	</label>
	<p style="margin: 6px 0 0 26px; font-size: 12px; color: var(--tx2);">
		It ends on a question, and the answer is a result you can prescribe against.
	</p>

	{#if draft.enabled}
		<div style="margin-top: 12px; display: flex; flex-direction: column; gap: 10px;">
			<div>
				<span style={labelStyle}>QUESTION</span>
				<input
					type="text"
					bind:value={draft.prompt}
					placeholder="How many pull ups did you do?"
					maxlength="200"
					style="{inputStyle} margin-top: 4px;"
				/>
			</div>

			<div>
				<span style={labelStyle}>MEASURED IN</span>
				<div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
					{#each UNITS as unit (unit.value)}
						<button
							type="button"
							title={unit.hint}
							disabled={measured}
							onclick={() => (draft.unit = unit.value)}
							style="padding: 6px 12px; border-radius: 999px; font-family: var(--font); font-size: 12px; font-weight: 600; cursor: {measured
								? 'not-allowed'
								: 'pointer'}; border: 1px solid {draft.unit === unit.value
								? 'var(--pl)'
								: 'var(--bd)'}; background: {draft.unit === unit.value
								? 'var(--pl-lt)'
								: '#fff'}; color: {draft.unit === unit.value ? 'var(--pl)' : 'var(--tx2)'};"
						>
							{unit.label}
						</button>
					{/each}
				</div>
			</div>

			<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
				<input type="checkbox" bind:checked={draft.perHand} disabled={measured} />
				<span style="font-size: 13px; color: var(--tx);">Measured on each hand separately</span>
			</label>

			{#if measured}
				<p style="margin: 0; font-size: 12px; color: var(--tx2);">
					This assessment is already in use, so the unit and the hands are fixed. The name and the
					question can still be changed.
				</p>
			{/if}
		</div>
	{/if}
</div>
