<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		authStore.initialize();

		if (!authStore.isAuthenticated) {
			goto('/');
			return;
		}

		if (!authStore.isEmailVerified) {
			goto('/verify-email');
			return;
		}

		if (authStore.isCoach && !authStore.isValidatedCoach) {
			goto('/pending-validation');
			return;
		}
	});

	function handleLogout() {
		authStore.logout();
		goto('/');
	}
</script>

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<div>
				<h1
					class="mb-2 text-4xl font-black"
					style="font-family: monospace; letter-spacing: -0.5px;"
				>
					DASHBOARD
				</h1>
				<p style="font-family: monospace; font-size: 13px; color: #666;">
					Welcome, {authStore.user?.firstname || 'User'}
				</p>
			</div>
			<button
				onclick={handleLogout}
				class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
				style="font-family: monospace; font-size: 13px;"
			>
				LOGOUT
			</button>
		</div>

		<div class="border-2 border-black bg-white p-8">
			<h2 class="mb-4 text-2xl font-bold" style="font-family: monospace;">
				{#if authStore.isValidatedCoach}
					COACH PORTAL
				{:else}
					USER PORTAL
				{/if}
			</h2>
			<p style="font-family: monospace; font-size: 14px; color: #666;">
				Dashboard features coming soon...
			</p>

			<div class="mt-6 border border-gray-300 bg-gray-50 p-4">
				<h3 class="mb-2 font-bold" style="font-family: monospace; font-size: 13px;">
					ACCOUNT STATUS
				</h3>
				<div class="space-y-1" style="font-family: monospace; font-size: 12px; color: #666;">
					<p><span class="font-medium">Email:</span> {authStore.user?.email}</p>
					<p>
						<span class="font-medium">Name:</span>
						{authStore.user?.firstname}
						{authStore.user?.lastname}
					</p>
					<p>
						<span class="font-medium">Role:</span>
						{authStore.isValidatedCoach ? 'Validated Coach' : 'User'}
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
