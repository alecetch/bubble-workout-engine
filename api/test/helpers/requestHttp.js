import { request } from "node:http";

// Node fetch versions differ in whether they preserve an explicit Host header.
export function requestHttp(url, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}
