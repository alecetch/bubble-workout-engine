function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildMobileLandingPage({ eventName, caption = "", downloadUrl = "#", slideLinks = [], expired = false, notFound = false } = {}) {
  if (notFound) return errorPage("We couldn't find this share pack. Please check the link or generate a new one.");
  if (expired) return errorPage("This share pack link has expired. Please generate a new pack from your Forma report.");

  const slideItems = slideLinks
    .map((url, i) => `<li><a class="slide-link" href="${escapeHtml(url)}" download>Download slide ${i + 1}</a></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Your HYROX Instagram Pack | Forma</title>
  <style>
    body { margin: 0; background: #080e1a; color: #f5f7fb; font-family: system-ui, sans-serif; padding: 28px 20px; }
    h1 { color: #08a7f5; font-size: 22px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    p { color: rgba(232,238,248,0.6); font-size: 14px; }
    .btn { display: block; width: 100%; box-sizing: border-box; padding: 16px; border: none; border-radius: 6px; background: #08a7f5; color: #07101e; font-weight: 700; font-size: 16px; text-decoration: none; text-align: center; margin: 12px 0; cursor: pointer; }
    .btn.outline { background: transparent; border: 1px solid #08a7f5; color: #08a7f5; }
    .slide-links { list-style: none; padding: 0; margin: 0; }
    .slide-link { display: block; color: #08a7f5; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 15px; }
    .caption-box { background: #0d1422; border-radius: 6px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 16px 0; }
    .copied { display: none; color: #08a7f5; font-size: 13px; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Your Instagram Pack</h1>
  <p>${escapeHtml(eventName ?? "HYROX analysis")}</p>

  <a class="btn" href="${escapeHtml(downloadUrl)}" download>Download ZIP</a>

  <p style="margin-top:24px;font-weight:600;">Individual slides</p>
  <ul class="slide-links">${slideItems}</ul>

  <p style="margin-top:24px;font-weight:600;">Caption</p>
  <div class="caption-box" id="cap">${escapeHtml(caption)}</div>
  <button class="btn outline" onclick="copyCaption()">Copy caption</button>
  <div class="copied" id="copied">Copied!</div>

  <script>
    function copyCaption() {
      const text = document.getElementById('cap').innerText;
      navigator.clipboard?.writeText(text).then(function () {
        document.getElementById('copied').style.display = 'block';
        setTimeout(function () { document.getElementById('copied').style.display = 'none'; }, 2000);
      }).catch(function () { alert('Select and copy the caption manually.'); });
    }
  </script>
</body>
</html>`;
}

function errorPage(message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Forma</title>
  <style>body{margin:0;background:#080e1a;color:#f5f7fb;font-family:system-ui,sans-serif;padding:40px 24px;text-align:center}
  h1{color:#08a7f5;font-size:20px}p{color:rgba(232,238,248,0.6);font-size:15px}</style></head>
  <body><h1>FORMA</h1><p>${escapeHtml(message)}</p></body></html>`;
}
