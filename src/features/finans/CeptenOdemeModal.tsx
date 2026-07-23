import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { formatTL, parseTLToKurus } from '../../lib/money'
import { rpcErrorText } from '../../lib/errors'
import { useMembers } from '../yonetim/api'
import { ChevronDownIcon } from '../kayit/icons'
import { useCeptenOdeme } from './api'

const inputCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none placeholder:text-faint'

/**
 * Cepten Ödeme (052): bir yönetici işletmenin giderini KENDİ cebinden ödedi.
 * Gider zaten kasaya işlendiği (ve nakit kovasını düşürdüğü) için burada aynı
 * tutarda NAKİT GELİR yazılır — kova geri yükselir — ve tutar o yöneticiye
 * "verilecek" olarak Personel Detay'da görünür.
 *
 * Nakit satırı tutar yazıldıkça CANLI yükselir (yeşil ↑ çipi), böylece sonuç
 * gönderilmeden önce görünür. Yalnızca Yönetici (RPC de öyle).
 */
export default function CeptenOdemeModal({
  open,
  businessId,
  nakitKurus,
  onClose,
}: {
  open: boolean
  businessId: string
  /** mevcut NAKİT kova bakiyesi (tüm zamanlar) */
  nakitKurus: number
  onClose: () => void
}) {
  const cepten = useCeptenOdeme()
  const { data: members = [] } = useMembers(businessId)
  const [yoneticiId, setYoneticiId] = useState('')
  const [amount, setAmount] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  // borç yalnızca bir yöneticiye yazılabilir (RPC de rolü doğrular)
  const yoneticiler = members.filter(
    (m) => m.profile.role === 'YONETICI' && m.profile.status === 'ACTIVE',
  )
  const secili = yoneticiler.find((m) => m.profile_id === yoneticiId)

  const kurus = parseTLToKurus(amount)
  const eklenen = kurus !== null && kurus > 0 ? kurus : 0
  const yeniNakit = nakitKurus + eklenen
  const gecerli = eklenen > 0 && yoneticiId !== ''

  function close() {
    setYoneticiId('')
    setAmount('')
    setAciklama('')
    setError('')
    setMenuOpen(false)
    onClose()
  }

  async function onOde() {
    setError('')
    if (yoneticiId === '') {
      setError('Yönetici seçin.')
      return
    }
    if (!gecerli) {
      setError('Geçerli bir tutar girin.')
      return
    }
    try {
      await cepten.mutateAsync({
        businessId,
        yoneticiId,
        kurus: eklenen,
        aciklama: aciklama.trim(),
      })
      close()
    } catch (e) {
      setError(rpcErrorText(e, 'Kaydedilemedi. Tekrar deneyin.'))
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !cepten.isPending) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-64px)] max-w-[330px] -translate-x-1/2 -translate-y-1/2 outline-none">
          <div className="modal-pop max-h-[90dvh] overflow-y-auto rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <Dialog.Title className="text-center text-[19px] font-bold text-ink">
              Cepten Ödeme
            </Dialog.Title>
            <Dialog.Description className="mb-4 mt-[2px] text-center text-[12.5px] leading-relaxed text-muted">
              Yönetici nakit gider ödemesi
            </Dialog.Description>

            {/* Nakit kovası — girilen tutar kadar CANLI yükselir */}
            <div className="mb-5 flex items-center gap-[10px] rounded-[14px] bg-card px-4 py-[13px]">
              <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#15803D]" />
              <span className="text-[13px] font-semibold text-soft">Nakit</span>
              <span className="ml-auto truncate text-[15px] font-bold text-ink">
                {formatTL(yeniNakit)}
              </span>
              {eklenen > 0 && (
                <span className="shrink-0 rounded-[7px] bg-[#F0FDF4] px-[7px] py-[3px] text-[11.5px] font-bold text-[#15803D]">
                  ↑{formatTL(eklenen)}
                </span>
              )}
            </div>

            {/* Yönetici seçimi */}
            <div className="mb-4">
              <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                YÖNETİCİ
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={`${inputCls} flex cursor-pointer items-center justify-between text-left`}
              >
                <span className={secili ? 'truncate text-ink' : 'truncate text-faint'}>
                  {secili?.profile.full_name || 'Yönetici seçin'}
                </span>
                <ChevronDownIcon size={12} color="var(--color-ink)" rotated={menuOpen} />
              </button>
              {menuOpen && (
                <div className="menu-in mt-[6px] flex flex-col gap-[2px] rounded-[12px] bg-card p-[6px]">
                  {yoneticiler.length === 0 && (
                    <div className="px-3 py-[10px] text-[13px] text-muted">
                      Bu işletmede aktif yönetici yok.
                    </div>
                  )}
                  {yoneticiler.map((m) => (
                    <button
                      key={m.profile_id}
                      type="button"
                      onClick={() => {
                        setYoneticiId(m.profile_id)
                        setMenuOpen(false)
                        setError('')
                      }}
                      className="cursor-pointer rounded-[10px] px-3 py-[10px] text-left text-[14px] font-semibold text-ink"
                      style={{
                        background:
                          m.profile_id === yoneticiId ? 'var(--seg)' : 'transparent',
                      }}
                    >
                      {m.profile.full_name || 'İsimsiz'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                MİKTAR (₺)
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setError('')
                }}
                className={inputCls}
              />
            </div>

            <div className="mb-5">
              <div className="mb-[6px] text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                AÇIKLAMA
              </div>
              <input
                type="text"
                placeholder="İsteğe bağlı"
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                className={inputCls}
              />
            </div>

            {error && <p className="mb-3 text-center text-[13px] text-danger">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={cepten.isPending}
                className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink disabled:opacity-60"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => void onOde()}
                disabled={cepten.isPending || !gecerli}
                className="flex-1 cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {cepten.isPending ? '…' : 'Öde'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
