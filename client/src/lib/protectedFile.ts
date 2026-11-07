import { api } from '@/lib/api';

/**
 * Opens a protected file (a lab result, task 3.5) in a new tab. The file is
 * fetched with the signed-in person's token, never through a public link, and
 * handed to the browser as a temporary blob URL.
 */
export async function openProtectedFile(url: string) {
  // The tab is opened first, inside the click, so pop-up blockers allow it.
  const tab = window.open('', '_blank');
  try {
    const { data } = await api.get<Blob>(url, { responseType: 'blob' });
    const href = URL.createObjectURL(data);
    if (tab) tab.location.href = href;
    else window.location.assign(href);
    // Long enough for the tab to load it.
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
