import { Router } from 'express';

const router = Router();

const GITHUB_RELEASE_API = 'https://api.github.com/repos/ammarsiddig/taj-pharmacy/releases/latest';
const GITHUB_DOWNLOAD_BASE = 'https://github.com/ammarsiddig/taj-pharmacy/releases/download';
const FALLBACK_URL = 'https://taj.systems/download/TAJ-Pharmacy-Setup.exe';

/**
 * GET /v1/download/latest
 * Public — returns the latest installer download info from GitHub Releases.
 */
router.get('/v1/download/latest', async (_req, res) => {
  try {
    const ghRes = await fetch(GITHUB_RELEASE_API, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'taj-pharmacy/1.0',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!ghRes.ok) {
      return res.json({
        version: '',
        url: FALLBACK_URL,
        notes: null,
        published_at: null,
        source: 'fallback',
      });
    }

    const release = await ghRes.json();
    const exe = (release.assets || []).find(
      (a) => a.name && a.name.endsWith('.exe') && a.name.toLowerCase().includes('setup')
    );

    res.json({
      version: (release.tag_name || '').replace(/^v/, ''),
      url: exe ? exe.browser_download_url : `${GITHUB_DOWNLOAD_BASE}/${release.tag_name}`,
      notes: release.body || null,
      published_at: release.published_at || null,
      source: 'github',
    });
  } catch {
    res.json({
      version: '',
      url: FALLBACK_URL,
      notes: null,
      published_at: null,
      source: 'fallback',
    });
  }
});

export default router;
