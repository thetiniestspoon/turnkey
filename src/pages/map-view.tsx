import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PageLayout } from '@/components/layout/page-layout'
import { useProperties } from '@/hooks/use-properties'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

function scoreColor(score: number): string {
  if (score >= 80) return '#00b894'
  if (score >= 60) return '#ffeaa7'
  return '#ff6b6b'
}

// Geocode a property address via Nominatim and save lat/lng back to DB
async function geocodeProperty(p: { id: string; address: string; city: string; state: string; zip: string }): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(`${p.address}, ${p.city}, ${p.state} ${p.zip}`)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'User-Agent': 'Turnkey-App/1.0' },
    })
    const data = await res.json()
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      // Save back to DB so we don't need to geocode again
      await supabase.from('properties').update({ lat, lng }).eq('id', p.id)
      return { lat, lng }
    }
  } catch { /* geocoding is best-effort */ }
  return null
}

export default function MapViewPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const { properties, loading } = useProperties()
  const [geocoding, setGeocoding] = useState(false)
  const geocodedRef = useRef<Map<string, { lat: number; lng: number }>>(new Map())

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    mapInstance.current = L.map(mapRef.current).setView([39.8283, -98.5795], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstance.current)
  }, [])

  // Geocode properties missing lat/lng, then render markers
  useEffect(() => {
    if (!mapInstance.current || properties.length === 0) return

    async function renderMarkers() {
      const map = mapInstance.current!
      // Clear existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer)
      })

      // Geocode missing coordinates (rate-limited: 1 req/sec for Nominatim)
      const needsGeocoding = properties.filter((p) => !p.lat && !p.lng && !geocodedRef.current.has(p.id))
      if (needsGeocoding.length > 0) {
        setGeocoding(true)
        for (const p of needsGeocoding) {
          const coords = await geocodeProperty(p)
          if (coords) geocodedRef.current.set(p.id, coords)
          // Nominatim rate limit: 1 request per second
          await new Promise((r) => setTimeout(r, 1100))
        }
        setGeocoding(false)
      }

      // Render all properties with coordinates
      const bounds: L.LatLngExpression[] = []
      properties.forEach((p) => {
        const coords = (p.lat && p.lng) ? { lat: Number(p.lat), lng: Number(p.lng) } : geocodedRef.current.get(p.id)
        if (!coords) return
        const score = p.raw_data?.score || 50
        bounds.push([coords.lat, coords.lng])
        L.circleMarker([coords.lat, coords.lng], {
          radius: 8, fillColor: scoreColor(score), color: '#fff',
          weight: 1, opacity: 1, fillOpacity: 0.8,
        })
          .addTo(map)
          .bindPopup(`
            <strong>${p.address}</strong><br/>
            ${p.city}, ${p.state} ${p.zip}<br/>
            ${formatCurrency(p.list_price || 0)} · ★ ${score}<br/>
            <a href="/property/${p.id}">View Deal Card →</a>
          `)
      })

      // Fit map to show all markers
      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 })
      }
    }

    renderMarkers()
  }, [properties])

  const withCoords = properties.filter((p) => p.lat || p.lng || geocodedRef.current.has(p.id))
  const withoutCoords = properties.length - withCoords.length

  return (
    <PageLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Map</h1>
          {geocoding && <span className="text-sm text-muted-foreground animate-pulse">Geocoding addresses...</span>}
          {!loading && !geocoding && withoutCoords > 0 && (
            <span className="text-sm text-muted-foreground">{withoutCoords} properties could not be mapped</span>
          )}
        </div>
        <div ref={mapRef} className="h-[calc(100vh-200px)] rounded-lg border" />
      </div>
    </PageLayout>
  )
}
