<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import { authStore } from '$lib/stores/auth.svelte';

	const primary = [
		{ id: 'dashboard', label: 'Dashboard', icon: 'home', href: '/dashboard' },
		{ id: 'coachees', label: 'Coachees', icon: 'users', href: '/coachees' },
		{ id: 'trainings', label: 'Trainings', icon: 'calendar', href: '/trainings' },
		{ id: 'exercises', label: 'Exercises', icon: 'dumbbell', href: '/exercises' }
	];

	const secondary = [{ id: 'settings', label: 'Settings', icon: 'settings', href: '/settings' }];

	function activeId(pathname: string): string {
		if (pathname.startsWith('/coachees')) return 'coachees';
		if (pathname.startsWith('/trainings')) return 'trainings';
		if (pathname.startsWith('/exercises')) return 'exercises';
		if (pathname.startsWith('/admin')) return 'admin';
		if (pathname.startsWith('/settings')) return 'settings';
		return 'dashboard';
	}

	function userInitials(user: { firstname?: string; lastname?: string } | null): string {
		if (!user) return 'U';
		const f = user.firstname?.[0] ?? '';
		const l = user.lastname?.[0] ?? '';
		return (f + l).toUpperCase() || 'U';
	}

	async function handleLogout() {
		await authStore.logout();
		goto('/');
	}
</script>

<aside
	style="
		width: 232px;
		flex-shrink: 0;
		background: var(--panel2);
		border-right: 1px solid var(--bd);
		display: flex;
		flex-direction: column;
		font-family: var(--font);
		color: var(--tx);
		overflow: hidden;
	"
>
	<!-- Brand -->
	<div
		style="
			padding: 22px 22px;
			display: flex;
			align-items: center;
			gap: 10px;
		"
	>
		<div
			style="
				width: 32px; height: 32px;
				border-radius: 9px;
				background: var(--pr);
				color: #fff;
				display: flex; align-items: center; justify-content: center;
				flex-shrink: 0;
				box-shadow: 0 4px 10px rgba(194,113,79,0.25);
			"
		>
			<Icon name="mountain" size={18} color="#fff" />
		</div>
		<div>
			<div style="font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: var(--tx);">
				Crimpy
			</div>
			<div
				style="font-size: 10.5px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; margin-top: -1px;"
			>
				Coach Studio
			</div>
		</div>
	</div>

	<!-- Search -->
	<div style="padding: 0 16px 14px;">
		<div
			style="
				display: flex; align-items: center; gap: 8px;
				background: #fff; border: 1px solid var(--bd);
				border-radius: var(--rs); padding: 7px 10px;
				color: var(--tx3); font-size: 12.5px;
			"
		>
			<Icon name="search" size={14} color="var(--tx3)" />
			<span style="flex: 1;">Quick search</span>
			<span
				style="font-size: 10px; padding: 1px 5px; border: 1px solid var(--bd); border-radius: 4px; color: var(--tx3);"
			>
				Ctrl K
			</span>
		</div>
	</div>

	<!-- Section label -->
	<div
		style="
			padding: 4px 24px 8px;
			font-size: 10px; color: var(--tx3);
			letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600;
		"
	>
		Workspace
	</div>

	<!-- Primary nav -->
	<nav style="display: flex; flex-direction: column; gap: 2px; padding: 0 12px;">
		{#each primary as item (item.id)}
			{@const active = activeId($page.url.pathname) === item.id}
			<button
				onclick={() => goto(item.href)}
				style="
					display: flex; align-items: center; gap: 11px;
					padding: 8px 12px;
					border-radius: var(--rs);
					background: {active ? 'var(--pr-fog)' : 'transparent'};
					border: none; cursor: pointer;
					font-size: 13.5px; color: {active ? 'var(--pr)' : 'var(--tx2)'};
					font-weight: {active ? '600' : '500'};
					font-family: var(--font);
					position: relative;
					text-align: left;
					width: 100%;
				"
			>
				{#if active}
					<div
						style="
							position: absolute; left: -12px; top: 8px; bottom: 8px;
							width: 3px; background: var(--pr); border-radius: 3px;
						"
					></div>
				{/if}
				<Icon name={item.icon} size={17} color={active ? 'var(--pr)' : 'var(--tx2)'} />
				<span style="flex: 1;">{item.label}</span>
			</button>
		{/each}
	</nav>

	<div style="flex: 1;"></div>

	<!-- Secondary nav -->
	<nav style="display: flex; flex-direction: column; gap: 2px; padding: 0 12px 12px;">
		{#if authStore.isAdmin}
			{@const active = activeId($page.url.pathname) === 'admin'}
			<button
				onclick={() => goto('/admin')}
				style="
					display: flex; align-items: center; gap: 11px;
					padding: 8px 12px; border-radius: var(--rs);
					background: {active ? 'var(--pr-fog)' : 'transparent'};
					border: none; cursor: pointer;
					font-size: 13.5px; color: {active ? 'var(--pr)' : 'var(--tx2)'};
					font-weight: {active ? '600' : '500'};
					font-family: var(--font);
					position: relative; text-align: left; width: 100%;
				"
			>
				<Icon name="shield" size={17} color={active ? 'var(--pr)' : 'var(--tx2)'} />
				<span>Admin</span>
			</button>
		{/if}
		{#each secondary as item (item.id)}
			{@const active = activeId($page.url.pathname) === item.id}
			<button
				onclick={() => goto(item.href)}
				style="
					display: flex; align-items: center; gap: 11px;
					padding: 8px 12px; border-radius: var(--rs);
					background: {active ? 'var(--pr-fog)' : 'transparent'};
					border: none; cursor: pointer;
					font-size: 13.5px; color: {active ? 'var(--pr)' : 'var(--tx2)'};
					font-weight: {active ? '600' : '500'};
					font-family: var(--font);
					position: relative; text-align: left; width: 100%;
				"
			>
				<Icon name={item.icon} size={17} color={active ? 'var(--pr)' : 'var(--tx2)'} />
				<span>{item.label}</span>
			</button>
		{/each}
	</nav>

	<!-- User chip -->
	<div
		style="
			border-top: 1px solid var(--bd);
			padding: 12px 16px;
			display: flex; align-items: center; gap: 10px;
		"
	>
		<div
			style="
				width: 34px; height: 34px; border-radius: 50%;
				background: var(--pr); color: #fff;
				display: flex; align-items: center; justify-content: center;
				font-size: 13px; font-weight: 600;
				flex-shrink: 0;
			"
		>
			{userInitials(authStore.user)}
		</div>
		<div style="flex: 1; min-width: 0;">
			<div
				style="font-size: 13px; font-weight: 600; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
			>
				{authStore.user?.firstname ?? ''}
				{authStore.user?.lastname ?? ''}
			</div>
			<div style="font-size: 11px; color: var(--tx3);">
				{authStore.isAdmin ? 'Admin' : 'Coach'}
			</div>
		</div>
		<button
			onclick={handleLogout}
			title="Sign out"
			style="
				width: 28px; height: 28px; border-radius: var(--rs);
				display: flex; align-items: center; justify-content: center;
				background: none; border: none; cursor: pointer;
				color: var(--tx3);
			"
		>
			<Icon name="logout" size={15} color="var(--tx3)" />
		</button>
	</div>
</aside>
