import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PageLayout } from '@/components/layout/page-layout'
import { useProperties } from '@/hooks/use-properties'
import { formatCurrency } from '@/lib/utils'

function scoreColor(score: number): string {
  if (score >= 80) return '#00b894'
  if (score >= 60) return '#ffeaa7'
  return '#ff6b6b'
}

export default function MapViewPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const { properties } = useProperties()

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    mapInstance.current = L.map(mapRef.current).setView([39.8283, -98.5795], 4)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstance.current)
  }, [])

  useEffect(() => {
    if (!mapInstance.current) return
    // Clear existing markers
    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) mapInstance.current!.removeLayer(layer)
    })
    // Add property markers
    properties.forEach((p) => {
      if (!p.lat || !p.lng) return
      const score = p.raw_data?.score || 50
      L.circleMarker([Number(p.lat), Number(p.lng)], {
        radius: 8, fillColor: scoreColor(score), color: '#fff',
        weight: 1, opacity: 1, fillOpacity: 0.8,
      })
        .addTo(mapInstance.current!)
        .bindPopup(`
          <strong>${p.address}</strong><br/>
          ${p.city}, ${p.state} ${p.zip}<br/>
          ${formatCurrency(p.list_price || 0)} · ★ ${score}<br/>
          <a href="/property/${p.id}">View Deal Card →</a>
        `)
    })
  }, [properties])

  return (
    <PageLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Map</h1>
        <div ref={mapRef} className="h-[calc(100vh-200px)] rounded-lg border" />
      </div>
    </PageLayout>
  )
}
