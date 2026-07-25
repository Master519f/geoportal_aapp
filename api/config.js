module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).json({
    SUPABASE_URL: (process.env.SUPABASE_URL || '').trim(),
    SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim(),
    SCHEMA: (process.env.SCHEMA || '').trim() || 'epmapaq',
    FOTO_BUCKET: (process.env.FOTO_BUCKET || '').trim() || 'fotos-inspecciones',
  });
};
