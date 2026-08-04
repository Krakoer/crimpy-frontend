<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sidebar from './Sidebar.svelte';
	import Icon from './Icon.svelte';
	import { goto } from '$app/navigation';

	interface Breadcrumb {
		label: string;
		href?: string;
	}

	let {
		title,
		documentTitle,
		breadcrumbs = [],
		actions,
		children
	}: {
		title: string;
		documentTitle?: string;
		breadcrumbs?: Breadcrumb[];
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{documentTitle ?? title} - Crimpy</title>
</svelte:head>

<div
	style="
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: var(--bg);
		font-family: var(--font);
	"
>
	<Sidebar />

	<div style="display: flex; flex-direction: column; flex: 1; overflow: hidden; min-width: 0;">
		<!-- Topbar -->
		<header
			style="
				display: flex; align-items: center;
				padding: 18px 32px;
				border-bottom: 1px solid var(--bd);
				background: var(--panel);
				gap: 14px; flex-shrink: 0;
			"
		>
			<div style="flex: 1; min-width: 0;">
				{#if breadcrumbs.length > 0}
					<div
						style="
							display: flex; align-items: center; gap: 6px;
							font-size: 11.5px; color: var(--tx3); margin-bottom: 4px;
						"
					>
						{#each breadcrumbs as crumb, i (i)}
							{#if i > 0}
								<Icon name="chevron" size={11} color="var(--tx3)" />
							{/if}
							{#if crumb.href}
								<button
									onclick={() => goto(crumb.href!)}
									style="
										cursor: pointer; color: var(--tx3);
										background: none; border: none;
										font-size: 11.5px; font-family: var(--font); padding: 0;
									"
								>
									{crumb.label}
								</button>
							{:else}
								<span style="color: {i === breadcrumbs.length - 1 ? 'var(--tx2)' : 'var(--tx3)'};">
									{crumb.label}
								</span>
							{/if}
						{/each}
					</div>
				{/if}
				<h1
					style="font-size: 21px; font-weight: 700; color: var(--tx); letter-spacing: -0.02em; line-height: 1.2;"
				>
					{title}
				</h1>
			</div>
			<div style="display: flex; align-items: center; gap: 10px;">
				<button
					style="
						display: flex; align-items: center; justify-content: center;
						width: 36px; height: 36px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: #fff;
						cursor: pointer; position: relative;
					"
					aria-label="Notifications"
				>
					<Icon name="bell" size={16} color="var(--tx2)" />
					<span
						style="
							position: absolute; top: 7px; right: 8px;
							width: 7px; height: 7px; border-radius: 50%;
							background: var(--pr); border: 1.5px solid #fff;
						"
					></span>
				</button>
				{#if actions}
					{@render actions()}
				{/if}
			</div>
		</header>

		<!-- Scrollable content -->
		<main style="flex: 1; overflow-y: auto; background: var(--bg);">
			{@render children()}
		</main>
	</div>
</div>
