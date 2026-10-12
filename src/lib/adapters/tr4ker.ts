// src/lib/adapters/tr4ker.ts
//
// Functions: toBytes, Tr4kerAdapter

import { computeBufferBytes, computeRatio } from "@/lib/data-transforms"
import { adapterFetch } from "./adapter-fetch"
import type {
  DebugApiCall,
  FetchOptions,
  TrackerAdapter,
  TrackerStats,
} from "./types"

// ---------------------------------------------------------------------------
// TR4KER exposes a minimal JSON "me" endpoint. Auth is a query param
// (`?apikey=...`), not a Bearer header, so none of UNIT3D's probe-and-remember
// auth machinery applies here. uploaded/downloaded arrive as raw byte
// integers, and a bad or missing key is a plain HTTP 401.
// ---------------------------------------------------------------------------

interface Tr4kerApiResponse {
  id: number
  username?: string
  role?: string
  uploaded?: number | string | null
  downloaded?: number | string | null
  money?: number | null
  avatar_url?: string | null
  joined_at?: string
  last_seen_at?: string
}

/**
 * Converts an uploaded/downloaded field to a bigint, defensively.
 *
 * The live API sends raw byte integers, but a missing field or a numeric
 * string must not fail the poll. `BigInt(Math.trunc(Number(v)))` throws on
 * NaN/Infinity, so non-finite values fall back to 0n alongside null/undefined.
 */
function toBytes(value: number | string | null | undefined): bigint {
  if (value === undefined || value === null) return 0n
  const n = Number(value)
  return Number.isFinite(n) ? BigInt(Math.trunc(n)) : 0n
}

export class Tr4kerAdapter implements TrackerAdapter {
  async fetchStats(
    baseUrl: string,
    apiToken: string,
    apiPath: string,
    options?: FetchOptions
  ): Promise<TrackerStats> {
    const hostname = new URL(baseUrl).hostname
    const url = new URL(apiPath, baseUrl)
    url.searchParams.set("apikey", apiToken)

    const data = await adapterFetch<Tr4kerApiResponse>(url.toString(), hostname, options)

    const uploadedBytes = toBytes(data.uploaded)
    const downloadedBytes = toBytes(data.downloaded)

    // role arrives lowercased ("user"); title-case it for display.
    const role = data.role?.trim()
    const group = role ? role.charAt(0).toUpperCase() + role.slice(1) : "User"

    return {
      username: data.username ?? "",
      group,
      uploadedBytes,
      downloadedBytes,
      // Derived from byte totals, not reported: TR4KER sends no ratio field.
      ratio: computeRatio(uploadedBytes, downloadedBytes),
      bufferBytes: computeBufferBytes(uploadedBytes, downloadedBytes),
      seedingCount: null,
      leechingCount: null,
      seedbonus: typeof data.money === "number" ? data.money : null,
      hitAndRuns: null,
      requiredRatio: null,
      warned: null,
      freeleechTokens: null,
      remoteUserId: data.id,
      joinedDate: data.joined_at,
      lastAccessDate: data.last_seen_at,
      avatarUrl: data.avatar_url ?? undefined,
    }
  }

  async fetchRaw(
    baseUrl: string,
    apiToken: string,
    apiPath: string,
    options?: FetchOptions
  ): Promise<DebugApiCall[]> {
    const hostname = new URL(baseUrl).hostname
    const url = new URL(apiPath, baseUrl)
    url.searchParams.set("apikey", apiToken)

    try {
      const data = await adapterFetch<Record<string, unknown>>(url.toString(), hostname, options)
      return [{ label: "User Stats", endpoint: apiPath, data, error: null }]
    } catch (err) {
      return [
        {
          label: "User Stats",
          endpoint: apiPath,
          data: null,
          error: err instanceof Error ? err.message : "Request failed",
        },
      ]
    }
  }
}
