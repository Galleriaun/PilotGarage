import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatCreatedStamp } from '../../lib/dates'
import { formatTL, numericStringToKurus } from '../../lib/money'
import { BackChevron } from '../auth/EyeIcon'
import {
  useAlindiIstek,
  useApproveAvansIstek,
  useBekleyenIstekTurleri,
  useIstekler,
  useRejectAvansIstek,
} from './api'
import { Avatar } from './shared'
import { ROLE_LABELS, type Istek, type IstekTur } from './types'

const TABS: { key: IstekTur; label: string }[] = [
  { key: 'AVANS', label: 'Avans İstekleri' },
  { key: 'SIKAYET', label: 'Şikayetler' },
  { key: 'ONERI', label: 'Öneriler' },
]

const DURUM_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  ONAYLANDI: { label: 'Onaylandı', bg: '#F0FDF4', color: '#15803D' },
  REDDEDILDI: { label: 'Reddedildi', bg: '#FEF3F2', color: '#C62828' },
  ALINDI: { label: 'Alındı', bg: '#F2F2F2', color: '#666666' },
}

type ConfirmAction = { istek: Istek; action: 'ONAYLA' | 'REDDET' | 'ALINDI' }

export default function Istekler() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: istekler = [], isPending } = useIstekler(businessId)
  const { data: bekleyen = new Set<IstekTur>() } = useBekleyenIstekTurleri(businessId)
  const approve = useApproveAvansIstek()
  const reject = useRejectAvansIstek()
  const alindi = useAlindiIstek()

  const [tab, setTab] = useState<IstekTur>('AVANS')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const shown = istekler.filter((i) => i.tur === tab)
  const busy = approve.isPending || reject.isPending || alindi.isPending

  async function onConfirm() {
    if (!confirm) return
    const { istek, action } = confirm
    setConfirm(null)
    setErrors((e) => ({ ...e, [istek.id]: '' }))
    setBusyId(istek.id)
    try {
      if (action === 'ONAYLA') await approve.mutateAsync({ id: istek.id })
      else if (action === 'REDDET') await reject.mutateAsync({ id: istek.id })
      else await alindi.mutateAsync({ id: istek.id })
    } catch {
      setErrors((e) => ({ ...e, [istek.id]: 'İşlem yapılamadı. Tekrar deneyin.' }))
    } finally {
      setBusyId(null)
    }
  }

  function confirmText(c: ConfirmAction): { title: string; message: string; label: string } {
    const name = c.istek.profile?.full_name ?? 'Personel'
    if (c.action === 'ONAYLA') {
      return {
        title: 'Avansı onayla',
        message: `${name} kişisine ${formatTL(
          numericStringToKurus(String(c.istek.tutar ?? 0)),
        )} avans verilecek ve kasadan düşülecek.`,
        label: 'Onayla',
      }
    }
    if (c.action === 'REDDET') {
      return {
        title: 'İsteği reddet',
        message: `${name} kişisinin avans isteği reddedilecek.`,
        label: 'Reddet',
      }
    }
    return {
      title: 'Alındı olarak işaretle',
      message: `${name} kişisinin ${
        c.istek.tur === 'SIKAYET' ? 'şikayeti' : 'önerisi'
      } alındı olarak işaretlenecek.`,
      label: 'Alındı',
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate('/yonetim/personel')}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">İstekler</h1>
      </div>

      {/* Tabs — red dot = o türde bekleyen istek var */}
      <div className="flex gap-2 overflow-x-auto px-6 pt-4">
        {TABS.map((t) => {
          const selected = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key)
                setExpandedId(null)
              }}
              className="relative shrink-0 cursor-pointer whitespace-nowrap rounded-[20px] px-[14px] py-[8px] text-[13px] font-semibold"
              style={{
                background: selected ? 'var(--seg-on)' : 'var(--seg)',
                color: selected ? 'var(--seg-fg-on)' : 'var(--seg-fg)',
              }}
            >
              {t.label}
              {bekleyen.has(t.key) && (
                <span className="absolute -right-[2px] -top-[2px] h-[9px] w-[9px] rounded-full bg-[#E53935]" />
              )}
            </button>
          )
        })}
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : shown.length === 0 ? (
        <div className="px-6 py-[60px] text-center">
          <div className="mb-1 text-base font-bold text-ink">
            {TABS.find((t) => t.key === tab)?.label} yok
          </div>
          <div className="text-[13px] text-muted">Yeni istekler burada görünecek.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-6 pt-[18px]">
          {shown.map((i) => {
            const expanded = expandedId === i.id
            const chip = DURUM_CHIP[i.durum]
            return (
              <div
                key={i.id}
                className="rounded-[18px] border border-[#EDEDED] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={i.profile?.full_name ?? '—'} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">
                      {i.profile?.full_name ?? '—'}
                    </div>
                    <div className="mt-[1px] text-[11px] text-muted">
                      {(i.profile?.role && ROLE_LABELS[i.profile.role]) || 'Personel'} ·{' '}
                      {formatCreatedStamp(i.created_at)}
                    </div>
                  </div>
                  {i.tur === 'AVANS' && (
                    <div className="shrink-0 text-base font-bold text-ink">
                      {formatTL(numericStringToKurus(String(i.tutar ?? 0)))}
                    </div>
                  )}
                </div>

                {i.metin && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : i.id)}
                    className="mt-3 w-full cursor-pointer rounded-[12px] bg-field px-3 py-[10px] text-left"
                  >
                    <p
                      className={`text-[13.5px] leading-relaxed text-ink ${
                        expanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {i.metin}
                    </p>
                    {!expanded && i.metin.length > 90 && (
                      <span className="mt-1 block text-[11px] font-semibold text-muted">
                        Tamamını gör
                      </span>
                    )}
                  </button>
                )}

                {errors[i.id] && (
                  <p className="mt-3 text-center text-[13px] text-danger">{errors[i.id]}</p>
                )}

                {i.durum === 'BEKLIYOR' ? (
                  <div className="mt-[14px] flex gap-2">
                    {i.tur === 'AVANS' ? (
                      <>
                        {/* X = avans isteğini reddet */}
                        <button
                          type="button"
                          aria-label="İsteği reddet"
                          disabled={busy || busyId === i.id}
                          onClick={() => setConfirm({ istek: i, action: 'REDDET' })}
                          className="flex w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] bg-danger-soft disabled:opacity-60"
                        >
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#C62828"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={busy || busyId === i.id}
                          onClick={() => setConfirm({ istek: i, action: 'ONAYLA' })}
                          className="flex-1 cursor-pointer rounded-[12px] bg-[#1F2937] py-[11px] text-center text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busyId === i.id ? '…' : 'Onayla'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || busyId === i.id}
                        onClick={() => setConfirm({ istek: i, action: 'ALINDI' })}
                        className="flex-1 cursor-pointer rounded-[12px] bg-[#1F2937] py-[11px] text-center text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyId === i.id ? '…' : 'Alındı'}
                      </button>
                    )}
                  </div>
                ) : (
                  chip && (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {i.karar_tarihi && (
                        <span className="text-[11px] text-faint">
                          {formatCreatedStamp(i.karar_tarihi)}
                        </span>
                      )}
                      <span
                        className="rounded-[8px] px-3 py-[6px] text-xs font-semibold"
                        style={{ background: chip.bg, color: chip.color }}
                      >
                        {chip.label}
                      </span>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="h-10" />

      {confirm &&
        (() => {
          const t = confirmText(confirm)
          return (
            <ConfirmDialog
              open
              title={t.title}
              message={t.message}
              confirmLabel={t.label}
              danger={confirm.action === 'REDDET'}
              busy={false}
              onConfirm={() => void onConfirm()}
              onCancel={() => setConfirm(null)}
            />
          )
        })()}
    </div>
  )
}
