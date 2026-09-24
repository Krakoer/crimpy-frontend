<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import type {
		AssessmentResponse,
		RepData,
		SessionAssessment,
		SessionDetail,
		SessionItemResult,
		SessionResponse
	} from '$lib/api/client';
	import { unitLabel } from '$lib/assessments';
	import Icon from '$lib/components/Icon.svelte';
	import LatestValue from '$lib/components/assessment/LatestValue.svelte';
	import {
		denominatorNoteColor,
		formatDenominatorNote,
		readingLabel,
		readRecordDenominator,
		readRecordRatio
	} from '$lib/components/assessment/bodyweight-ratio';
	import SessionRepsCard from '$lib/components/session/SessionRepsCard.svelte';
	import SessionPrescriptionCard from '$lib/components/session/SessionPrescriptionCard.svelte';
	import SessionFeedbackCard from '$lib/components/session/SessionFeedbackCard.svelte';
	import { sessionRpe, sessionRpeColor, sessionRpeTint } from '$lib/rpe';
	import {
		formatDuration,
		formatSessionDate,
		formatSessionDateShort,
		formatSessionTime,
		gripLabel,
		sessionActivityInfo
	} from '$lib/sessions';

	interface Props {
		userId: string;
		session: SessionResponse;
		onClose: () => void;
		// Passed through to the feedback card so the listing behind the modal can
		// follow a reply without refetching.
		onReplied?: (session: SessionResponse) => void;
	}

	let { userId, session, onClose, onReplied }: Props = $props();

	// The listing already carries enough to draw the header, so the summary is
	// shown straight away and the fetched detail takes over once it lands.
	let loaded = $state<SessionDetail | null>(null);
	let loading = $state(true);
	let error = $state('');

	const detail = $derived<SessionResponse>(loaded?.session ?? session);
	// A collection the server left out of its answer could not be read, which is
	// a different thing from a session that holds none of it. Only a detail that
	// arrived can be missing one: before it lands there is nothing to miss, and
	// the loading state below already says so.
	// Compared with == null rather than === undefined, so a collection sent as
	// null reads as unanswered too. The API omits the key, but absent and null
	// are the same statement and only one of them should have to be spelled out
	// here.
	const repsUnavailable = $derived(loaded !== null && loaded.rep_datas == null);
	const assessmentsUnavailable = $derived(loaded !== null && loaded.assessments == null);
	const itemResultsUnavailable = $derived(loaded !== null && loaded.item_results == null);
	const reps = $derived<RepData[]>(loaded?.rep_datas ?? []);
	// Whether there are measurements to show is decided by the reps the session
	// carries, not by what it was labelled: a hangboard block a coach filed under
	// any activity still comes back with every rep the sensor recorded. Played
	// sessions with no reps yet still get the layout, so the empty state below can
	// say so rather than the session looking like a hand-written log.
	const hasRepData = $derived(repsUnavailable || reps.length > 0 || detail.origin === 'played');
	const assessments = $derived<SessionAssessment[]>(loaded?.assessments ?? []);
	// The results of this session, each carrying the day it was measured on, which
	// is the session's own. The session read names that day once rather than on
	// every row, and restating it here is what lets these go through the rule the
	// assessments tab reads a bodyweight relative result by instead of a second
	// copy of it: same weigh-in, same staleness window, same wording.
	const records = $derived<AssessmentResponse[]>(
		assessments.map((assessment) => ({ ...assessment, session_date: detail.date }))
	);
	// The counts the run resolved for the items the prescription left open, shown
	// against those items rather than in a list of their own: a bare number is
	// only readable next to what it was answering.
	const itemResults = $derived<SessionItemResult[]>(loaded?.item_results ?? []);

	// How many repetitions the session actually holds: the steps the run put a
	// clock on, plus the repetitions the athlete reported on the steps that are
	// counted rather than timed.
	//
	// The run records a rep row for every step it finishes, not only for the
	// ones a sensor watched, so a set of pull ups leaves a row behind too: one
	// row for the whole set, carrying no load and no time. Counting those
	// alongside the reported count would say twelve reps for a set of eleven
	// plus its own placeholder.
	//
	// A clocked step is a hang or a timed exercise, and the app asks for a count
	// on neither: it reports both by their duration. That is what makes the two
	// halves below disjoint, rather than any claim about which step types carry
	// a clock.
	const timedReps = $derived(reps.filter((rep) => !rep.is_rest && rep.duration > 0).length);
	const reportedReps = $derived(
		itemResults.reduce((total, result) => total + (result.reps ?? 0), 0)
	);
	const totalReps = $derived(timedReps + reportedReps);
	// Both halves of the count come from a collection of their own, so either one
	// failing leaves the total unknowable rather than lower. A number short by
	// whatever could not be read is worse than no number.
	const repsUnknown = $derived(repsUnavailable || itemResultsUnavailable);
	const type = $derived(sessionActivityInfo(detail.activity));
	// What the session cost the athlete. Null when they reported nothing, which
	// the card below still says out loud: an unanswered prompt is a thing a coach
	// may want to nudge about, and silence would read as a session that was easy.
	const rpe = $derived(sessionRpe(detail));

	onMount(async () => {
		try {
			loaded = await apiClient.getClientSession(userId, session.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load the session.';
		} finally {
			loading = false;
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	// The result rows carry their own definition, so a value is formatted from the
	// unit it was measured in without a catalog to look anything up in.
</script>

<svelte:window onkeydown={onKeydown} />

<!-- What a collection the server could not read looks like. Said out loud rather
     than drawn as nothing: an empty card reads as a session the athlete recorded
     nothing in, which is the wrong thing to tell a coach about a read that
     failed. One snippet so the three of them cannot word it differently. -->
{#snippet unavailable(what: string)}
	<div
		data-testid="session-collection-unavailable"
		style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 16px 18px; display: flex; gap: 10px; align-items: center; font-size: 12.5px; color: var(--rd-tx);"
	>
		<Icon name="alert" size={16} color="var(--rd-tx)" />
		<span>{what} could not be loaded, so nothing here says what it held.</span>
	</div>
{/snippet}

<div
	style="position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
	aria-label="Session details"
>
	<div
		class="flex flex-col"
		style="
			width: 100%; max-width: 720px; max-height: 88vh;
			background: var(--panel); border-radius: var(--rl);
			border: 1px solid var(--bd); box-shadow: var(--sh-hi); overflow: hidden;
		"
	>
		<div
			class="flex shrink-0 items-center gap-3"
			style="padding: 18px 20px; background: {type.tint}; border-bottom: 1px solid var(--bd);"
		>
			<div
				class="flex items-center justify-center"
				style="width: 40px; height: 40px; border-radius: var(--rs); background: var(--panel); flex-shrink: 0;"
			>
				<Icon name={type.icon} size={20} color={type.text} />
			</div>
			<div style="min-width: 0; flex: 1;">
				<div
					style="font-size: 11px; font-weight: 700; color: {type.text}; letter-spacing: 0.06em; text-transform: uppercase;"
				>
					{type.label}{detail.is_assessment ? ' - Assessment' : ''}
				</div>
				<h2
					class="truncate"
					style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 1px;"
				>
					{detail.name}
				</h2>
			</div>
			<button
				onclick={onClose}
				class="flex items-center justify-center"
				style="width: 30px; height: 30px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); cursor: pointer; color: var(--tx2); flex-shrink: 0;"
				aria-label="Close"
			>
				<Icon name="x" size={15} color="var(--tx2)" />
			</button>
		</div>

		<!-- Block flow, not a flex column: flex children would shrink below their
		     own content instead of letting this container scroll, which clips the
		     cards of a long session. -->
		<div class="space-y-3 overflow-y-auto" style="padding: 18px 20px; background: var(--bg);">
			{#if error}
				<div
					style="border: 1px solid var(--rd); background: var(--panel); border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd-tx);"
				>
					{error}
				</div>
			{/if}

			{#if hasRepData}
				<div
					class="grid grid-cols-4"
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
				>
					{#each [{ k: 'Date', v: formatSessionDateShort(detail.date) }, { k: 'Time', v: formatSessionTime(detail.date) }, { k: 'Duration', v: formatDuration(detail.duration) }, { k: 'Reps', v: loading || repsUnknown ? '--' : String(totalReps) }] as stat (stat.k)}
						<div data-testid="session-stat-{stat.k.toLowerCase()}" style="padding: 14px 16px;">
							<div
								style="font-size: 10.5px; color: var(--tx3-sm); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
							>
								{stat.k}
							</div>
							<div
								class="truncate"
								style="font-size: 14px; font-weight: 700; color: var(--tx); margin-top: 3px;"
								title={stat.v}
							>
								{stat.v}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="flex items-center gap-5"
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); padding: 20px;"
				>
					<div style="flex-shrink: 0;">
						<div style="font-size: 32px; font-weight: 700; color: {type.mark}; line-height: 1;">
							{formatDuration(detail.duration)}
						</div>
						<div
							style="font-size: 10.5px; color: var(--tx3-sm); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px;"
						>
							Duration
						</div>
					</div>
					<div style="width: 1px; align-self: stretch; background: var(--bd2);"></div>
					<div class="flex flex-col gap-2" style="min-width: 0;">
						<div class="flex items-center gap-2">
							<Icon name="calendar" size={15} color="var(--tx3)" />
							<span style="font-size: 13px; color: var(--tx);"
								>{formatSessionDate(detail.date)}</span
							>
						</div>
						<div class="flex items-center gap-2">
							<Icon name="clock" size={15} color="var(--tx3)" />
							<span style="font-size: 13px; color: var(--tx);"
								>{formatSessionTime(detail.date)}</span
							>
						</div>
						<div style="font-size: 11.5px; color: var(--tx3-sm);">
							Logged by the athlete, so it carries no sensor measurements.
						</div>
					</div>
				</div>
			{/if}

			<!-- The scale is named and its anchor spelled out, because a bare number
			     is ambiguous between the session scale and the set scale, and the
			     written anchor is the whole of what makes either readable. -->
			<div
				data-testid="session-rpe-card"
				class="flex items-center gap-4"
				style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); padding: 14px 18px;"
			>
				<div
					class="flex items-center justify-center"
					style="
						width: 52px; height: 52px; border-radius: var(--rs); flex-shrink: 0;
						background: {rpe ? sessionRpeTint(rpe) : 'var(--panel2)'};
						color: {rpe ? sessionRpeColor(rpe) : 'var(--tx3-sm)'};
						font-size: {rpe?.failed ? '12px' : '22px'}; font-weight: 700;
					"
				>
					{rpe ? rpe.short : '--'}
				</div>
				<div style="min-width: 0;">
					<div
						style="font-size: 10.5px; color: var(--tx3-sm); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
					>
						Session RPE
					</div>
					<div style="font-size: 13px; color: var(--tx); margin-top: 3px;">
						{rpe ? rpe.anchor : 'Not reported by the athlete.'}
					</div>
				</div>
			</div>

			{#if loading}
				<div
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 24px; text-align: center; font-size: 13px; color: var(--tx3-sm);"
				>
					Loading session details...
				</div>
			{:else}
				{#if repsUnavailable}
					{@render unavailable('The rep data for this session')}
				{:else if hasRepData}
					<SessionRepsCard session={detail} {reps} accent={type.text} />
				{/if}

				<!-- Next to the measurements rather than paired rep by rep: a
				     prescribed item is a template of sets, a rep is one measured
				     hang, and the two stop lining up as soon as the athlete cut a
				     set short. What each rep was aiming at is already on the rep
				     itself, through target_weight in the card above. -->
				{#if detail.prescription}
					<SessionPrescriptionCard prescription={detail.prescription} {itemResults} />
				{:else if detail.origin === 'played'}
					<div
						style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 16px 18px; font-size: 12.5px; color: var(--tx3-sm);"
					>
						Played from the athlete's own library, so there is nothing prescribed to compare it to.
					</div>
				{/if}

				<!-- The prescription card above draws the items with no answer against
				     them when this read failed, so the notice sits under it rather than
				     replacing it: the prescription itself was read fine. -->
				{#if itemResultsUnavailable}
					{@render unavailable("The counts the athlete reported against this session's items")}
				{/if}

				{#if assessmentsUnavailable}
					{@render unavailable('The assessment results of this session')}
				{:else if assessments.length > 0}
					<div
						style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
					>
						<div style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);">
							<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">
								Assessment results
							</h3>
						</div>
						{#each records as assessment (assessment.id)}
							{@const denominator = readRecordDenominator(assessment)}
							{@const readsAs = readingLabel(assessment.bodyweight_relative, assessment.unit)}
							<div style="padding: 12px 18px; border-bottom: 1px solid var(--bd2);">
								<div class="flex items-center justify-between">
									<div style="min-width: 0;">
										<div style="font-size: 13px; font-weight: 600; color: var(--tx);">
											{assessment.label}
										</div>
										<!-- The grip and how the number reads, on one line. A grip only
										     means something on a hangboard assessment, which is what the
										     builtins are: a pull up count has no grip. The unit is named
										     here because the numbers beside it no longer carry it, a
										     ratio having none to carry. -->
										<div style="font-size: 11.5px; color: var(--tx3-sm);">
											{assessment.training_id
												? readsAs
												: `${gripLabel(assessment.grip_position ?? 0)}, ${readsAs}`}
										</div>
									</div>
									<div class="flex gap-6" style="flex-shrink: 0; text-align: right;">
										{#if assessment.per_hand}
											<LatestValue
												label="LEFT"
												labelColor="var(--gn-tx)"
												reading={readRecordRatio(assessment, assessment.left_value)}
												unit={assessment.unit}
												size={15}
											/>
											<LatestValue
												label="RIGHT"
												labelColor="var(--pl-tx)"
												reading={readRecordRatio(assessment, assessment.right_value)}
												unit={assessment.unit}
												size={15}
											/>
										{:else}
											<!-- The same colour the cards give their single value, which is
											     the one this PR introduces rather than carries forward. The
											     word differs on purpose: this is the result of this session,
											     not the athlete's latest. -->
											<LatestValue
												label="RESULT"
												labelColor="var(--pr-tx)"
												reading={readRecordRatio(
													assessment,
													assessment.right_value ?? assessment.left_value
												)}
												unit={assessment.unit}
												size={15}
											/>
										{/if}
									</div>
								</div>
								{#if denominator}
									<!-- Named once under the row, because one session is one weigh-in:
									     saying it under each hand repeats it and wraps mid date. The
									     load itself stays per hand, above. -->
									<div
										style="font-size: 11px; margin-top: 6px; text-align: right; color: {denominatorNoteColor(
											denominator
										)};"
										data-testid="session-denominator-note"
									>
										{formatDenominatorNote(denominator, unitLabel(assessment.unit))}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- A played session that recorded only open counts measured no rep and
				     is still not empty, so the notice belongs to a run that recorded
				     nothing at all. -->
				{#if hasRepData && reps.length === 0 && itemResults.length === 0 && !repsUnknown && !error}
					<div
						style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 24px; text-align: center; font-size: 13px; color: var(--tx3-sm);"
					>
						No rep data was recorded for this session.
					</div>
				{/if}
			{/if}

			<!-- The notes the athlete left and the coach's answer to them are one
			     exchange, so they are shown as one card rather than a read-only
			     block and an editor that never meet. Keyed on the session so the
			     card resets when the modal is reused for another one. -->
			{#key detail.id}
				<SessionFeedbackCard {userId} session={detail} {onReplied} />
			{/key}
		</div>
	</div>
</div>
