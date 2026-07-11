import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { formatCreatedStamp } from '../../lib/dates'
import { BackChevron } from '../auth/EyeIcon'
import { TrashIcon } from '../yonetim/shared'
import { useTrashItems } from './api'

const TYPE_LABELS: Record<string, string> = {
  KAYIT: 'Kayıt',
  ISLETME: 'İşletme',
  HAREKET: 'Hareket',
  SABIT_GIDER: 'Sabit Gider',
  TEKRAR: 'Tekrarlanan İşlem',
}

export default function Cop() {
  const navigate = useNavigate()
  const { activeBusiness } = useBusiness()
  const { data: items = [], isPending } = useTrashItems(activeBusiness?.id ?? '')

  return (
    <div className="screen-forward">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="inline-flex cursor-pointer items-center gap-1 py-[6px]"
        >
          <BackChevron />
          <span className="text-[15px] font-medium text-ink">Geri</span>
        </button>
      </div>

      <div className="px-6 pt-4">
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-ink">Çöp Kutusu</h1>
        <p className="mt-1 text-[13px] text-muted">Son 50 silinen öğe burada saklanır.</p>
      </div>

      {isPending ? (
        <div className="flex justify-center py-14">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-divider border-t-ink" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-[70px] text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[17px] bg-field">
            <TrashIcon size={22} />
          </div>
          <div className="mb-1 text-base font-bold text-ink">Çöp kutusu boş</div>
          <div className="text-[13px] text-muted">Silinen öğeler burada görünecek.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-6 pt-[18px]">
          {items.map((t) => (
            <div key={t.id} className="rounded-[16px] bg-card px-4 py-[13px]">
              <div className="truncate text-sm font-bold text-ink">{t.title}</div>
              <div className="mt-[3px] flex items-center gap-2 text-[11px] text-faint">
                <span className="rounded-[6px] bg-[#EBEBEB] px-[7px] py-[2px] text-[10.5px] font-semibold text-[#555]">
                  {TYPE_LABELS[t.item_type] ?? t.item_type}
                </span>
                {formatCreatedStamp(t.deleted_at)}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
