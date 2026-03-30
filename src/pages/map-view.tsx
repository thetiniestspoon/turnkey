import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PageLayout } from '@/components/layout/page-layout'
import { useProperties, type Property } from '@/hooks/use-properties'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  MapIcon,
  SatelliteIcon,
  MoonIcon,
  LoaderIcon,
  XIcon,
  ExternalLinkIcon,
  TrendingUpIcon,
  HomeIcon,
  DollarSignIcon,
} from 'lucide-react'

/* ─── Tile layers ─── */
type MapLayer = 'street' | 'satellite' | 'dark'

const TILE_LAYERS: Record<MapLayer, { url: string; attribution: string }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
}

const LAYER_META: Record<MapLayer, { label: string; icon: typeof MapIcon }> = {
  street: { label: 'Street', icon: MapIcon },
  satellite: { label: 'Satellite', icon: SatelliteIcon },
  dark: { label: 'Dark', icon: MoonIcon },
}

/* ─── Helpers ─── */
function scoreColor(score: number): string {
  if (score >= 80) return '#00b894'
  if (score >= 60) return '#ffeaa7'
  return '#ff6b6b'
}

async function geocodeProperty(p: {
  id: string
  address: string
  city: string
  state: string
  zip: string
}): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(`${p.address}, ${p.city}, ${p.state} ${p.zip}`)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Turnkey-App/1.0' } },
    )
    const data = await res.json()
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      await supabase.from('properties').update({ lat, lng }).eq('id', p.id)
      return { lat, lng }
    }
  } catch {
    /* geocoding is best-effort */
  }
  return null
}

/* ─── Loading overlay ─── */
function MapLoadingOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card ring-1 ring-foreground/10 shadow-lg">
        <LoaderIcon className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">{message}</p>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Layer toggle control ─── */
