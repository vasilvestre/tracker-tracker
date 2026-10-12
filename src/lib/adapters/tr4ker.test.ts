// src/lib/adapters/tr4ker.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Tr4kerAdapter } from "./tr4ker"

// Verbatim from a live GET https://tr4ker.net/api/me?apikey=... response.
const LIVE_RESPONSE = {
  id: 223479,
  username: "TheSnak",
  role: "user",
  power: 0,
  uploaded: 8960188708798,
  downloaded: 556658328355,
  bonus_upload: 53687091200,
  bonus_download: 1073741824,
  money: 20059,
  avatar_url: null,
  joined_at: "2026-08-08T14:37:30.007777Z",
  last_seen_at: "2026-10-09T18:54:38.432277Z",
}

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response

describe("Tr4kerAdapter", () => {
  const adapter = new Tr4kerAdapter()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("maps the live /api/me response into TrackerStats", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse(LIVE_RESPONSE))

    const stats = await adapter.fetchStats("https://tr4ker.net", "fake-token", "/api/me")

    expect(stats.username).toBe("TheSnak")
    expect(stats.group).toBe("User")
    expect(stats.uploadedBytes).toBe(8960188708798n)
    expect(stats.downloadedBytes).toBe(556658328355n)
    expect(stats.ratio).toBeCloseTo(8960188708798 / 556658328355, 4)
    expect(stats.bufferBytes).toBe(8960188708798n - 556658328355n)
    expect(stats.seedbonus).toBe(20059)
    expect(stats.remoteUserId).toBe(223479)
    expect(stats.joinedDate).toBe("2026-08-08T14:37:30.007777Z")
    expect(stats.lastAccessDate).toBe("2026-10-09T18:54:38.432277Z")
    expect(stats.avatarUrl).toBeUndefined()
  })

  it("title-cases the role and falls back to User when missing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okResponse({ ...LIVE_RESPONSE, role: "vip" })
    )

    const stats = await adapter.fetchStats("https://tr4ker.net", "fake-token", "/api/me")
    expect(stats.group).toBe("Vip")

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okResponse({ ...LIVE_RESPONSE, role: undefined })
    )
    const fallback = await adapter.fetchStats("https://tr4ker.net", "fake-token", "/api/me")
    expect(fallback.group).toBe("User")
  })

  it("defaults missing or null byte fields to 0n", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okResponse({ ...LIVE_RESPONSE, uploaded: undefined, downloaded: null })
    )

    const stats = await adapter.fetchStats("https://tr4ker.net", "fake-token", "/api/me")

    expect(stats.uploadedBytes).toBe(0n)
    expect(stats.downloadedBytes).toBe(0n)
    expect(stats.ratio).toBe(0)
  })

  it("accepts numeric-string byte fields", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      okResponse({ ...LIVE_RESPONSE, uploaded: "8960188708798", downloaded: "556658328355" })
    )

    const stats = await adapter.fetchStats("https://tr4ker.net", "fake-token", "/api/me")

    expect(stats.uploadedBytes).toBe(8960188708798n)
    expect(stats.downloadedBytes).toBe(556658328355n)
  })

  it("leaves fields TR4KER does not report as null", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse(LIVE_RESPONSE))

    const stats = await adapter.fetchStats("https://tr4ker.net", "fake-token", "/api/me")

    expect(stats.seedingCount).toBeNull()
    expect(stats.leechingCount).toBeNull()
    expect(stats.hitAndRuns).toBeNull()
    expect(stats.requiredRatio).toBeNull()
    expect(stats.warned).toBeNull()
    expect(stats.freeleechTokens).toBeNull()
  })

  it("puts the token in the apikey query param", async () => {
    let capturedUrl: string | undefined
    vi.spyOn(global, "fetch").mockImplementationOnce((url) => {
      capturedUrl = String(url)
      return Promise.resolve(okResponse(LIVE_RESPONSE))
    })

    await adapter.fetchStats("https://tr4ker.net", "secret-token", "/api/me")

    expect(capturedUrl).toBe("https://tr4ker.net/api/me?apikey=secret-token")
  })

  it("throws on a non-ok HTTP response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response)

    await expect(
      adapter.fetchStats("https://tr4ker.net", "bad-token", "/api/me")
    ).rejects.toThrow("401")
  })
})

describe("Tr4kerAdapter - fetchRaw", () => {
  const adapter = new Tr4kerAdapter()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the raw response for the debug view", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse(LIVE_RESPONSE))

    const calls = await adapter.fetchRaw("https://tr4ker.net", "token", "/api/me")

    expect(calls).toHaveLength(1)
    expect(calls[0].label).toBe("User Stats")
    expect(calls[0].endpoint).toBe("/api/me")
    expect(calls[0].error).toBeNull()
    expect(calls[0].data).toEqual(LIVE_RESPONSE)
  })

  it("reports an error DebugApiCall instead of throwing when fetch rejects", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("fetch failed"))

    const calls = await adapter.fetchRaw("https://tr4ker.net", "token", "/api/me")

    expect(calls[0].data).toBeNull()
    expect(calls[0].error).toBeTruthy()
    expect(calls[0].endpoint).toBe("/api/me")
  })
})
