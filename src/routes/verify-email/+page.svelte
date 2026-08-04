<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { authBadge, authBanner, authSecondaryButton } from '$lib/components/auth-styles';

	let verifying = $state(false);
	let verified = $state(false);
	let error = $state('');
	let resendCooldown = $state(0);
	let resending = $state(false);
	let resendMessage = $state('');

	let cooldownInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		authStore.initialize();

		if (!authStore.isAuthenticated) {
			goto('/');
			return;
		}

		if (authStore.user?.email_verified) {
			if (authStore.isCoach && !authStore.user?.coach_validated) {
				goto('/pending-validation');
			} else {
				goto('/dashboard');
			}
			return;
		}

		const token = $page.url.searchParams.get('token');
		if (token) {
			handleVerification(token);
		}

		return () => {
			if (cooldownInterval) {
				clearInterval(cooldownInterval);
			}
		};
	});

	async function handleVerification(token: string) {
		verifying = true;
		error = '';
		try {
			await apiClient.verifyEmail(token);
			verified = true;
			if (authStore.user) {
				authStore.user.email_verified = true;
				authStore.saveUser();
			}
			setTimeout(() => {
				if (authStore.isCoach) {
					goto('/pending-validation');
				} else {
					goto('/dashboard');
				}
			}, 2000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Email verification failed';
		} finally {
			verifying = false;
		}
	}

	async function handleResend() {
		if (!authStore.user?.email || resendCooldown > 0) return;

		resending = true;
		error = '';
		resendMessage = '';
		try {
			await apiClient.resendVerification(authStore.user.email);
			resendMessage = 'Verification email sent. Please check your inbox.';
			resendCooldown = 600;

			if (cooldownInterval) {
				clearInterval(cooldownInterval);
			}

			cooldownInterval = setInterval(() => {
				resendCooldown--;
				if (resendCooldown <= 0 && cooldownInterval) {
					clearInterval(cooldownInterval);
					cooldownInterval = null;
				}
			}, 1000);
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : 'Failed to resend verification email';
			if (errorMessage.includes('cooldown')) {
				error = 'Please wait before requesting another verification email.';
			} else {
				error = errorMessage;
			}
		} finally {
			resending = false;
		}
	}

	async function handleLogout() {
		await authStore.logout();
		goto('/');
	}

	function formatCooldown(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<AuthShell title="Verify your email" maxWidth={480}>
	<div style="padding: 28px 26px; display: flex; flex-direction: column; gap: 18px;">
		<div style="text-align: center;">
			{#if verifying}
				<div style={authBadge('primary')}>
					<Icon name="clock" size={24} color="var(--pr)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Verifying your email
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px;">
					Please wait while we verify your email address.
				</p>
			{:else if verified}
				<div style={authBadge('success')}>
					<Icon name="check" size={24} color="var(--gn)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Email verified
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px;">
					{authStore.isCoach
						? 'Redirecting to the validation page...'
						: 'Redirecting to your dashboard...'}
				</p>
			{:else}
				<div style={authBadge('gold')}>
					<Icon name="mail" size={24} color="var(--gd)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Verify your email
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
					Thank you for registering, {authStore.user?.firstname}. We have sent a verification link
					to
					<strong style="color: var(--tx);">{authStore.user?.email}</strong>.
				</p>
			{/if}
		</div>

		{#if !verifying && !verified}
			{#if error}
				<div style={authBanner('error')}>{error}</div>
			{/if}

			{#if resendMessage}
				<div style={authBanner('success')}>{resendMessage}</div>
			{/if}

			<div
				style="background: var(--panel2); border: 1px solid var(--bd2); border-radius: var(--rs); padding: 14px 16px;"
			>
				<p
					style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;"
				>
					Next steps
				</p>
				<ol
					style="font-size: 12.5px; color: var(--tx2); line-height: 1.7; padding-left: 18px; list-style: decimal;"
				>
					<li>Check your inbox, and your spam folder</li>
					<li>Click the verification link in the email</li>
					{#if authStore.isCoach}
						<li>Wait for admin validation to access the coach portal</li>
					{:else}
						<li>Access your dashboard</li>
					{/if}
				</ol>
			</div>

			<div style="text-align: center;">
				<p style="font-size: 12.5px; color: var(--tx3); margin-bottom: 10px;">
					Did not receive the email?
				</p>
				<button
					onclick={handleResend}
					disabled={resending || resendCooldown > 0}
					style="{authSecondaryButton} opacity: {resending || resendCooldown > 0 ? 0.5 : 1};"
				>
					{#if resending}
						Sending...
					{:else if resendCooldown > 0}
						Resend in {formatCooldown(resendCooldown)}
					{:else}
						Resend verification email
					{/if}
				</button>
			</div>
		{/if}
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
