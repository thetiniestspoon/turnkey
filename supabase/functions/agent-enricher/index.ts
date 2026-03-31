import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders } from '../_shared/cors.ts'

const CENSUS_API_BASE = 'https://api.census.gov/data'
const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const HUD_API_BASE = 'https://www.huduser.gov/hudapi/public'
const BLS_API_BASE = 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
const FEMA_NFHL_BASE = 'https://services.arcgis.com/2gdL2gxYNFY2TOUb/arcgis/rest/services/FEMA_National_Flood_Hazard_Layer/FeatureServer/0/query'

const CACHE_TTLS: Record<string, number> = {
  census_acs: 90 * 24 * 60 * 60 * 1000,     // 90 days
  fred_rates: 24 * 60 * 60 * 1000,           // 24 hours
  hud_fmr: 180 * 24 * 60 * 60 * 1000,       // 180 days
  bls_unemployment: 30 * 24 * 60 * 60 * 1000, // 30 days
  fema_flood: 30 * 24 * 60 * 60 * 1000,      // 30 days
  walkability: 90 * 24 * 60 * 60 * 1000,     // 90 days
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { region, region_type, data_types, lat, lng } = await req.json()
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: Record<string, any> = {}

    for (const dataType of data_types) {
      // Check cache first
      const cacheKey = (dataType === 'fema_flood' && lat && lng) ? `${lat},${lng}` : region
      const { data: cached } = await supabase
        .from('market_data')
        .select('data, expires_at')
        .eq('region', cacheKey)
        .eq('region_type', region_type)
        .eq('data_type', dataType)
        .single()

      if (cached && new Date(cached.expires_at) > new Date()) {
        results[dataType] = cached.data
        continue
      }

      // Fetch fresh data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let freshData: any = null
      try {
        if (dataType === 'census_acs') {
          freshData = await fetchCensusData(region, region_type)
        } else if (dataType === 'fred_rates') {
          freshData = await fetchFredData()
        } else if (dataType === 'hud_fmr') {
          freshData = await fetchHudData(region)
        } else if (dataType === 'bls_unemployment') {
          freshData = await fetchBlsUnemployment(region, region_type)
        } else if (dataType === 'fema_flood' && lat && lng) {
          freshData = await fetchFemaFloodZone(lat, lng)
        } else if (dataType === 'walkability' && lat && lng) {
          freshData = await fetchWalkability(lat, lng)
        }
      } catch (e) {
        results[dataType] = { error: `Failed to fetch: ${e.message}`, stale: cached?.data ?? null }
        continue
      }

      if (freshData) {
        const ttl = CACHE_TTLS[dataType] || 90 * 24 * 60 * 60 * 1000
        const expiresAt = new Date(Date.now() + ttl).toISOString()
        await supabase.from('market_data').upsert({
          region: cacheKey, region_type, data_type: dataType,
          data: freshData, fetched_at: new Date().toISOString(), expires_at: expiresAt,
        }, { onConflict: 'region,region_type,data_type' })
        results[dataType] = freshData
      }
    }

    return new Response(JSON.stringify({ results, fetched_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// === EXISTING SOURCES ===

async function fetchCensusData(region: string, regionType: string) {
  const censusKey = Deno.env.get('CENSUS_API_KEY') || ''
  // Expanded: +vacancy rate, +median home value, +median rent, +owner-occupied %
  const vars = 'B19013_001E,B01003_001E,B25001_001E,B25002_003E,B25077_001E,B25064_001E,B25003_002E'
  const geoParam = regionType === 'zip' ? `zip%20code%20tabulation%20area:${region}` : `county:${region}`
  const url = `${CENSUS_API_BASE}/2023/acs/acs5?get=${vars}&for=${geoParam}&key=${censusKey}`

  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()
  if (data.length < 2) return null

  const values = data[1]
  const totalUnits = parseInt(values[2]) || 0
  const vacantUnits = parseInt(values[3]) || 0
  const ownerOccupied = parseInt(values[6]) || 0

  return {
    median_income: parseInt(values[0]) || null,
    population: parseInt(values[1]) || null,
    housing_units: totalUnits || null,
    vacant_units: vacantUnits || null,
    vacancy_rate: totalUnits > 0 ? Math.round((vacantUnits / totalUnits) * 1000) / 10 : null,
    median_home_value: parseInt(values[4]) || null,
    median_rent: parseInt(values[5]) || null,
    owner_occupied_units: ownerOccupied || null,
    owner_occupied_pct: totalUnits > 0 ? Math.round((ownerOccupied / totalUnits) * 1000) / 10 : null,
  }
}

async function fetchFredData() {
  const fredKey = Deno.env.get('FRED_API_KEY') || ''
  // Fetch multiple series: 30yr mortgage + 10yr treasury + unemployment rate
  const series = [
    { id: 'MORTGAGE30US', name: 'mortgage_30yr' },
    { id: 'DGS10', name: 'treasury_10yr' },
    { id: 'UNRATE', name: 'national_unemployment' },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}
  for (const s of series) {
    try {
      const url = `${FRED_API_BASE}?series_id=${s.id}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`
      const resp = await fetch(url)
      if (resp.ok) {
        const data = await resp.json()
        result[s.name] = parseFloat(data.observations?.[0]?.value) || null
        result[`${s.name}_date`] = data.observations?.[0]?.date || null
      }
    } catch { /* skip failed series */ }
  }
  return Object.keys(result).length > 0 ? result : null
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

// === NEW SOURCES ===

async function fetchBlsUnemployment(region: string, regionType: string) {
  // BLS Local Area Unemployment Statistics (LAUS)
  // Series ID format: LAUCN + FIPS code + 0000000003 (unemployment rate)
  // For ZIP, we'd need a ZIP-to-county crosswalk. Use state-level as fallback.
  const blsKey = Deno.env.get('BLS_API_KEY') || ''

  // Map common state abbreviations to FIPS for state-level unemployment
  // For a ZIP, we'll use the first 2 digits to guess the state FIPS (imprecise but useful)
  // Better: use Census geocoder to get county FIPS, then query county LAUS
  const seriesId = regionType === 'zip'
    ? `LASST${zipToStateFips(region)}0000000003` // State-level from ZIP prefix
    : `LAUCN${region}0000000003` // County-level

  const resp = await fetch(BLS_API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seriesid: [seriesId],
      startyear: String(new Date().getFullYear() - 1),
      endyear: String(new Date().getFullYear()),
      registrationkey: blsKey,
    }),
  })

  if (!resp.ok) return null
  const data = await resp.json()
  const series = data?.Results?.series?.[0]?.data
  if (!series || series.length === 0) return null

  // Most recent observation
  const latest = series[0]
  return {
    unemployment_rate: parseFloat(latest.value) || null,
    period: latest.periodName || null,
    year: latest.year || null,
    series_id: seriesId,
  }
}

async function fetchFemaFloodZone(lat: number, lng: number) {
  // Query FEMA NFHL by point geometry
  const geometry = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } })
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE',
    returnGeometry: 'false',
    f: 'pjson',
  })

  const url = `${FEMA_NFHL_BASE}?${params.toString()}`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()

  const features = data.features || []
  if (features.length === 0) {
    return {
      flood_zone: 'X',
      zone_description: 'No FEMA flood data at this location (likely minimal risk)',
      in_sfha: false,
      base_flood_elevation: null,
    }
  }

  const attrs = features[0].attributes
  const zone = attrs.FLD_ZONE || 'Unknown'
  const inSfha = attrs.SFHA_TF === 'T'

  const zoneDescriptions: Record<string, string> = {
    'A': 'High risk - 1% annual chance of flooding (no base elevation)',
    'AE': 'High risk - 1% annual chance of flooding (base elevation determined)',
    'AH': 'High risk - shallow flooding (1-3 ft)',
    'AO': 'High risk - sheet flow on sloped terrain',
    'V': 'High risk - coastal flooding with wave action',
    'VE': 'High risk - coastal flooding with wave action (base elevation)',
    'X': 'Minimal to moderate risk',
    'B': 'Moderate risk (0.2% annual chance)',
    'C': 'Minimal risk',
    'D': 'Undetermined risk',
  }

  return {
    flood_zone: zone,
    zone_subtype: attrs.ZONE_SUBTY || null,
    zone_description: zoneDescriptions[zone] || `Zone ${zone}`,
    in_sfha: inSfha,
    base_flood_elevation: attrs.STATIC_BFE || null,
    risk_level: inSfha ? 'HIGH' : (['B', 'X'].includes(zone) ? 'LOW' : 'MODERATE'),
  }
}

