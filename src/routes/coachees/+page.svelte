<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { EnrolledUser, EnrollmentTokenResponse } from '$lib/api/client';

	let coachees = $state<EnrolledUser[]>([]);
	let search = $state('');
	let loading = $state(false);
	let error = $state('');

	let enrollmentToken = $state<EnrollmentTokenResponse | null>(null);
	let showEnrollmentPanel = $state(false);
	let generatingToken = $state(false);
	let tokenError = $state('');
	let copyConfirmed = $state(false);

	let filtered = $derived(
		search.trim()
			? coachees.filter((c) =>
					`${c.user_firstname} ${c.user_lastname}`
						.toLowerCase()
						.includes(search.trim().toLowerCase())
				)
			: coachees
	);

	onMount(async () => {
		authStore.initialize();
		loading = true;
		try {
			coachees = await apiClient.getEnrollments();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load coachees.';
		} finally {
			loading = false;
		}
	});

	async function handleGenerateToken() {
		generatingToken = true;
		tokenError = '';
		try {
			enrollmentToken = await apiClient.generateEnrollmentToken();
		} catch (e) {
			tokenError = e instanceof Error ? e.message : 'Failed to generate link.';
		} finally {
			generatingToken = false;
		}
	}

	async function handleCopyLink() {
		if (!enrollmentToken) return;
		await navigator.clipboard.writeText(`${window.location.origin}/enroll/${enrollmentToken.token}`);
		copyConfirmed = true;
		setTimeout(() => (copyConfirmed = false), 2000);
	}

	function handleLogout() {
		authStore.logout();
		goto('/');
	}
</script>

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<h1 class="text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
				COACHEES
			</h1>
			<div class="flex gap-3">
				<button
					onclick={() => (showEnrollmentPanel = !showEnrollmentPanel)}
					class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 13px;"
				>
					+ GET ENROLLMENT LINK
				</button>
				<button
					onclick={handleLogout}
					class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 13px;"
				>
					LOGOUT
				</button>
			</div>
		</div>

		{#if showEnrollmentPanel}
			<div class="mb-6 border-2 border-black bg-white p-6">
				<h2 class="mb-1 text-base font-bold" style="font-family: monospace;">ENROLLMENT LINK</h2>
				<p class="mb-4" style="font-family: monospace; font-size: 13px; color: #666;">
					Generate a one-time link to send to a new coachee. The link expires after 7 days.
				</p>

				{#if tokenError}
					<div
						class="mb-4 border border-red-600 bg-red-50 p-3"
						style="font-family: monospace; font-size: 12px; color: #B85450;"
					>
						{tokenError}
					</div>
				{/if}

				{#if enrollmentToken}
					<div class="mb-4">
						<p
							class="mb-2 font-medium"
							style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
						>
							LINK (expires {new Date(enrollmentToken.expires_at).toLocaleDateString('en-GB', {
								year: 'numeric',
								month: 'short',
								day: 'numeric'
							})})
						</p>
						<div class="flex gap-2">
							<input
								readonly
								value={`${window.location.origin}/enroll/${enrollmentToken.token}`}
								class="flex-1 border border-black bg-gray-50 px-3 py-2"
								style="font-family: monospace; font-size: 12px;"
							/>
							<button
								onclick={handleCopyLink}
								class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
								style="font-family: monospace; font-size: 12px; min-width: 80px;"
							>
								{copyConfirmed ? 'COPIED' : 'COPY'}
							</button>
						</div>
					</div>
				{/if}

				<button
					onclick={handleGenerateToken}
					disabled={generatingToken}
					class="px-4 py-2 font-medium transition-opacity"
					style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; opacity: {generatingToken
						? 0.6
						: 1};"
				>
					{generatingToken
						? 'GENERATING...'
						: enrollmentToken
							? 'GENERATE NEW LINK'
							: 'GENERATE LINK'}
				</button>
			</div>
		{/if}

		<div class="border-2 border-black bg-white">
			<div class="border-b border-gray-300 p-4">
				<input
					bind:value={search}
					placeholder="Search by name..."
					class="w-full border border-black bg-white px-3 py-2"
					style="font-family: monospace; font-size: 13px;"
				/>
			</div>

			{#if error}
				<div
					class="p-4 border-b border-red-600 bg-red-50"
					style="font-family: monospace; font-size: 12px; color: #B85450;"
				>
					{error}
				</div>
			{/if}

			<div
				class="grid border-b border-gray-300 bg-gray-50 px-4 py-2"
				style="grid-template-columns: 1fr 1fr 2fr;"
			>
				<span class="font-medium" style="font-family: monospace; font-size: 11px; color: #666; letter-spacing: 0.5px;">FIRST NAME</span>
				<span class="font-medium" style="font-family: monospace; font-size: 11px; color: #666; letter-spacing: 0.5px;">LAST NAME</span>
				<span class="font-medium" style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px;">MORE COLUMNS TO COME</span>
			</div>

			{#if loading}
				<div class="flex items-center gap-3 p-6">
					<div
						class="animate-spin"
						style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
					></div>
					<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
				</div>
			{:else if filtered.length === 0}
				<p class="p-6" style="font-family: monospace; font-size: 13px; color: #666;">
					{search ? 'No coachees match your search.' : 'No coachees enrolled yet.'}
				</p>
			{:else}
				{#each filtered as coachee (coachee.user_id)}
					<button
						onclick={() => goto(`/coachees/${coachee.user_id}`)}
						class="grid w-full border-b border-gray-200 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50"
						style="grid-template-columns: 1fr 1fr 2fr;"
					>
						<span style="font-family: monospace; font-size: 13px;">{coachee.user_firstname}</span>
						<span style="font-family: monospace; font-size: 13px;">{coachee.user_lastname}</span>
						<span></span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>
