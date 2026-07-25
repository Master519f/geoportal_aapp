module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    SCHEMA: process.env.SCHEMA || 'epmapaq',
    FOTO_BUCKET: process.env.FOTO_BUCKET || 'fotos-inspecciones',
    PROXY_BASE: process.env.PROXY_BASE || '',
  });
};
