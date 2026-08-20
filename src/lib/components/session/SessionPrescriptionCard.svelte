<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import type { Exercise, PrescriptionSnapshot, TrainingItem } from '$lib/api/client';
	import {
		assessmentLabel,
		collectAssessmentRelativeValues,
		formatResolvedValue,
		resolveAgainstFrozenResults
	} from '$lib/assessments';
	import ItemListView from '$lib/components/training/ItemListView.svelte';

	interface Props {
		prescription: PrescriptionSnapshot;
	}

	let { prescription }: Props = $props();

	let exercises = $state<Exercise[]>([]);

	function collectExerciseIds(items: TrainingItem[]): string[] {
		const ids: string[] = [];
		for (const item of items) {
			if (item.exercise_id) ids.push(item.exercise_id);
			ids.push(...collectExerciseIds(item.items ?? []));
		}
		return ids;
	}

	// The percentages the coach prescribed, read against the results frozen with
	// the session. Without this a load reads as "85% Max force", which is the one
	// prescribed number a coach cannot compare to the measured kilograms by eye.
	const relativeValues = $derived(collectAssessmentRelativeValues(prescription.items));

	const fieldLabels: Record<string, string> = {
		load: 'load',
		duration: 'hang time',
		reps: 'reps'
	};

	onMount(async () => {
		const ids = [...new Set(collectExerciseIds(prescription.items))];
		if (ids.length === 0) return;
		const fetched = await Promise.all(ids.map((id) => apiClient.getExercise(id).catch(() => null)));
		exercises = fetched.filter(Boolean) as Exercise[];
	});
</script>

<div
	style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		class="flex items-center justify-between gap-3"
		style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);"
	>
		<div style="min-width: 0;">
			<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">Prescribed</h3>
			<div class="truncate" style="font-size: 11.5px; color: var(--tx3); margin-top: 2px;">
				{prescription.title}
			</div>
		</div>
		{#if prescription.program_session_id}
			<span
				style="
					font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
					color: var(--pr); background: var(--pr-fog); flex-shrink: 0;
				">From the program</span
			>
		{/if}
	</div>

	{#if prescription.goal?.trim()}
		<div style="padding: 12px 18px; border-bottom: 1px solid var(--bd2);">
			<div
				style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
			>
				Goal
			</div>
			<p style="font-size: 12.5px; color: var(--tx2); line-height: 1.6; margin-top: 4px;">
				{prescription.goal}
			</p>
		</div>
	{/if}

	{#if prescription.coach_notes?.trim()}
		<div
			style="padding: 12px 18px; border-bottom: 1px solid var(--bd2); background: var(--panel2);"
		>
			<div
				style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
			>
				Coach notes for this session
			</div>
			<p
				style="font-size: 12.5px; color: var(--tx2); line-height: 1.6; margin-top: 4px; white-space: pre-wrap;"
			>
				{prescription.coach_notes}
			</p>
		</div>
	{/if}

	{#if relativeValues.length > 0}
		<div style="padding: 12px 18px; border-bottom: 1px solid var(--bd2);">
			<div
				style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
			>
				Asked for, in the athlete's numbers of the day
			</div>
			<div class="space-y-1" style="margin-top: 6px;">
				{#each relativeValues as relative (`${relative.field}:${relative.assessment_type}:${relative.percent}:${relative.fallback}`)}
					{@const resolved = resolveAgainstFrozenResults(
						relative,
						prescription.resolved_against.assessments
					)}
					{@const sameBothHands =
						resolved.right.value === resolved.left.value &&
						resolved.right.fromFallback === resolved.left.fromFallback}
					<div class="flex items-baseline justify-between gap-3" style="font-size: 12.5px;">
						<span style="color: var(--tx2); min-width: 0;">
							{relative.percent}% {assessmentLabel(relative.assessment_type)}
							<span style="color: var(--tx3);"
								>({fieldLabels[relative.field] ?? relative.field})</span
							>
						</span>
						<span style="font-weight: 700; color: var(--tx); flex-shrink: 0; text-align: right;">
							{#if sameBothHands}
								{formatResolvedValue(resolved.right.value, relative.field)}
								{#if resolved.right.fromFallback}
									<span style="font-size: 11px; color: var(--tx3); font-weight: 600;">fallback</span
									>
								{/if}
							{:else}
								{#each [{ hand: 'R', side: resolved.right }, { hand: 'L', side: resolved.left }] as entry (entry.hand)}
									<span style="margin-left: 8px;">
										<span style="font-size: 10.5px; color: var(--tx3); font-weight: 700;"
											>{entry.hand}</span
										>
										{formatResolvedValue(
											entry.side.value,
											relative.field
										)}{#if entry.side.fromFallback}<span
												style="font-size: 11px; color: var(--tx3); font-weight: 600;"
											>
												fallback</span
											>{/if}
									</span>
								{/each}
							{/if}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div style="padding: 14px 18px;">
		<ItemListView items={prescription.items} {exercises} />
	</div>
</div>
