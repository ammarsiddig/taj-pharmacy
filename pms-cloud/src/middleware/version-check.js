const MIN_CLIENT_VERSION = 1;
const SERVER_API_VERSION = 1;

export default function versionCheck(req, res, next) {
  // Always advertise server version so clients can detect "update available".
  res.set('X-PMS-Server-Version', String(SERVER_API_VERSION));

  // Missing header = legacy client (pre-version-check rollout). Allow.
  // Only block if the header IS present but reports a version older
  // than the floor. This prevents breaking any in-the-wild desktop
  // install that hasn't yet been updated to send the header.
  const raw = req.headers['x-pms-client-version'];
  if (raw === undefined) {
    return next();
  }
  const clientVersion = parseInt(raw, 10);
  if (Number.isNaN(clientVersion) || clientVersion < MIN_CLIENT_VERSION) {
    return res.status(426).json({ error: 'Upgrade required. Please update the desktop app.' });
  }
  next();
}
