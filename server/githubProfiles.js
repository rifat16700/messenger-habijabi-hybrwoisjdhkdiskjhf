// ============================================================
//  GitHub Profile Storage
//  Public user profiles are stored as JSON files in GitHub repo
//  profiles/{userId}.json
//  Reading: raw.githubusercontent.com (free, no auth)
//  Writing: GitHub REST API (needs GITHUB_TOKEN)
// ============================================================

const https = require('https');

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER  = process.env.GITHUB_OWNER || 'rifat16700';
const GITHUB_REPO   = process.env.GITHUB_REPO  || 'messenger-habijabi-hybrwoisjdhkdiskjhf';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// ── Raw read URL (no auth needed) ──
function rawUrl(userId) {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/profiles/${userId}.json`;
}

// ── GitHub API helper ──
function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'HybridEngine-Messenger',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Get current file SHA (required for update) ──
async function getFileSha(userId) {
  try {
    const res = await githubRequest('GET',
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/profiles/${userId}.json`
    );
    if (res.status === 200) return res.body.sha;
  } catch (e) { /* file doesn't exist yet */ }
  return null;
}

// ── Save/update profile to GitHub ──
async function saveProfile(userId, profileData) {
  if (!GITHUB_TOKEN) {
    console.warn('[GitHubProfiles] No GITHUB_TOKEN set — skipping GitHub save');
    return false;
  }

  try {
    const content = Buffer.from(JSON.stringify(profileData, null, 2)).toString('base64');
    const sha = await getFileSha(userId);

    const body = {
      message: `Update profile: ${profileData.username || userId}`,
      content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    };

    const res = await githubRequest('PUT',
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/profiles/${userId}.json`,
      body
    );

    if (res.status === 200 || res.status === 201) {
      console.log(`[GitHubProfiles] Saved profile for ${userId}`);
      return true;
    }
    console.error('[GitHubProfiles] Save failed:', res.status, res.body?.message);
    return false;
  } catch (e) {
    console.error('[GitHubProfiles] Error:', e.message);
    return false;
  }
}

// ── Delete profile from GitHub (when user deleted) ──
async function deleteProfile(userId) {
  if (!GITHUB_TOKEN) return false;
  try {
    const sha = await getFileSha(userId);
    if (!sha) return true; // already doesn't exist
    const res = await githubRequest('DELETE',
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/profiles/${userId}.json`,
      { message: `Delete profile: ${userId}`, sha, branch: GITHUB_BRANCH }
    );
    return res.status === 200;
  } catch (e) {
    console.error('[GitHubProfiles] Delete error:', e.message);
    return false;
  }
}

// ── Public profile URL (for frontend to use directly) ──
function getPublicProfileUrl(userId) {
  return rawUrl(userId);
}

module.exports = { saveProfile, deleteProfile, getPublicProfileUrl };
