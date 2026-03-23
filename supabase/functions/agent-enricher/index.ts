import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

const CENSUS_API_BASE = 'https://api.census.gov/data'
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const HUD_API_BASE = 'https://www.huduser.gov/hudapi/public'

const CACHE_TTLS: Record<string, number> = {
  census_acs: 90 * 24 * 60 * 60 * 1000,  // 90 days
  fred_rates: 24 * 60 * 60 * 1000,        // 24 hours
  hud_fmr: 180 * 24 * 60 * 60 * 1000,    // 180 days
}

serve(async (req) => {
  try {
    const { region, region_type, data_types } = await req.json()
    const supabase = createAdminClient()
    const results: Record<string, any> = {}

    for (const dataType of data_types) {
      // Check cache first
      const { data: cached } = await supabase
        .from('market_data')
        .select('data, expires_at')
        .eq('region', region)
        .eq('region_type', region_type)
        .eq('data_type', dataType)
        .single()

      if (cached && new Date(cached.expires_at) > new Date()) {
        results[dataType] = cached.data
        continue
      }

      // Fetch fresh data
      let freshData: any = null
      try {
        if (dataType === 'census_acs') {
          freshData = await fetchCensusData(region, region_type)
        } else if (dataType === 'fred_rates') {
          freshData = await fetchFredData()
        } else if (dataType === 'hud_fmr') {
          freshData = await fetchHudData(region)
        }
      } catch (e) {
        results[dataType] = { error: `Failed to fetch: ${e.message}`, stale: cached?.data ?? null }
        continue
      }

      if (freshData) {
        const expiresAt = new Date(Date.now() + CACHE_TTLS[dataType]).toISOString()
        await supabase.from('market_data').upsert({
          region, region_type, data_type: dataType,
          data: freshData, fetched_at: new Date().toISOString(), expires_at: expiresAt,
        }, { onConflict: 'region,region_type,data_type' })
        results[dataType] = freshData
      }
    }

    return new Response(JSON.stringify({ results, fetched_at: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function fetchCensusData(region: string, regionType: string) {
  // ACS 5-year estimates: median income, population, housing units
  const censusKey = Deno.env.get('CENSUS_API_KEY') || ''
  const geoParam = regionType === 'zip' ? `zip%20code%20tabulation%20area:${region}` : `county:${region}`
  const url = `${CENSUS_API_BASE}/2023/acs/acs5?get=B19013_001E,B01003_001E,B25001_001E&for=${geoParam}&key=${censusKey}`

  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()
  if (data.length < 2) return null

  const [headers, values] = [data[0], data[1]]
  return {
    median_income: parseInt(values[0]) || null,
    population: parseInt(values[1]) || null,
    housing_units: parseInt(values[2]) || null,
  }
}

async function fetchFredData() {
  const fredKey = Deno.env.get('FRED_API_KEY') || ''
  const url = `${FRED_API_BASE}?series_id=MORTGAGE30US&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`

  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()

  return {
    mortgage_30yr: parseFloat(data.observations?.[0]?.value) || null,
    as_of: data.observations?.[0]?.date || null,
  }
}

async function fetchHudData(zip: string) {
  const hudToken = Deno.env.get('HUD_API_TOKEN') || ''
  const url = `${HUD_API_BASE}/fmr/data/${zip}?year=2025`

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${hudToken}` },
  })
  if (!resp.ok) return null
  const data = await resp.json()

  return {
    fmr_0br: data.data?.basicdata?.fmr_0 || null,
    fmr_1br: data.data?.basicdata?.fmr_1 || null,
    fmr_2br: data.data?.basicdata?.fmr_2 || null,
    fmr_3br: data.data?.basicdata?.fmr_3 || null,
    fmr_4br: data.data?.basicdata?.fmr_4 || null,
    year: data.data?.year || null,
  }
}
