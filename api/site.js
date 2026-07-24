module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Retry-After", "86400");

  return res.status(503).send("Website is currently offline.");
};
