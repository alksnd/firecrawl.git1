import { config } from "../../config";
import type { FormatObject } from "../../controllers/v2/types";

type RouteInput = {
  url: string;
  formats?: FormatObject[] | unknown[];
  actions?: unknown[];
  zeroDataRetention?: boolean;
  lockdown?: boolean;
  flags?: { enrichBeta?: boolean } | null;
};

const SUPPORTED_FORMATS = new Set(["markdown", "json", "deterministicJson"]);
const PROFESSIONAL_NETWORK_SUCCESS_CREDITS = 15;

function parseConfiguredProfessionalNetworkUrl(inputUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(
    (config.ENRICH_URL_HOSTS ?? []).map(x => x.toLowerCase()),
  );

  return allowedHosts.size > 0 && allowedHosts.has(host) ? parsed : null;
}

export function isConfiguredProfessionalNetworkHost(inputUrl: string): boolean {
  return parseConfiguredProfessionalNetworkUrl(inputUrl) !== null;
}

export function getProfessionalNetworkRequestLogContext(inputUrl: string):
  | {
      url: string;
      host: string;
      pathPrefix: string | null;
    }
  | undefined {
  const parsed = parseConfiguredProfessionalNetworkUrl(inputUrl);
  if (!parsed) {
    return undefined;
  }

  return {
    url: parsed.href,
    host: parsed.hostname.toLowerCase(),
    pathPrefix:
      parsed.pathname
        .split("/")
        .map(part => part.trim())
        .filter(part => part.length > 0)[0] ?? null,
  };
}

export function getProfessionalNetworkResponseLogContext(meta: unknown): {
  cacheState?: string;
  cachedAt?: string;
  cacheAgeMs?: number;
  providerRequestId?: string;
} {
  if (typeof meta !== "object" || meta === null) {
    return {};
  }

  const record = meta as Record<string, unknown>;
  const requestId = record.request_id ?? record.requestId;

  return {
    ...(typeof record.cacheState === "string"
      ? { cacheState: record.cacheState }
      : {}),
    ...(typeof record.cachedAt === "string"
      ? { cachedAt: record.cachedAt }
      : {}),
    ...(typeof record.cacheAgeMs === "number"
      ? { cacheAgeMs: record.cacheAgeMs }
      : {}),
    ...(typeof requestId === "string" ? { providerRequestId: requestId } : {}),
  };
}

export function isSupportedProfessionalNetworkFormatRequest(
  formats?: FormatObject[] | unknown[],
): boolean {
  if (formats === undefined) {
    return true;
  }

  if (!Array.isArray(formats) || formats.length === 0) {
    return false;
  }

  return formats.every(format => {
    const type =
      typeof format === "string"
        ? format
        : typeof format === "object" && format !== null && "type" in format
          ? (format as { type?: unknown }).type
          : undefined;

    return typeof type === "string" && SUPPORTED_FORMATS.has(type);
  });
}

export function canBypassProfessionalNetworkBlocklist(
  input: RouteInput,
): boolean {
  if (input.flags?.enrichBeta !== true) {
    return false;
  }

  if (!config.FIRE_ENGINE_BETA_URL) {
    return false;
  }

  if (!input.url || !isConfiguredProfessionalNetworkHost(input.url)) {
    return false;
  }

  if (input.zeroDataRetention || input.lockdown) {
    return false;
  }

  if (Array.isArray(input.actions) && input.actions.length > 0) {
    return false;
  }

  return isSupportedProfessionalNetworkFormatRequest(input.formats);
}

export function getProfessionalNetworkSuccessCredits(
  input: RouteInput & { statusCode?: number | null },
): number | null {
  if (!canBypassProfessionalNetworkBlocklist(input)) {
    return null;
  }

  const statusCode = input.statusCode;
  if (
    statusCode === undefined ||
    statusCode === null ||
    !((statusCode >= 200 && statusCode < 300) || statusCode === 304)
  ) {
    return null;
  }

  return PROFESSIONAL_NETWORK_SUCCESS_CREDITS;
}
