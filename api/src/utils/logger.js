import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

const transport = isProd
  ? undefined
  : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } };

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "ENGINE_KEY",
      "INTERNAL_API_TOKEN",
      "password",
      "req.headers.authorization",
      "req.headers[\"x-internal-token\"]",
      "req.headers[\"x-engine-key\"]",
      "*.password",
      "*.token",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
  transport,
});

export default logger;
