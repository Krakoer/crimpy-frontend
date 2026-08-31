<script lang="ts">
	import type { AssessmentResponse } from '$lib/api/client';
	import AssessmentHistoryTable from './AssessmentHistoryTable.svelte';
	import AssessmentResultCard from './AssessmentResultCard.svelte';
	import { firstGrip, groupRecordedAssessments, measuredAt } from './assessment-records';

	interface Props {
		records: AssessmentResponse[];
		// How many of the most recent results the table below the cards lists.
		historyLength?: number;
		// Set when the records could not be read. An athlete who has done no
		// assessment and an athlete whose results failed to load both arrive here
		// with an empty list, and they are not the same statement.
		failed?: boolean;
	}

	let { records, historyLength = 8, failed = false }: Props = $props();

	const recorded = $derived(groupRecordedAssessments(records));
	const history = $derived(
		[...records].sort((a, b) => measuredAt(b) - measuredAt(a)).slice(0, historyLength)
	);

	// Keyed by assessment id rather than by a discriminator, so a coach's own
	// assessment keeps its own grip and chart state.
	let selectedGrip = $state<Record<string, number>>({});
	let showChart = $state<Record<string, boolean>>({});

	$effect(() => {
		for (const assessment of recorded) {
			if (!assessment.hasGrips) continue;
			const grips = new Set(assessment.records.map((record) => record.grip_position ?? 0));
			if (!grips.has(selectedGrip[assessment.id])) {
				selectedGrip[assessment.id] = firstGrip(assessment);
			}
		}
	});

	function formatAssessmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}
</script>

{#if failed}
	<div
		style="
			background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
			padding: 40px 24px; text-align: center; color: var(--rd); font-size: 13px;
		"
	>
		The assessment results could not be loaded, so nothing here says what the athlete has measured.
	</div>
{:else if recorded.length === 0}
	<div
		style="
			background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
			padding: 40px 24px; text-align: center; color: var(--tx3); font-size: 13px;
		"
	>
		No assessment records yet. Write an assessment on a training, and the results land here once the
		athlete runs it in the Crimpy app.
	</div>
{:else}
	<div
		role="list"
		aria-label="Assessment results"
		style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px;"
	>
		{#each recorded as assessment (assessment.id)}
			<AssessmentResultCard
				{assessment}
				selectedGrip={selectedGrip[assessment.id] ?? 0}
				onSelectGrip={(grip) => (selectedGrip[assessment.id] = grip)}
				showChart={showChart[assessment.id] ?? false}
				onToggleChart={() => (showChart[assessment.id] = !(showChart[assessment.id] ?? false))}
			/>
		{/each}
	</div>

	<AssessmentHistoryTable records={history} formatDate={formatAssessmentDate} />
{/if}
