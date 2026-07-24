module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Retry-After", "86400");

  return res.status(503).json({
    ok: false,
    error: "Inquiry service is currently offline.",
  });
};
