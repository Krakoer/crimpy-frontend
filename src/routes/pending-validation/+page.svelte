<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { authBadge } from '$lib/components/auth-styles';

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

<AuthShell maxWidth={480}>
	<div style="padding: 28px 26px; display: flex; flex-direction: column; gap: 18px;">
		<div style="text-align: center;">
			<div style={authBadge('gold')}>
				<Icon name="clock" size={24} color="var(--gd)" />
			</div>
			<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
				Pending validation
			</h1>
			<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
				Thank you for registering as a coach, {authStore.user?.firstname}. Your email is verified
				and your account is now waiting for admin validation.
			</p>
		</div>

		<div
			style="background: var(--panel2); border: 1px solid var(--bd2); border-radius: var(--rs); padding: 14px 16px;"
		>
			<p
				style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;"
			>
				Account details
			</p>
			<div style="display: flex; flex-direction: column; gap: 4px; font-size: 12.5px;">
				<div style="display: flex; gap: 8px;">
					<span style="color: var(--tx3); width: 52px; flex-shrink: 0;">Name</span>
					<span style="color: var(--tx2);">
						{authStore.user?.firstname}
						{authStore.user?.lastname}
					</span>
				</div>
				<div style="display: flex; gap: 8px;">
					<span style="color: var(--tx3); width: 52px; flex-shrink: 0;">Email</span>
					<span style="color: var(--tx2);">
						{authStore.user?.email}
						{#if authStore.user?.email_verified}
							<span style="color: var(--gn); font-weight: 600;">(verified)</span>
						{/if}
					</span>
				</div>
			</div>
		</div>

		<p style="font-size: 12px; color: var(--tx3); line-height: 1.5; text-align: center;">
			This typically takes 1 to 2 business days. You will be notified by email once your account has
			been validated.
		</p>
	</div>

	<div style="border-top: 1px solid var(--bd); padding: 14px 26px; text-align: center;">
		<button
			onclick={handleLogout}
			style="background: none; border: none; cursor: pointer; font-family: var(--font); font-size: 12.5px; font-weight: 600; color: var(--tx2);"
		>
			Sign out
		</button>
	</div>
</AuthShell>
