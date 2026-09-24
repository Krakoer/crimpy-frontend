export const authLabel =
	'display: block; font-size: 11px; color: var(--tx3-sm); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;';

export const authInput =
	'width: 100%; border: 1px solid var(--bd); border-radius: var(--rs); padding: 10px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx); outline: none; background: #fff;';

export const authPrimaryButton =
	'width: 100%; padding: 11px 16px; border-radius: var(--rs); background: var(--pr-dk); color: #fff; border: 1px solid var(--pr-dk); font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);';

export const authSecondaryButton =
	'padding: 9px 16px; border-radius: var(--rs); background: #fff; color: var(--tx); border: 1px solid var(--bd); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);';

const bannerTones = {
	error: 'border-color: var(--rd); background: var(--rd-lt); color: var(--rd-tx);',
	success: 'border-color: var(--gn); background: var(--gn-fog); color: var(--gn-tx);',
	notice: 'border-color: var(--bd); background: var(--panel2); color: var(--tx2);'
};

export type AuthBannerTone = keyof typeof bannerTones;

export function authBanner(tone: AuthBannerTone): string {
	return `border: 1px solid; border-radius: var(--rs); padding: 11px 13px; font-size: 12.5px; line-height: 1.5; ${bannerTones[tone]}`;
}

const badgeTones = {
	primary: 'background: var(--pr-fog); border-color: var(--pr-lt);',
	success: 'background: var(--gn-fog); border-color: #d8e5da;',
	error: 'background: var(--rd-lt); border-color: #f0dada;',
	gold: 'background: var(--gd-fog); border-color: #f0e3cd;'
};

export type AuthBadgeTone = keyof typeof badgeTones;

export function authBadge(tone: AuthBadgeTone): string {
	return `width: 52px; height: 52px; border-radius: 50%; border: 1px solid; display: inline-flex; align-items: center; justify-content: center; ${badgeTones[tone]}`;
}
