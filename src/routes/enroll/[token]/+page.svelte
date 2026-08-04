<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import type { EnrollmentTokenInfo } from '$lib/api/client';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		authBadge,
		authBanner,
		authPrimaryButton,
		authSecondaryButton
	} from '$lib/components/auth-styles';

	let { data } = $props();

	type PageState = 'loading' | 'invalid' | 'confirm' | 'accepted' | 'error';

	let pageState = $state<PageState>('loading');
	let tokenInfo = $state<EnrollmentTokenInfo | null>(null);
	let errorMessage = $state('');
	let accepting = $state(false);

	onMount(async () => {
		authStore.initialize();

		if (!authStore.isAuthenticated) {
			goto(`/?return=/enroll/${data.token}`);
			return;
		}

		try {
			const info = await apiClient.getEnrollmentTokenInfo(data.token);
			tokenInfo = info;
			pageState = 'confirm';
		} catch {
			errorMessage = 'This enrollment link is invalid, expired, or has already been used.';
			pageState = 'invalid';
		}
	});

	async function handleAccept() {
		accepting = true;
		try {
			await apiClient.acceptEnrollment(data.token);
			pageState = 'accepted';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to accept enrollment.';
			pageState = 'error';
		} finally {
			accepting = false;
		}
	}

	function handleDecline() {
		goto('/dashboard');
	}

	function coachInitials(info: EnrollmentTokenInfo): string {
		return ((info.coach_firstname?.[0] ?? '') + (info.coach_lastname?.[0] ?? '')).toUpperCase();
	}
</script>

<AuthShell title="Enrollment request">
	<div style="padding: 28px 26px; display: flex; flex-direction: column; gap: 18px;">
		{#if pageState === 'loading'}
			<div style="display: flex; justify-content: center; padding: 24px 0;">
				<div class="spinner"></div>
			</div>
		{:else if pageState === 'invalid' || pageState === 'error'}
			<div style="text-align: center;">
				<div style={authBadge('error')}>
					<Icon name="x" size={24} color="var(--rd)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Enrollment unavailable
				</h1>
			</div>
			<div style={authBanner('error')}>{errorMessage}</div>
			<button
				onclick={() => goto('/dashboard')}
				style="{authSecondaryButton} width: 100%; text-align: center;"
			>
				Go to dashboard
			</button>
		{:else if pageState === 'confirm' && tokenInfo}
			<div style="text-align: center;">
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx);">Enrollment request</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px;">
					You have been invited to train with a coach.
				</p>
			</div>

			<div
				style="display: flex; align-items: center; gap: 12px; background: var(--panel2); border: 1px solid var(--bd2); border-radius: var(--rs); padding: 14px 16px;"
			>
				<div
					style="
						width: 40px; height: 40px; border-radius: 50%;
						background: var(--pr); color: #fff;
						display: flex; align-items: center; justify-content: center;
						font-size: 14px; font-weight: 600; flex-shrink: 0;
					"
				>
					{coachInitials(tokenInfo)}
				</div>
				<div style="min-width: 0;">
					<p
						style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;"
					>
						Coach
					</p>
					<p style="font-size: 14px; font-weight: 600; color: var(--tx);">
						{tokenInfo.coach_firstname}
						{tokenInfo.coach_lastname}
					</p>
				</div>
			</div>

			<p style="font-size: 12.5px; color: var(--tx2); line-height: 1.6;">
				Do you want to be enrolled by this coach? They will be able to assign training plans, view
				your trainings, and send feedback.
			</p>

			<div style="display: flex; gap: 10px;">
				<button
					onclick={handleAccept}
					disabled={accepting}
					style="{authPrimaryButton} flex: 1; opacity: {accepting ? 0.5 : 1};"
				>
					{accepting ? 'Accepting...' : 'Accept'}
				</button>
				<button onclick={handleDecline} disabled={accepting} style="{authSecondaryButton} flex: 1;">
					Decline
				</button>
			</div>
		{:else if pageState === 'accepted'}
			<div style="text-align: center;">
				<div style={authBadge('success')}>
					<Icon name="check" size={24} color="var(--gn)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Enrolled
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
					You are now enrolled with {tokenInfo?.coach_firstname}
					{tokenInfo?.coach_lastname}. Your coach can now assign you training plans and track your
					trainings.
				</p>
			</div>
			<button onclick={() => goto('/dashboard')} style={authPrimaryButton}>Go to dashboard</button>
		{/if}
	</div>
</AuthShell>

<style>
	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--pr-lt);
		border-top-color: var(--pr);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
