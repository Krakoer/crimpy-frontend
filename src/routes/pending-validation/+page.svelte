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

		if (!authStore.user?.email_verified) {
			goto('/verify-email');
			return;
		}

		if (!authStore.isCoach) {
			goto('/dashboard');
			return;
		}

		if (authStore.isValidatedCoach) {
			goto('/dashboard');
			return;
		}
	});

	async function handleLogout() {
		await authStore.logout();
		goto('/');
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-white p-6">
	<div class="w-full max-w-2xl">
		<div class="mb-8 text-center">
			<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
				CRIMPY
			</h1>
			<p class="text-gray-600" style="font-family: monospace; font-size: 13px;">
				Climbing Training Platform
			</p>
		</div>

		<div class="border-2 border-black bg-white p-8">
			<div class="mb-6 text-center">
				<div
					class="mb-4 inline-flex h-16 w-16 items-center justify-center border-2 border-yellow-600 bg-yellow-50"
				>
					<span class="text-3xl">!</span>
				</div>
				<h2 class="mb-2 text-2xl font-bold" style="font-family: monospace;">PENDING VALIDATION</h2>
			</div>

			<div class="space-y-4" style="font-family: monospace; font-size: 14px; line-height: 1.6;">
				<p>
					Thank you for registering as a coach, {authStore.user?.firstname}!
				</p>
				<p>
					Your email address has been verified. Your account is currently pending admin validation.
					You will receive access to the coach portal once an administrator has reviewed and
					approved your account.
				</p>
				<div class="border border-gray-300 bg-gray-50 p-4">
					<p class="mb-2 font-medium" style="font-size: 12px; color: #666;">ACCOUNT DETAILS</p>
					<p style="font-size: 12px; color: #666;">
						Email: {authStore.user?.email}
						{authStore.user?.email_verified ? '(Verified)' : ''}
					</p>
					<p style="font-size: 12px; color: #666;">
						Name: {authStore.user?.firstname}
						{authStore.user?.lastname}
					</p>
				</div>
				<p style="font-size: 12px; color: #999;">
					This process typically takes 1-2 business days. You will be notified by email once your
					account has been validated.
				</p>
			</div>

			<div class="mt-6 text-center">
				<button
					onclick={handleLogout}
					class="border border-black px-6 py-2 font-medium transition-colors hover:bg-gray-100"
					style="font-family: monospace; font-size: 13px;"
				>
					LOGOUT
				</button>
			</div>
		</div>
	</div>
</div>
