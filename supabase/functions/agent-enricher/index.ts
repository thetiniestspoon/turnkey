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

// Helper: rough ZIP prefix to state FIPS mapping (first 3 digits)
function zipToStateFips(zip: string): string {
  // Major mappings (not exhaustive but covers most)
  const map: Record<string, string> = {
    // NJ
    '070': '34', '071': '34', '072': '34', '073': '34', '074': '34',
    '075': '34', '076': '34', '077': '34', '078': '34', '079': '34',
    '080': '34', '081': '34', '082': '34', '083': '34', '084': '34',
    '085': '34', '086': '34', '087': '34', '088': '34', '089': '34',
    // NY
    '100': '36', '101': '36', '102': '36', '103': '36', '104': '36',
    '110': '36', '111': '36', '112': '36', '113': '36', '114': '36',
    '115': '36', '116': '36', '117': '36', '118': '36', '119': '36',
    '120': '36', '121': '36', '122': '36', '123': '36', '124': '36',
    '125': '36', '126': '36', '127': '36', '128': '36', '129': '36',
    '130': '36', '131': '36', '132': '36', '133': '36', '134': '36',
    '135': '36', '136': '36', '137': '36', '138': '36', '139': '36',
    '140': '36', '141': '36', '142': '36', '143': '36', '144': '36',
    '145': '36', '146': '36', '147': '36', '148': '36', '149': '36',
    // TX
    '750': '48', '751': '48', '752': '48', '753': '48', '754': '48',
    '755': '48', '756': '48', '757': '48', '758': '48', '759': '48',
    '760': '48', '761': '48', '762': '48', '763': '48', '764': '48',
    '765': '48', '766': '48', '767': '48', '768': '48', '769': '48',
    '770': '48', '771': '48', '772': '48', '773': '48', '774': '48',
    '775': '48', '776': '48', '777': '48', '778': '48', '779': '48',
    '780': '48', '781': '48', '782': '48', '783': '48', '784': '48',
    '785': '48', '786': '48', '787': '48', '788': '48', '789': '48',
    // CA
    '900': '06', '901': '06', '902': '06', '903': '06', '904': '06',
    '905': '06', '906': '06', '907': '06', '908': '06', '909': '06',
    '910': '06', '911': '06', '912': '06', '913': '06', '914': '06',
    '915': '06', '916': '06', '917': '06', '918': '06', '919': '06',
    '920': '06', '921': '06', '922': '06', '923': '06', '924': '06',
    '925': '06', '926': '06', '927': '06', '928': '06', '929': '06',
    '930': '06', '931': '06', '932': '06', '933': '06', '934': '06',
    '935': '06', '936': '06', '937': '06', '938': '06', '939': '06',
    '940': '06', '941': '06', '942': '06', '943': '06', '944': '06',
    '945': '06', '946': '06', '947': '06', '948': '06', '949': '06',
    '950': '06', '951': '06', '952': '06', '953': '06', '954': '06',
    '955': '06', '956': '06', '957': '06', '958': '06', '959': '06',
    '960': '06', '961': '06',
    // FL
    '320': '12', '321': '12', '322': '12', '323': '12', '324': '12',
    '325': '12', '326': '12', '327': '12', '328': '12', '329': '12',
    '330': '12', '331': '12', '332': '12', '333': '12', '334': '12',
    '335': '12', '336': '12', '337': '12', '338': '12', '339': '12',
    '340': '12', '341': '12', '342': '12', '344': '12', '346': '12',
    // OH
    '430': '39', '431': '39', '432': '39', '433': '39', '434': '39',
    '435': '39', '436': '39', '437': '39', '438': '39', '439': '39',
    '440': '39', '441': '39', '442': '39', '443': '39', '444': '39',
    '445': '39', '446': '39', '447': '39', '448': '39', '449': '39',
    '450': '39', '451': '39', '452': '39', '453': '39', '454': '39',
    '455': '39', '456': '39', '457': '39', '458': '39',
    // TN
    '370': '47', '371': '47', '372': '47', '373': '47', '374': '47',
    '375': '47', '376': '47', '377': '47', '378': '47', '379': '47',
    '380': '47', '381': '47', '382': '47', '383': '47', '384': '47',
    '385': '47',
    // MI
    '480': '26', '481': '26', '482': '26', '483': '26', '484': '26',
    '485': '26', '486': '26', '487': '26', '488': '26', '489': '26',
    '490': '26', '491': '26', '492': '26', '493': '26', '494': '26',
    '495': '26', '496': '26', '497': '26', '498': '26', '499': '26',
    // NC
    '270': '37', '271': '37', '272': '37', '273': '37', '274': '37',
    '275': '37', '276': '37', '277': '37', '278': '37', '279': '37',
    '280': '37', '281': '37', '282': '37', '283': '37', '284': '37',
    '285': '37', '286': '37', '287': '37', '288': '37', '289': '37',
    // GA
    '300': '13', '301': '13', '302': '13', '303': '13', '304': '13',
    '305': '13', '306': '13', '307': '13', '308': '13', '309': '13',
    '310': '13', '311': '13', '312': '13', '313': '13', '314': '13',
    '315': '13', '316': '13', '317': '13', '318': '13', '319': '13',
    // AZ
    '850': '04', '851': '04', '852': '04', '853': '04', '854': '04',
    '855': '04', '856': '04', '857': '04',
  }

  const prefix3 = zip.substring(0, 3)
  return map[prefix3] || '00' // fallback
}
