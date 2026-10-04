<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { startOfWeek, toDateOnly, WEEKDAY_SHORT_NAMES } from '$lib/date';
	import { currentTrainingDay } from '$lib/sessions';

	// Picks the week a program starts on, laid out Monday first whatever the
	// browser's locale. A native date input cannot do that: its calendar opens on
	// the first weekday of the browser's own locale, Sunday in en-US, and a page
	// has no say in it. Any day can be picked; the value is the Monday of its week,
	// and the whole week is highlighted so the snap is visible before saving.

	interface Props {
		id: string;
		value: string;
		dense?: boolean;
	}

	let { id, value = $bindable(), dense = false }: Props = $props();

	let open = $state(false);
	let container: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let grid = $state<HTMLTableElement | undefined>(undefined);

	// Snapped, so a legacy start stored off a Monday reads as the week it runs in.
	const selectedMonday = $derived(value ? startOfWeek(parseDay(value)) : null);
	// Today as a training day: until 04:00 it is still yesterday, so on a Monday
	// night the week being finished is the one ringed and opened on.
	let today = $state(currentTrainingDay());
	let shownMonth = $state(monthOf(currentTrainingDay()));
	let focusedDay = $state(currentTrainingDay());

	function parseDay(day: string): Date {
		return new Date(`${day.slice(0, 10)}T00:00:00`);
	}

	function monthOf(day: Date): Date {
		return new Date(day.getFullYear(), day.getMonth(), 1);
	}

	function addDays(day: Date, days: number): Date {
		return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
	}

	function isSameDay(a: Date, b: Date): boolean {
		return toDateOnly(a) === toDateOnly(b);
	}

	// Every week touching the shown month, each a Monday-to-Sunday row.
	const weeks = $derived.by(() => {
		const lastOfMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0);
		const rows: Date[][] = [];
		for (let monday = startOfWeek(shownMonth); monday <= lastOfMonth; monday = addDays(monday, 7)) {
			rows.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
		}
		return rows;
	});

	const monthTitle = $derived(
		shownMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
	);

	// Composed from separate parts so no locale's punctuation slips in between
	// the weekday and the date.
	const triggerText = $derived(
		selectedMonday
			? `Week of ${WEEKDAY_SHORT_NAMES[0]} ${selectedMonday.toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})}`
			: 'Choose a week'
	);

	function dayLabel(day: Date): string {
		const weekday = day.toLocaleDateString('en-GB', { weekday: 'long' });
		const date = day.toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		return `${weekday} ${date}`;
	}

	async function focusDay(day: Date) {
		focusedDay = day;
		if (monthOf(day).getTime() !== shownMonth.getTime()) shownMonth = monthOf(day);
		await tick();
		grid?.querySelector<HTMLButtonElement>(`[data-day="${toDateOnly(day)}"]`)?.focus();
	}

	async function openPicker() {
		open = true;
		today = currentTrainingDay();
		const start = selectedMonday ?? today;
		shownMonth = monthOf(start);
		await focusDay(start);
	}

	function close() {
		open = false;
		trigger.focus();
	}

	function pick(day: Date) {
		value = toDateOnly(startOfWeek(day));
		close();
	}

	// Moves the focusable day along with the month, the same day of the month
	// where it exists, so Tab still reaches the grid after a month step.
	function showMonth(step: number) {
		shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + step, 1);
		const lastDay = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0).getDate();
		focusedDay = new Date(
			shownMonth.getFullYear(),
			shownMonth.getMonth(),
			Math.min(focusedDay.getDate(), lastDay)
		);
	}

	const arrowSteps: Record<string, number> = {
		ArrowLeft: -1,
		ArrowRight: 1,
		ArrowUp: -7,
		ArrowDown: 7
	};

	function handleGridKeydown(e: KeyboardEvent) {
		const step = arrowSteps[e.key];
		if (step === undefined) return;
		e.preventDefault();
		focusDay(addDays(focusedDay, step));
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			close();
		}
	}

	function handleWindowClick(e: MouseEvent) {
		if (open && container && !container.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div bind:this={container} style="position: relative;" onkeydown={handleKeydown} role="none">
	<button
		bind:this={trigger}
		{id}
		type="button"
		aria-haspopup="dialog"
		aria-describedby="{id}-value"
		aria-expanded={open}
		onclick={() => (open ? close() : openPicker())}
		class="flex w-full items-center justify-between gap-2"
		style="
			padding: {dense ? '8px 10px' : '10px 14px'}; border: 1px solid {open
			? 'var(--pr)'
			: 'var(--bd)'}; border-radius: var(--rs); background: var(--panel); cursor: pointer;
			font-family: var(--font); font-size: 13px; text-align: left;
			color: {selectedMonday ? 'var(--tx)' : 'var(--tx3-sm)'};
		"
	>
		<span id="{id}-value">{triggerText}</span>
		<Icon name="calendar" size={15} color="var(--tx2)" />
	</button>

	{#if open}
		<div
			role="dialog"
			aria-label="Choose the start week"
			style="
				position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; width: 272px;
				padding: 12px; background: var(--panel); border: 1px solid var(--bd);
				border-radius: var(--r); box-shadow: var(--sh);
			"
		>
			<div class="flex items-center gap-2" style="margin-bottom: 8px;">
				<button
					type="button"
					aria-label="Previous month"
					onclick={() => showMonth(-1)}
					class="month-step flex shrink-0 items-center justify-center"
				>
					<Icon name="arrow-left" size={13} color="var(--tx2)" />
				</button>
				<div
					class="flex-1"
					style="text-align: center; font-size: 13px; font-weight: 700; color: var(--tx);"
				>
					{monthTitle}
				</div>
				<button
					type="button"
					aria-label="Next month"
					onclick={() => showMonth(1)}
					class="month-step flex shrink-0 items-center justify-center"
					style="transform: rotate(180deg);"
				>
					<Icon name="arrow-left" size={13} color="var(--tx2)" />
				</button>
			</div>

			<table
				bind:this={grid}
				class="w-full"
				style="border-collapse: separate; border-spacing: 0 2px;"
			>
				<thead>
					<tr>
						{#each WEEKDAY_SHORT_NAMES as name (name)}
							<th
								scope="col"
								style="padding: 2px 0 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tx3-sm);"
							>
								{name}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each weeks as week (toDateOnly(week[0]))}
						{@const isSelectedWeek = selectedMonday !== null && isSameDay(week[0], selectedMonday)}
						<tr class="week-row" class:selected={isSelectedWeek}>
							{#each week as day (toDateOnly(day))}
								{@const inMonth = day.getMonth() === shownMonth.getMonth()}
								{@const isToday = isSameDay(day, today)}
								<td style="padding: 0; text-align: center;">
									<button
										type="button"
										data-day={toDateOnly(day)}
										aria-label={dayLabel(day)}
										aria-current={isToday ? 'date' : undefined}
										tabindex={isSameDay(day, focusedDay) ? 0 : -1}
										onclick={() => pick(day)}
										onkeydown={handleGridKeydown}
										onfocus={() => (focusedDay = day)}
										style="
											width: 100%; height: 30px; border: 1px solid {isToday
											? 'var(--pr-lt)'
											: 'transparent'}; border-radius: var(--rs); background: transparent;
											cursor: pointer; font-family: var(--font); font-size: 12.5px;
											font-weight: {isSelectedWeek ? 700 : 500};
											color: {isSelectedWeek ? 'var(--pr-tx)' : inMonth ? 'var(--tx)' : 'var(--tx3-sm)'};
										"
									>
										{day.getDate()}
									</button>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<div style="margin-top: 6px; font-size: 11px; color: var(--tx3-sm);">
				Weeks run Monday to Sunday. Any day picks its week.
			</div>
		</div>
	{/if}
</div>

<style>
	.month-step {
		width: 28px;
		height: 28px;
		border-radius: var(--rs);
		border: 1px solid var(--bd);
		background: var(--panel);
		cursor: pointer;
	}

	.week-row:hover td,
	.week-row:focus-within td {
		background: var(--panel2);
	}

	.week-row.selected td {
		background: var(--pr-fog);
	}

	.week-row td:first-child {
		border-top-left-radius: var(--rs);
		border-bottom-left-radius: var(--rs);
	}

	.week-row td:last-child {
		border-top-right-radius: var(--rs);
		border-bottom-right-radius: var(--rs);
	}
</style>