function LayerToggle({
  active,
  onChange,
}: {
  active: MapLayer
  onChange: (layer: MapLayer) => void
}) {
  return (
    <div className="absolute top-3 right-3 z-[1000] flex gap-1 rounded-lg bg-card/90 backdrop-blur-sm p-1 ring-1 ring-foreground/10 shadow-md">
      {(Object.keys(LAYER_META) as MapLayer[]).map((key) => {
        const { label, icon: Icon } = LAYER_META[key]
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ─── Property detail panel (Sheet) ─── */
function PropertyDetailPanel({
  property,
  open,
  onClose,
}: {
  property: Property | null
  open: boolean
  onClose: () => void
}) {
  if (!property) return null

  const p = property
  const score = p.raw_data?.score
  const strategy = p.raw_data?.recommended_strategy
  const rationale = p.raw_data?.rationale
  const listingUrl = p.raw_data?.listing_url
  const imageUrl = p.raw_data?.image_url
  const analysis = p.property_analyses?.[0]

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {score != null && (
              <Badge variant="default" className="bg-green-600">
                ★ {score}
              </Badge>
            )}
            {strategy && (
              <Badge variant="outline" className="capitalize">
                {strategy}
              </Badge>
            )}
            {p.market_status && p.market_status !== 'active' && (
              <Badge
                variant="default"
                className={
                  p.market_status === 'off_market'
                    ? 'bg-red-600 text-white'
                    : p.market_status === 'pending'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-secondary text-secondary-foreground'
                }
              >
                {p.market_status === 'off_market'
                  ? 'Off Market'
                  : p.market_status.charAt(0).toUpperCase() + p.market_status.slice(1)}
              </Badge>
            )}
          </div>
          <SheetTitle>{p.address}</SheetTitle>
          <SheetDescription>
            {p.city}, {p.state} {p.zip}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 space-y-5">
          {/* Property image */}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={p.address}
              className="rounded-lg w-full h-48 object-cover bg-muted"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="bg-muted rounded-lg h-32 flex items-center justify-center text-sm text-muted-foreground">
              <HomeIcon className="h-6 w-6 mr-2 opacity-40" />
              No photo available
            </div>
          )}

          {/* Price + details */}
          <div className="space-y-2">
            <p className="text-2xl font-bold text-yellow-500">
              {formatCurrency(p.list_price || 0)}
            </p>
            <div className="flex gap-3 text-sm text-muted-foreground">
              {p.bedrooms != null && <span>{p.bedrooms} bd</span>}
              {p.bathrooms != null && <span>{p.bathrooms} ba</span>}
              {p.sqft != null && <span>{p.sqft?.toLocaleString()} sqft</span>}
              {p.property_type && <span className="capitalize">{p.property_type}</span>}
            </div>
          </div>

          {/* Investment analytics timeline */}
          {analysis && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUpIcon className="h-3.5 w-3.5" />
                Investment Analysis
              </h4>

              {/* Flip scenario */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Flip Scenario</span>
                  {analysis.flip_roi != null && (
                    <Badge
                      variant={analysis.flip_roi >= 15 ? 'default' : 'outline'}
                      className={analysis.flip_roi >= 15 ? 'bg-green-600' : ''}
                    >
                      {formatPercent(analysis.flip_roi)} ROI
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {analysis.flip_arv != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatCurrency(analysis.flip_arv)}
                      </span>
                      ARV
                    </div>
                  )}
                  {analysis.flip_renovation_cost != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatCurrency(analysis.flip_renovation_cost)}
                      </span>
                      Renovation
                    </div>
                  )}
                  {analysis.flip_profit != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatCurrency(analysis.flip_profit)}
                      </span>
                      Profit
                    </div>
                  )}
                  {analysis.flip_timeline_months != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {analysis.flip_timeline_months} mo
                      </span>
                      Timeline
                    </div>
                  )}
                </div>
              </div>

              {/* Rental scenario */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Rental Scenario</span>
                  {analysis.rental_cap_rate != null && (
                    <Badge
                      variant={analysis.rental_cap_rate >= 6 ? 'default' : 'outline'}
                      className={analysis.rental_cap_rate >= 6 ? 'bg-green-600' : ''}
                    >
                      {formatPercent(analysis.rental_cap_rate)} Cap
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {analysis.rental_monthly_rent != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatCurrency(analysis.rental_monthly_rent)}
                      </span>
                      Monthly Rent
                    </div>
                  )}
                  {analysis.rental_monthly_cashflow != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatCurrency(analysis.rental_monthly_cashflow)}
                      </span>
                      Cash Flow
                    </div>
                  )}
                  {analysis.rental_noi != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatCurrency(analysis.rental_noi)}
                      </span>
                      NOI
                    </div>
                  )}
                  {analysis.rental_cash_on_cash != null && (
                    <div>
                      <span className="block text-foreground font-medium">
                        {formatPercent(analysis.rental_cash_on_cash)}
                      </span>
                      Cash-on-Cash
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI Rationale */}
          {rationale && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI Rationale
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{rationale}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pb-4">
            <Button asChild variant="outline" className="flex-1">
              <Link to={`/property/${p.id}`}>
                <DollarSignIcon className="h-4 w-4 mr-1.5" />
                Full Deal Card
              </Link>
            </Button>
            {listingUrl && (
              <Button asChild variant="outline" className="flex-1">
                <a href={listingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="h-4 w-4 mr-1.5" />
                  Listing
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ─── Main page ─── */
export default function MapViewPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const { properties, loading } = useProperties()
  const [geocoding, setGeocoding] = useState(false)
  const [activeLayer, setActiveLayer] = useState<MapLayer>('street')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const geocodedRef = useRef<Map<string, { lat: number; lng: number }>>(new Map())

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    mapInstance.current = L.map(mapRef.current).setView([39.8283, -98.5795], 4)
    const layer = TILE_LAYERS.street
    tileLayerRef.current = L.tileLayer(layer.url, {
      attribution: layer.attribution,
    }).addTo(mapInstance.current)
  }, [])

  // Handle layer switching
  const handleLayerChange = useCallback((layer: MapLayer) => {
    setActiveLayer(layer)
    if (!mapInstance.current || !tileLayerRef.current) return
    mapInstance.current.removeLayer(tileLayerRef.current)
    const config = TILE_LAYERS[layer]
    tileLayerRef.current = L.tileLayer(config.url, {
      attribution: config.attribution,
    }).addTo(mapInstance.current)
  }, [])

  // Handle marker click → open detail panel
  const handleMarkerClick = useCallback((property: Property) => {
    setSelectedProperty(property)
    setPanelOpen(true)
  }, [])

  // Geocode + render markers
  useEffect(() => {
    if (!mapInstance.current || properties.length === 0) return

    async function renderMarkers() {
      const map = mapInstance.current!
      // Clear existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer)
      })

      // Geocode missing coordinates
      const needsGeocoding = properties.filter(
        (p) => !p.lat && !p.lng && !geocodedRef.current.has(p.id),
      )
      if (needsGeocoding.length > 0) {
        setGeocoding(true)
        for (const p of needsGeocoding) {
          const coords = await geocodeProperty(p)
          if (coords) geocodedRef.current.set(p.id, coords)
          await new Promise((r) => setTimeout(r, 1100))
        }
        setGeocoding(false)
      }

      // Render all properties with coordinates
      const bounds: L.LatLngExpression[] = []
      properties.forEach((p) => {
        const coords =
          p.lat && p.lng
            ? { lat: Number(p.lat), lng: Number(p.lng) }
            : geocodedRef.current.get(p.id)
        if (!coords) return
        const score = p.raw_data?.score || 50
        bounds.push([coords.lat, coords.lng])
        L.circleMarker([coords.lat, coords.lng], {
          radius: 8,
          fillColor: scoreColor(score),
          color: '#fff',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
        })
          .addTo(map)
          .on('click', () => handleMarkerClick(p))
          .bindTooltip(
            `<strong>${p.address}</strong><br/>${formatCurrency(p.list_price || 0)}`,
            { direction: 'top', offset: [0, -8] },
          )
      })

      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 })
      }
    }

    renderMarkers()
  }, [properties, handleMarkerClick])

  const withCoords = properties.filter(
    (p) => p.lat || p.lng || geocodedRef.current.has(p.id),
  )
  const withoutCoords = properties.length - withCoords.length

  return (
    <PageLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Map</h1>
          <div className="flex items-center gap-3">
            {geocoding && (
              <span className="text-sm text-muted-foreground animate-pulse">
                Geocoding addresses...
              </span>
            )}
            {!loading && !geocoding && withoutCoords > 0 && (
              <span className="text-sm text-muted-foreground">
                {withoutCoords} properties could not be mapped
              </span>
            )}
            {!loading && properties.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {withCoords.length} on map
              </span>
            )}
          </div>
        </div>

        <div className="relative h-[calc(100vh-200px)] rounded-lg border overflow-hidden">
          {/* Loading overlay */}
          {loading && <MapLoadingOverlay message="Loading properties..." />}
          {!loading && geocoding && (
            <MapLoadingOverlay message="Geocoding addresses..." />
          )}

          {/* Layer toggle */}
          <LayerToggle active={activeLayer} onChange={handleLayerChange} />

          {/* Map container */}
          <div ref={mapRef} className="h-full w-full" />
        </div>
      </div>

      {/* Property detail slide-out panel */}
      <PropertyDetailPanel
        property={selectedProperty}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </PageLayout>
  )
}
