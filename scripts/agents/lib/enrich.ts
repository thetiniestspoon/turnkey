export type EnrichResult = { results: Record<string, unknown>; fetched_at?: string }

export async function enrichMarket(args: {
  url: string
  key: string
  region: string
  region_type?: 'zip' | 'county' | 'metro'
  data_types: string[]
  lat?: number
  lng?: number
}): Promise<EnrichResult> {
  const base = args.url.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/functions/v1/agent-enricher`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: args.region,
        region_type: args.region_type ?? 'zip',
        data_types: args.data_types,
        ...(args.lat != null && args.lng != null ? { lat: args.lat, lng: args.lng } : {}),
      }),
    })
    if (!res.ok) {
      console.error(`  enrichMarket ${args.region}: HTTP ${res.status} — proceeding without enrichment`)
      return { results: {} }
    }
    return (await res.json()) as EnrichResult
  } catch (e) {
    console.error(`  enrichMarket ${args.region}: ${String((e as Error).message ?? e)} — proceeding without enrichment`)
    return { results: {} }
  }
}
