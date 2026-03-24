import { useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useWatchlists } from '@/hooks/use-watchlists'
import { useCriteria } from '@/hooks/use-criteria'
import { useToast } from '@/components/ui/toast'
import type { Watchlist } from '@/hooks/use-watchlists'

const PROPERTY_TYPES = ['single_family', 'multi_family', 'condo', 'townhouse']
const STRATEGIES = ['flip', 'rental', 'either']

function formatLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function CriteriaForm({
  values,
  onChange,
  placeholders,
}: {
  values: {
    max_price: string
    min_cap_rate: string
    min_flip_roi: string
    min_score: string
    property_types: string[]
    strategies: string[]
  }
  onChange: (v: typeof values) => void
  placeholders?: {
    max_price?: string
    min_cap_rate?: string
    min_flip_roi?: string
    min_score?: string
  }
}) {
  function toggleArray(arr: string[], item: string) {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Max Price ($)
          </label>
          <Input
            type="number"
            placeholder={placeholders?.max_price || '500000'}
            value={values.max_price}
            onChange={(e) => onChange({ ...values, max_price: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Min Cap Rate (%)
          </label>
          <Input
            type="number"
            step="0.1"
            placeholder={placeholders?.min_cap_rate || '5'}
            value={values.min_cap_rate}
            onChange={(e) =>
              onChange({ ...values, min_cap_rate: e.target.value })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Min Flip ROI (%)
          </label>
          <Input
            type="number"
            step="0.1"
            placeholder={placeholders?.min_flip_roi || '15'}
            value={values.min_flip_roi}
            onChange={(e) =>
              onChange({ ...values, min_flip_roi: e.target.value })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Min Score (0-100)
          </label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder={placeholders?.min_score || '60'}
            value={values.min_score}
            onChange={(e) => onChange({ ...values, min_score: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Property Types
        </label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PROPERTY_TYPES.map((pt) => (
            <label key={pt} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={values.property_types.includes(pt)}
                onChange={() =>
                  onChange({
                    ...values,
                    property_types: toggleArray(values.property_types, pt),
                  })
                }
              />
              {formatLabel(pt)}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Strategies
        </label>
        <div className="flex flex-wrap gap-2 mt-1">
          {STRATEGIES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={values.strategies.includes(s)}
                onChange={() =>
                  onChange({
                    ...values,
                    strategies: toggleArray(values.strategies, s),
                  })
                }
              />
              {formatLabel(s)}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function WatchlistsPage() {
  const {
    watchlists,
    loading,
    agentLoading,
    addWatchlist,
    updateWatchlist,
    deleteWatchlist,
    toggleActive,
    scoutNow,
  } = useWatchlists()
  const { criteria, loading: criteriaLoading, saveCriteria } = useCriteria()
  const { toast } = useToast()

  // Global criteria form state
  const [globalForm, setGlobalForm] = useState({
    max_price: '',
    min_cap_rate: '',
    min_flip_roi: '',
    min_score: '',
    auto_analyze_min_score: '',
    property_types: [...PROPERTY_TYPES],
    strategies: [...STRATEGIES],
  })
  const [globalOpen, setGlobalOpen] = useState(false)
  const [globalSaving, setGlobalSaving] = useState(false)

  // Sync criteria to form when loaded
  const [criteriaLoaded, setCriteriaLoaded] = useState(false)
  if (!criteriaLoaded && criteria) {
    setGlobalForm({
      max_price: criteria.max_price?.toString() || '',
      min_cap_rate: criteria.min_cap_rate?.toString() || '',
      min_flip_roi: criteria.min_flip_roi?.toString() || '',
      min_score: criteria.min_score?.toString() || '',
      auto_analyze_min_score: criteria.auto_analyze_min_score?.toString() || '',
      property_types: criteria.property_types || [...PROPERTY_TYPES],
      strategies: criteria.strategies || [...STRATEGIES],
    })
    setCriteriaLoaded(true)
  }

  // Add market dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newMarket, setNewMarket] = useState({
    name: '',
    zip: '',
    city: '',
    state: '',
  })

  // Edit criteria dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingWl, setEditingWl] = useState<Watchlist | null>(null)
  const [overrideForm, setOverrideForm] = useState({
    max_price: '',
    min_cap_rate: '',
    min_flip_roi: '',
    min_score: '',
    property_types: [...PROPERTY_TYPES],
    strategies: [...STRATEGIES],
  })

  async function handleSaveGlobal() {
    setGlobalSaving(true)
    await saveCriteria({
      max_price: globalForm.max_price ? Number(globalForm.max_price) : null,
      min_cap_rate: globalForm.min_cap_rate
        ? Number(globalForm.min_cap_rate)
        : null,
      min_flip_roi: globalForm.min_flip_roi
        ? Number(globalForm.min_flip_roi)
        : null,
      min_score: globalForm.min_score ? Number(globalForm.min_score) : null,
      auto_analyze_min_score: globalForm.auto_analyze_min_score
        ? Number(globalForm.auto_analyze_min_score)
        : null,
      property_types: globalForm.property_types,
      strategies: globalForm.strategies,
    })
    setGlobalSaving(false)
    toast('Criteria saved', 'success')
  }

  async function handleAddMarket() {
    if (!newMarket.name.trim() || !newMarket.zip.trim()) {
      toast('Name and ZIP are required', 'error')
      return
    }
    await addWatchlist({
      name: newMarket.name,
      zip: newMarket.zip,
      city: newMarket.city || undefined,
      state: newMarket.state || undefined,
    })
    setNewMarket({ name: '', zip: '', city: '', state: '' })
    setAddDialogOpen(false)
    toast('Market added', 'success')
  }

  function openEditCriteria(wl: Watchlist) {
    setEditingWl(wl)
    const ov = (wl.criteria_overrides || {}) as Record<string, unknown>
    setOverrideForm({
      max_price: ov.max_price != null ? String(ov.max_price) : '',
      min_cap_rate: ov.min_cap_rate != null ? String(ov.min_cap_rate) : '',
      min_flip_roi: ov.min_flip_roi != null ? String(ov.min_flip_roi) : '',
      min_score: ov.min_score != null ? String(ov.min_score) : '',
      property_types: (ov.property_types as string[] | undefined) || [...PROPERTY_TYPES],
      strategies: (ov.strategies as string[] | undefined) || [...STRATEGIES],
    })
    setEditDialogOpen(true)
  }

  async function handleSaveOverrides() {
    if (!editingWl) return
    const overrides: Record<string, unknown> = {}
    if (overrideForm.max_price)
      overrides.max_price = Number(overrideForm.max_price)
    if (overrideForm.min_cap_rate)
      overrides.min_cap_rate = Number(overrideForm.min_cap_rate)
    if (overrideForm.min_flip_roi)
      overrides.min_flip_roi = Number(overrideForm.min_flip_roi)
    if (overrideForm.min_score)
      overrides.min_score = Number(overrideForm.min_score)
    if (overrideForm.property_types.length > 0)
      overrides.property_types = overrideForm.property_types
    if (overrideForm.strategies.length > 0)
      overrides.strategies = overrideForm.strategies

    await updateWatchlist(editingWl.id, {
      criteria_overrides: Object.keys(overrides).length > 0 ? overrides : null,
    })
    setEditDialogOpen(false)
    setEditingWl(null)
  }

  function formatDate(d: string | null) {
    if (!d) return 'Never'
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Watchlists</h1>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger render={<Button />}>+ Add Market</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Market</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Name (e.g. NJ Suburbs)"
                  value={newMarket.name}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, name: e.target.value })
                  }
                />
                <Input
                  placeholder="ZIP Code"
                  value={newMarket.zip}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, zip: e.target.value })
                  }
                />
                <Input
                  placeholder="City (optional)"
                  value={newMarket.city}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, city: e.target.value })
                  }
                />
                <Input
                  placeholder="State (optional, e.g. NJ)"
                  value={newMarket.state}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, state: e.target.value })
                  }
                />
                <Button
                  onClick={handleAddMarket}
                  disabled={!newMarket.name || !newMarket.zip}
                >
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Global Criteria */}
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setGlobalOpen(!globalOpen)}
          >
            <CardTitle className="text-base flex justify-between items-center">
              <span>Global Investment Criteria</span>
              <Badge variant="outline">
                {globalOpen ? 'Collapse' : 'Expand'}
              </Badge>
            </CardTitle>
          </CardHeader>
          {globalOpen && (
            <CardContent className="space-y-4">
              {criteriaLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  <CriteriaForm
                    values={globalForm}
                    onChange={setGlobalForm}
                  />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Auto-Analyze Cutoff (0-100)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="60"
                      value={globalForm.auto_analyze_min_score}
                      onChange={(e) =>
                        setGlobalForm({ ...globalForm, auto_analyze_min_score: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Properties scored above this are auto-analyzed by agents
                    </p>
                  </div>
                  <Button
                    onClick={handleSaveGlobal}
                    disabled={globalSaving}
                  >
                    {globalSaving ? 'Saving...' : 'Save Defaults'}
                  </Button>
                </>
              )}
            </CardContent>
          )}
        </Card>

        {/* Watchlist Table */}
        <Card>
          <CardContent className="pt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : watchlists.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">
                No watchlists yet. Add a market to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ZIP</TableHead>
                    <TableHead>City/State</TableHead>
                    <TableHead>Last Scouted</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchlists.map((wl) => (
                    <TableRow key={wl.id}>
                      <TableCell className="font-medium">{wl.name}</TableCell>
                      <TableCell>{wl.zip}</TableCell>
                      <TableCell>
                        {[wl.city, wl.state].filter(Boolean).join(', ') || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(wl.last_scouted_at)}
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={wl.active ?? true}
                          onChange={(e) =>
                            toggleActive(wl.id, e.target.checked)
                          }
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditCriteria(wl)}
                          >
                            Edit Criteria
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={agentLoading}
                            onClick={async () => {
                              const result = await scoutNow(wl.id, wl.zip)
                              toast(result ? 'Scout complete' : 'Scout failed — check Edge Functions', result ? 'success' : 'error')
                            }}
                          >
                            {agentLoading ? 'Scouting...' : 'Scout Now'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-500"
                            onClick={() => deleteWatchlist(wl.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Criteria Override Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Criteria Overrides: {editingWl?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Leave fields empty to use global defaults. Values here override
                your global criteria for this market only.
              </p>
              <CriteriaForm
                values={overrideForm}
                onChange={setOverrideForm}
                placeholders={{
                  max_price: criteria?.max_price?.toString() || 'global default',
                  min_cap_rate:
                    criteria?.min_cap_rate?.toString() || 'global default',
                  min_flip_roi:
                    criteria?.min_flip_roi?.toString() || 'global default',
                  min_score:
                    criteria?.min_score?.toString() || 'global default',
                }}
              />
              <Button onClick={handleSaveOverrides}>Save Overrides</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  )
}
