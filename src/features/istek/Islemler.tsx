import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatTL, parseTLToKurus } from '../../lib/money'
import { FormModal, modalFieldLabel, modalInputCls } from '../yonetim/shared'
import type { IstekTur } from '../yonetim/types'
import { useCreateIstek, useMyMaas } from './api'

const ACTIONS: {
  tur: IstekTur
  label: string
  desc: string
  iconBg: string
  icon: React.ReactNode
}[] = [
  {
    tur: 'AVANS',
    label: 'Avans İste',
    desc: 'Maaşınızdan avans talep edin',
    iconBg: '#F0FDF4',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    tur: 'SIKAYET',
    label: 'Şikayet Oluştur',
    desc: 'Bir sorunu yönetime iletin',
    iconBg: '#FEF3F2',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    tur: 'ONERI',
    label: 'Öneride Bulun',
    desc: 'Fikrinizi yönetimle paylaşın',
    iconBg: '#FFF7ED',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 00-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0012 2z" />
      </svg>
    ),
  },
]

const TITLES: Record<IstekTur, string> = {
  AVANS: 'Avans İste',
  SIKAYET: 'Şikayet Oluştur',
  ONERI: 'Öneride Bulun',
}

export default function Islemler() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const { data: maasKurus = 0 } = useMyMaas(businessId)
  const createIstek = useCreateIstek()

  const [modal, setModal] = useState<{ open: boolean; tur: IstekTur; tutar: string; metin: string }>(
    { open: false, tur: 'AVANS', tutar: '', metin: '' },
  )
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  async function onSave() {
    setError('')
    let tutarKurus: number | null = null
    if (modal.tur === 'AVANS') {
      tutarKurus = parseTLToKurus(modal.tutar)
      if (tutarKurus === null || tutarKurus <= 0) {
        setError('Geçerli bir tutar girin.')
        return
      }
      // maaş girilmemişse (0) sınır yok — server-side trigger da aynı kuralı uygular
      if (maasKurus > 0 && tutarKurus > maasKurus) {
        setError(`Avans isteği maaşınızdan (${formatTL(maasKurus)}) büyük olamaz.`)
        return
      }
    } else if (!modal.metin.trim()) {
      setError('Açıklama girin.')
      return
    }
    try {
      await createIstek.mutateAsync({
        businessId,
        tur: modal.tur,
        tutarKurus,
        metin: modal.metin.trim(),
      })
      setModal((m) => ({ ...m, open: false }))
      setToast('İsteğiniz gönderildi.')
    } catch {
      setError('Gönderilemedi. Tekrar deneyin.')
    }
  }

  return (
    <div className="screen-forward">
      <div className="px-6 pt-5">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">İşlemler</h1>
        <p className="mt-1 text-[14px] text-muted">Yönetime istek gönderin</p>
      </div>

      {/* Mesai Giriş/Çıkış — Kayıt ekranındakiyle aynı kart */}
      <div className="px-6 pt-[14px]">
        <button
          type="button"
          onClick={() => void navigate('/mesai')}
          className="pressable flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-ink px-4 py-[14px] text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">Mesai Giriş/Çıkış</span>
            <span className="block text-[12px] text-white/60">Gün içi mesai saatlerinizi kaydedin</span>
          </span>
          <svg width="9" height="16" viewBox="0 0 9 16" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 1 8 8 1 15" />
          </svg>
        </button>
      </div>

      {toast && (
        <div className="menu-in mx-6 mt-4 rounded-[14px] bg-success-soft px-4 py-3 text-center text-[13px] font-semibold text-success">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-3 px-6 pt-5">
        {ACTIONS.map((a) => (
          <button
            key={a.tur}
            type="button"
            onClick={() => {
              setError('')
              setModal({ open: true, tur: a.tur, tutar: '', metin: '' })
            }}
            className="pressable flex w-full cursor-pointer items-center gap-[14px] rounded-[18px] bg-card px-4 py-4 text-left"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
              style={{ background: a.iconBg }}
            >
              {a.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-ink">{a.label}</span>
              <span className="mt-[1px] block text-[12.5px] text-muted">{a.desc}</span>
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => void navigate('/isteklerim')}
          className="pressable mt-2 flex w-full cursor-pointer items-center justify-between rounded-[16px] bg-ink px-5 py-4"
        >
          <span className="text-[16px] font-bold text-white">İsteklerim</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <div className="h-10" />

      <FormModal
        open={modal.open}
        title={TITLES[modal.tur]}
        error={error}
        busy={createIstek.isPending}
        confirmLabel="Gönder"
        onConfirm={() => void onSave()}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      >
        {modal.tur === 'AVANS' && (
          <div>
            <div className={modalFieldLabel}>TUTAR (₺)</div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={modal.tutar}
              onChange={(e) => setModal((m) => ({ ...m, tutar: e.target.value }))}
              className={modalInputCls}
            />
          </div>
        )}
        <div>
          <div className={modalFieldLabel}>
            AÇIKLAMA{modal.tur === 'AVANS' ? ' (İSTEĞE BAĞLI)' : ''}
          </div>
          <textarea
            rows={4}
            value={modal.metin}
            onChange={(e) => setModal((m) => ({ ...m, metin: e.target.value }))}
            placeholder={
              modal.tur === 'AVANS'
                ? 'Örn. acil ihtiyaç'
                : modal.tur === 'SIKAYET'
                  ? 'Şikayetinizi yazın…'
                  : 'Önerinizi yazın…'
            }
            className={`${modalInputCls} resize-none`}
          />
        </div>
        <p className="text-xs leading-relaxed text-faint">
          İsteğiniz yönetime iletilir; durumunu İsteklerim ekranından takip edebilirsiniz.
        </p>
      </FormModal>
    </div>
  )
}
