import { parseHyroxResultsHtml } from "./ingestion/parseHyroxResultsHtml.js";
import { parseHyroxResultsText } from "./ingestion/parseHyroxResultsText.js";
import { detectHyroxDivisionFromUrl } from "./ingestion/detectHyroxDivision.js";
import { lookupHyroxEventByKey } from "./services/hyroxEventsService.js";

const RESULTS_URL_PREFIX = "https://results.hyrox.com/";
const FETCH_TIMEOUT_MS = 12000;

export function makeImportUrlHandler(pool = null) {
  return async function importUrl(req, res) {
    const url = String(req.body?.url ?? "").trim();
    if (!url.startsWith(RESULTS_URL_PREFIX)) {
      return res.status(400).json({ error: "invalid_url" });
    }

    let resultsPageKey = null;
    try {
      resultsPageKey = new URL(url).searchParams.get("event_main_group");
    } catch {
      resultsPageKey = null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timer);
        return res.status(200).json({ success: false, reason: "fetch_failed", status: response.status });
      }

      const body = await response.text();
      clearTimeout(timer);

      const htmlResult = parseHyroxResultsHtml(body);
      const parsed = htmlResult.confidence !== "low" ? htmlResult : parseHyroxResultsText(body);

      if (parsed.confidence === "low") {
        return res.status(200).json({ success: false, reason: "no_splits_found" });
      }

      let eventDate = null;
      let eventName = null;
      const eventLookupKey = resultsPageKey ?? parsed.raceName ?? null;
      if (pool && eventLookupKey) {
        try {
          const event = await lookupHyroxEventByKey(pool, eventLookupKey);
          eventDate = event?.startDate ?? null;
          eventName = event?.eventName ?? null;
        } catch {
          eventDate = null;
          eventName = null;
        }
      }

      const divisionDetection = detectHyroxDivisionFromUrl(url);

      return res.status(200).json({
        success: true,
        parsed,
        divisionDetection,
        ...(eventDate ? { eventDate, eventName } : {}),
      });
    } catch (err) {
      clearTimeout(timer);
      const reason = err?.name === "AbortError" ? "timeout" : "fetch_failed";
      return res.status(200).json({ success: false, reason });
    }
  };
}

export const importUrl = makeImportUrlHandler();