async function fetchWalkability(lat: number, lng: number) {
  // OSM Overpass API — count amenities within ~1km to compute walkability proxy
  // No API key needed, completely free. Fallback chain of mirrors for reliability.
  const OVERPASS_MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ]
  const RADIUS = 1000 // meters

  // Categories that matter for walkability, with Overpass tags
  const queries: { category: string; filter: string }[] = [
    { category: 'transit', filter: 'node["public_transport"="stop_position"]' },
    { category: 'transit', filter: 'node["highway"="bus_stop"]' },
    { category: 'transit', filter: 'node["railway"="station"]' },
    { category: 'transit', filter: 'node["railway"="halt"]' },
    { category: 'grocery', filter: 'node["shop"="supermarket"]' },
    { category: 'grocery', filter: 'node["shop"="convenience"]' },
    { category: 'grocery', filter: 'node["shop"="greengrocer"]' },
    { category: 'restaurant', filter: 'node["amenity"="restaurant"]' },
    { category: 'restaurant', filter: 'node["amenity"="cafe"]' },
    { category: 'restaurant', filter: 'node["amenity"="fast_food"]' },
    { category: 'retail', filter: 'node["shop"="clothes"]' },
    { category: 'retail', filter: 'node["shop"="department_store"]' },
    { category: 'retail', filter: 'node["shop"~"hardware|electronics|books|variety_store"]' },
    { category: 'healthcare', filter: 'node["amenity"="pharmacy"]' },
    { category: 'healthcare', filter: 'node["amenity"~"clinic|doctors|hospital"]' },
    { category: 'school', filter: 'node["amenity"~"school|kindergarten"]' },
    { category: 'park', filter: 'node["leisure"="park"]' },
    { category: 'park', filter: 'way["leisure"="park"]' },
  ]

  // Use a bbox instead of around() for better Overpass performance
  // ~1km ≈ ±0.009 lat, ±0.012 lng at NJ latitude
  const dlat = 0.009
  const dlng = 0.012
  const south = lat - dlat
  const north = lat + dlat
  const west = lng - dlng
  const east = lng + dlng

  const overpassQuery = `[out:json][timeout:25][bbox:${south},${west},${north},${east}];(node["amenity"~"restaurant|cafe|fast_food|pharmacy|clinic|doctors|hospital|school|kindergarten"];node["shop"~"supermarket|convenience|greengrocer|clothes|department_store|hardware|electronics|books"];node["public_transport"="stop_position"];node["highway"="bus_stop"];node["railway"~"station|halt"];nwr["leisure"="park"];);out tags center;`

  let data: { elements: Array<{ type: string; tags?: Record<string, string> }> } | null = null
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const resp = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(overpassQuery),
      })
      if (resp.ok) {
        data = await resp.json()
        break
      }
    } catch { /* try next mirror */ }
  }

  if (!data) {
    throw new Error('All Overpass mirrors failed')
  }
  const elements = data.elements || []

  // Classify each element into a category
  const counts: Record<string, number> = {
    transit: 0, grocery: 0, restaurant: 0, retail: 0,
    healthcare: 0, school: 0, park: 0,
  }

  for (const el of elements) {
    const tags = el.tags || {}
    if (tags.public_transport || tags.highway === 'bus_stop' || tags.railway === 'station' || tags.railway === 'halt') {
      counts.transit++
    } else if (tags.shop === 'supermarket' || tags.shop === 'convenience' || tags.shop === 'greengrocer') {
      counts.grocery++
    } else if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food') {
      counts.restaurant++
    } else if (tags.shop && !['supermarket', 'convenience', 'greengrocer'].includes(tags.shop)) {
      counts.retail++
    } else if (tags.amenity === 'pharmacy' || tags.amenity === 'clinic' || tags.amenity === 'doctors' || tags.amenity === 'hospital') {
      counts.healthcare++
    } else if (tags.amenity === 'school' || tags.amenity === 'kindergarten') {
      counts.school++
    } else if (tags.leisure === 'park') {
      counts.park++
    }
  }

  // Scoring: each category contributes a weighted sub-score
  // Thresholds are "how many within 1km = full marks for that category"
  const weights: Record<string, { weight: number; threshold: number }> = {
    transit:    { weight: 25, threshold: 5 },  // 5+ transit stops = full transit score
    grocery:    { weight: 20, threshold: 3 },  // 3+ grocery options
    restaurant: { weight: 15, threshold: 8 },  // 8+ restaurants/cafes
    retail:     { weight: 15, threshold: 5 },  // 5+ shops
    healthcare: { weight: 10, threshold: 2 },  // 2+ pharmacies/clinics
    school:     { weight: 10, threshold: 2 },  // 2+ schools
    park:       { weight: 5,  threshold: 1 },  // 1+ park
  }

  let totalScore = 0
  const breakdown: Record<string, { count: number; sub_score: number }> = {}
  for (const [cat, cfg] of Object.entries(weights)) {
    const count = counts[cat] || 0
    const sub = Math.min(count / cfg.threshold, 1) * cfg.weight
    totalScore += sub
    breakdown[cat] = { count, sub_score: Math.round(sub * 10) / 10 }
  }

  const walkScore = Math.round(totalScore)

  // Description based on score
  let description: string
  if (walkScore >= 90) description = "Walker's Paradise — daily errands do not require a car"
  else if (walkScore >= 70) description = "Very Walkable — most errands can be accomplished on foot"
  else if (walkScore >= 50) description = "Somewhat Walkable — some errands can be accomplished on foot"
  else if (walkScore >= 25) description = "Car-Dependent — most errands require a car"
  else description = "Almost All Errands Require a Car"

  return {
    walk_score: walkScore,
    walk_description: description,
    transit_count: counts.transit,
    grocery_count: counts.grocery,
    restaurant_count: counts.restaurant,
    amenity_total: elements.length,
    breakdown,
    source: 'osm_overpass',
    radius_meters: RADIUS,
  }
}

