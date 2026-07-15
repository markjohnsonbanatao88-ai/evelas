const fs = require("fs");
const path = require("path");

const PUBLIC_EMAIL = "esmaniedwin@gmail.com";
const LEGACY_EMAIL = "evelasenterprise@gmail.com";

module.exports = function handler(req, res) {
  try {
    const sourcePath = path.join(process.cwd(), "site.html");
    const html = fs
      .readFileSync(sourcePath, "utf8")
      .replaceAll(LEGACY_EMAIL, PUBLIC_EMAIL);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");
    return res.status(200).send(html);
  } catch (error) {
    console.error("Website rendering failed", error);
    return res.status(500).send("Website temporarily unavailable.");
  }
};
