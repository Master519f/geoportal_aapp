module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const target = req.query.url;
  if (!target) return res.status(200).json({ ok: false, error: 'missing url param' });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    clearTimeout(timer);
    res.status(200).json({ ok: true, url: resp.url });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
};
