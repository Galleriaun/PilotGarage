import { useNavigate } from 'react-router'
import { BellOutlineIcon } from '../kayit/icons'
import { TrashIcon } from '../yonetim/shared'
import { useBildirimler } from './api'

/** Header bell — unread badge, opens /bildirimler. */
export function BellButton() {
  const navigate = useNavigate()
  const { data: bildirimler = [] } = useBildirimler()
  const unread = bildirimler.filter((b) => !b.read_at).length
  return (
    <button
      type="button"
      aria-label="Bildirimler"
      onClick={() => void navigate('/bildirimler')}
      className="relative flex h-9 w-9 cursor-pointer items-center justify-center"
    >
      <BellOutlineIcon />
      {unread > 0 && (
        <span className="absolute right-0 top-[2px] flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

/** Header trash — opens the Çöp Kutusu (finance screens only). */
export function TrashHeaderButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      aria-label="Çöp Kutusu"
      onClick={() => void navigate('/yonetim/cop')}
      className="flex h-9 w-9 cursor-pointer items-center justify-center"
    >
      <TrashIcon size={17} />
    </button>
  )
}
