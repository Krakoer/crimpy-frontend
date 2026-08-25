<script lang="ts">
	import type { PrescriptionSnapshot } from '$lib/api/client';
	import {
		assessmentLabel,
		buildAssessmentCatalog,
		collectAssessmentRelativeValues,
		formatResolvedValue,
		handLabel,
		resolveAgainstFrozenResults
	} from '$lib/assessments';
	import ItemListView from '$lib/components/training/ItemListView.svelte';

	interface Props {
		prescription: PrescriptionSnapshot;
	}

	let { prescription }: Props = $props();

	// The percentages the coach prescribed, read against the results frozen with
	// the session. Without this a load reads as "85% Max force", which is the one
	// prescribed number a coach cannot compare to the measured kilograms by eye.
	const relativeValues = $derived(collectAssessmentRelativeValues(prescription.items));

	// The assessments as they read when the session was played, frozen beside the
	// results. Reading the coach's current definitions instead would relabel and
	// re-resolve a past prescription every time one is edited.
	const catalog = $derived(buildAssessmentCatalog(prescription.resolved_against.definitions ?? []));

	const fieldLabels: Record<string, string> = {
		load: 'load',
		duration: 'hang time',
		reps: 'reps'
	};
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
				{#each relativeValues as relative (`${relative.field}:${relative.assessment_id}:${relative.percent}:${relative.fallback}`)}
					{@const resolved = resolveAgainstFrozenResults(
						relative,
						prescription.resolved_against.assessments,
						catalog
					)}
					<div class="flex items-baseline justify-between gap-3" style="font-size: 12.5px;">
						<span style="color: var(--tx2); min-width: 0;">
							{relative.percent}% {assessmentLabel(relative.assessment_id, catalog)}
							<span style="color: var(--tx3);"
								>({fieldLabels[relative.field] ?? relative.field})</span
							>
						</span>
						<span style="font-weight: 700; color: var(--tx); flex-shrink: 0; text-align: right;">
							{#each resolved as entry, i (entry.hand)}
								{@const hand = handLabel(entry.hand, resolved.length)}
								<span style="margin-left: {i === 0 ? 0 : 8}px;">
									{#if hand}<span style="font-size: 10.5px; color: var(--tx3); font-weight: 700;"
											>{hand}</span
										>{/if}
									{formatResolvedValue(entry.value, relative.field)}{#if entry.fromFallback}<span
											style="font-size: 11px; color: var(--tx3); font-weight: 600;"
										>
											fallback</span
										>{/if}
								</span>
							{/each}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div style="padding: 14px 18px;">
		<!-- Every item names its own exercise, so the tree needs no library here. -->
		<ItemListView items={prescription.items} exercises={[]} {catalog} showControls={false} />
	</div>
</div>
