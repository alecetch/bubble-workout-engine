import express from "express";
import logger from "../utils/logger.js";

export const wellKnownRouter = express.Router();
let warnedMissingFingerprints = false;

wellKnownRouter.get("/.well-known/apple-app-site-association", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600").json({
    applinks: { details: [{
      appIDs: [process.env.APPLE_APP_ID ?? "NNHW7677GQ.fit.get200days.app"],
      components: [{ "/": "/ref/*" }],
    }] },
  });
});

wellKnownRouter.get("/.well-known/assetlinks.json", (_req, res) => {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (!fingerprints.length && !warnedMissingFingerprints) {
    warnedMissingFingerprints = true;
    logger.warn("ANDROID_CERT_SHA256 is unset or empty; Android App Links verification returns an empty list");
  }
  res.set("Cache-Control", "public, max-age=3600").json(fingerprints.length ? [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: process.env.ANDROID_PACKAGE_NAME ?? "fit.get200days.app",
      sha256_cert_fingerprints: fingerprints,
    },
  }] : []);
});
