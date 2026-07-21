import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { formatTL, parseTLToKurus } from '../../lib/money'
import { useParaTransferi } from './api'

const inputCls =
  'w-full rounded-[12px] border-none bg-field px-[14px] py-[13px] text-[15px] text-ink outline-none placeholder:text-faint'

/**
 * Hesaba Para Aktarımı (041): Nakit → Kredi Kartı.
 *
 * İki bakiye satırı tutar yazıldıkça CANLI güncellenir (nakit düşer, KK artar),
 * böylece kullanıcı sonucu göndermeden önce görür.
 *
 * 043: aktarılan tutar mevcut NAKİT bakiyeyi AŞAMAZ — bakiyeyi aşacak tuş
 * vuruşu hiç kabul edilmez (yazılamaz). Gerçek sınır sunucudadır
 * (`para_transferi` RPC'si aynı kontrolü yapar); buradaki yalnızca UX.
 */
export default function TransferModal({
  open,
  businessId,
  nakitKurus,
  kkKurus,
  onClose,
}: {
  open: boolean
  businessId: string
  nakitKurus: number
  kkKurus: number
  onClose: () => void
}) {
  const transfer = useParaTransferi()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)

  // aktarılabilir tavan: nakit bakiyesi (zaten eksideyse hiçbir şey aktarılamaz)
  const maxKurus = Math.max(nakitKurus, 0)
  const bakiyeYok = maxKurus === 0

  const kurus = parseTLToKurus(amount)
  const gecerli = kurus !== null && kurus > 0 && kurus <= maxKurus
  // canlı önizleme: girilen tutar kovalar arasında taşınmış gibi göster
  const tasinan = gecerli ? kurus : 0
  const yeniNakit = nakitKurus - tasinan
  const yeniKk = kkKurus + tasinan

  /**
   * Tavanı aşan değeri hiç kabul etme. Parse EDİLEMEYEN ara girişler
   * ("12," gibi) serbest bırakılır — yoksa ondalık yazılamazdı; onlar zaten
   * `gecerli` olmadığı için Transfer Et'te durur.
   */
  function onAmountChange(next: string) {
    const k = parseTLToKurus(next)
    if (k !== null && k > maxKurus) return
    setAmount(next)
    setError('')
  }

  function close() {
    setAmount('')
    setError('')
    setConfirm(false)
    onClose()
  }

  function onTransferEt() {
    setError('')
    if (kurus !== null && kurus > maxKurus) {
      setError(`Nakit hesabında yeterli bakiye yok. En fazla ${formatTL(maxKurus)} aktarabilirsiniz.`)
      return
    }
    if (!gecerli) {
      setError('Geçerli bir tutar girin.')
      return
    }
    setConfirm(true)
  }

  async function onConfirm() {
    if (kurus === null) return
    setError('')
    try {
      await transfer.mutateAsync({ businessId, kurus })
      close()
    } catch (e) {
      setConfirm(false)
      // Sunucunun kendi mesajını göster: eldeki bakiye bayatsa (başka bir
      // cihazdan işlem geçmişse) "yeterli bakiye yok" burada görünmeli.
      const msg = (e as { message?: string } | null)?.message
      setError(msg && msg.includes('bakiye') ? msg : 'Aktarım yapılamadı. Tekrar deneyin.')
    }
  }

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next && !transfer.isPending) close()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-64px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 outline-none">
            <div className="modal-pop max-h-[90dvh] overflow-y-auto rounded-[20px] bg-white px-[22px] py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
              <Dialog.Title className="mb-1 text-center text-[19px] font-bold text-ink">
                Para Transferi
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-center text-[12.5px] leading-relaxed text-muted">
                Nakit hesabındaki parayı kredi kartı hesabına aktar
              </Dialog.Description>

              {/* Kaynak → hedef, canlı bakiyelerle */}
              <div className="mb-5 rounded-[14px] bg-card px-4 py-[14px]">
                <div className="flex items-center gap-[10px]">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#15803D]" />
                  <span className="text-[13px] font-semibold text-soft">Nakit</span>
                  <span
                    className="ml-auto truncate text-[15px] font-bold"
                    style={{ color: yeniNakit < 0 ? '#C62828' : 'var(--color-ink)' }}
                  >
                    {formatTL(yeniNakit)}
                  </span>
                </div>
                <div className="my-[6px] ml-[3px] flex items-center gap-[10px]">
                  <svg width="13" height="16" viewBox="0 0 13 16" fill="none" stroke="var(--color-faint)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 1v11" />
                    <polyline points="1 9 3 12 5 9" />
                  </svg>
                  {tasinan > 0 && (
                    <span className="text-[11.5px] font-semibold text-faint">
                      {formatTL(tasinan)} aktarılıyor
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-[10px]">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#2A5BD7]" />
                  <span className="text-[13px] font-semibold text-soft">Kredi Kartı</span>
                  <span className="ml-auto truncate text-[15px] font-bold text-ink">
                    {formatTL(yeniKk)}
                  </span>
                </div>
              </div>

              <div className="mb-5">
                <div className="mb-[6px] flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-[0.6px] text-faint">
                  <span>MİKTAR (₺)</span>
                  {!bakiyeYok && (
                    <span className="ml-auto normal-case tracking-normal">
                      En fazla {formatTL(maxKurus)}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  disabled={bakiyeYok}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className={`${inputCls} disabled:opacity-60`}
                />
                {bakiyeYok && (
                  <p className="mt-[6px] text-[12px] text-muted">
                    Nakit hesabında aktarılabilir bakiye yok.
                  </p>
                )}
              </div>

              {error && <p className="mb-3 text-center text-[13px] text-danger">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={transfer.isPending}
                  className="flex-1 cursor-pointer rounded-[12px] bg-field py-3 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={onTransferEt}
                  disabled={transfer.isPending || bakiyeYok}
                  className="flex-1 cursor-pointer rounded-[12px] bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Transfer Et
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirm}
        title="Para Transferi"
        message={`${formatTL(tasinan)} nakit hesabından kredi kartı hesabına aktarılacak. Onaylıyor musunuz?`}
        confirmLabel="Aktar"
        busy={transfer.isPending}
        onConfirm={() => void onConfirm()}
        onCancel={() => setConfirm(false)}
      />
    </>
  )
}
