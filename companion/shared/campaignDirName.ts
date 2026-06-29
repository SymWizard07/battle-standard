/** Characters illegal in Windows file/dir names (and problematic on other OSes). */
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Sanitize a campaign display name for use in a folder name segment. */
export function sanitizeCampaignName(name: string): string {
  const cleaned = name
    .trim()
    .replace(ILLEGAL_CHARS, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .slice(0, 80);
  return cleaned || 'Campaign';
}

/** Folder name under `campaigns/` — human-readable name plus stable id suffix. */
export function campaignFolderName(campaign: { id: string; name: string }): string {
  return `${sanitizeCampaignName(campaign.name)}--${campaign.id}`;
}

/** Parse campaign id from a folder name; legacy folders used the raw id only. */
export function campaignIdFromFolderName(folderName: string): string {
  const idx = folderName.lastIndexOf('--');
  if (idx === -1) return folderName;
  const id = folderName.slice(idx + 2);
  return id || folderName;
}

export function folderNameMatchesCampaignId(folderName: string, campaignId: string): boolean {
  if (folderName === campaignId) return true;
  return folderName.endsWith(`--${campaignId}`);
}