// ZIP 3-digit prefix to state FIPS code — complete US coverage
// Source: USPS Publication 65 (National Five-Digit ZIP Code & Post Office Directory)
function zipToStateFips(zip: string): string {
  const prefix = parseInt(zip.substring(0, 3), 10)
  if (isNaN(prefix)) return '00'

  // Ranges: [min, max, FIPS]  (inclusive)
  const ranges: [number, number, string][] = [
    // CT (09)
    [  6,   6, '09'],
    // MA (25)
    [ 10,  27, '25'],
    // RI (44)
    [ 28,  29, '44'],
    // NH (33)
    [ 30,  38, '33'],
    // ME (23)
    [ 39,  49, '23'],
    // VT (50)
    [ 50,  59, '50'],
    // CT (09)
    [ 60,  69, '09'],
    // NJ (34)
    [ 70,  89, '34'],
    // NY (36) — also includes some AE/AP military but maps to NY
    [100, 149, '36'],
    // PA (42)
    [150, 196, '42'],
    // DE (10)
    [197, 199, '10'],
    // DC (11)
    [200, 205, '11'],
    // MD (24)
    [206, 219, '24'],
    // VA (51)
    [220, 246, '51'],
    // WV (54)
    [247, 268, '54'],
    // NC (37)
    [270, 289, '37'],
    // SC (45)
    [290, 299, '45'],
    // GA (13)
    [300, 319, '13'],
    // FL (12)
    [320, 349, '12'],
    // AL (01)
    [350, 369, '01'],
    // TN (47)
    [370, 385, '47'],
    // MS (28)
    [386, 397, '28'],
    // KY (21)
    [400, 427, '21'],
    // OH (39)
    [430, 458, '39'],
    // IN (18)
    [460, 479, '18'],
    // MI (26)
    [480, 499, '26'],
    // IA (19)
    [500, 528, '19'],
    // WI (55)
    [530, 549, '55'],
    // MN (27)
    [550, 567, '27'],
    // SD (46)
    [570, 577, '46'],
    // ND (38)
    [580, 588, '38'],
    // MT (30)
    [590, 599, '30'],
    // IL (17)
    [600, 629, '17'],
    // MO (29)
    [630, 658, '29'],
    // KS (20)
    [660, 679, '20'],
    // NE (31)
    [680, 693, '31'],
    // LA (22)
    [700, 714, '22'],
    // AR (05)
    [716, 729, '05'],
    // OK (40)
    [730, 749, '40'],
    // TX (48)
    [750, 799, '48'],
    // CO (08)
    [800, 816, '08'],
    // WY (56)
    [820, 831, '56'],
    // ID (16)
    [832, 838, '16'],
    // UT (49)
    [840, 847, '49'],
    // AZ (04)
    [850, 865, '04'],
    // NM (35)
    [870, 884, '35'],
    // NV (32)
    [889, 898, '32'],
    // CA (06)
    [900, 961, '06'],
    // HI (15)
    [967, 968, '15'],
    // OR (41)
    [970, 979, '41'],
    // WA (53)
    [980, 994, '53'],
    // AK (02)
    [995, 999, '02'],
  ]

  for (const [min, max, fips] of ranges) {
    if (prefix >= min && prefix <= max) return fips
  }
  return '00'
}
