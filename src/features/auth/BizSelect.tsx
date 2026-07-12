import { useNavigate } from 'react-router'
import { useBusiness } from '../../app/providers/BusinessProvider'
import { Splash } from '../../app/guards'
import type { Business } from '../../lib/types'

function WrenchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <path d="M16 8h4l3 3v3h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ADADAD"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function BusinessCard({ business, onSelect }: { business: Business; onSelect: () => void }) {
  const isServis = business.code === 'SERVIS'
  return (
    <button
      type="button"
      onClick={onSelect}
      className="pressable flex w-full cursor-pointer items-center justify-between rounded-[20px] bg-card px-6 py-16 text-left md:flex-col md:justify-center md:gap-6 md:py-24 md:transition-shadow md:hover:shadow-[0_12px_32px_rgba(0,0,0,0.09)]"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] md:h-20 md:w-20 md:rounded-[22px] ${
          isServis ? 'bg-ink' : 'bg-danger'
        }`}
      >
        {isServis ? <WrenchIcon /> : <TruckIcon />}
      </span>
      <span className="text-[20px] font-bold tracking-[-0.3px] text-ink md:text-[24px]">
        {business.name}
      </span>
      <span className="md:hidden">
        <ChevronRight />
      </span>
    </button>
  )
}

export default function BizSelect() {
  const navigate = useNavigate()
  const { businesses, businessesLoading, selectBusiness } = useBusiness()

  if (businessesLoading) return <Splash />

  function choose(id: string) {
    selectBusiness(id)
    void navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-7 pb-10 screen-forward md:max-w-[960px]">
      <div className="pt-11 md:pt-20 md:text-center">
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-0.5px] text-ink md:text-[32px]">
          İşletme Seç
        </h1>
        <p className="hidden text-[15px] text-muted md:mt-2 md:block">
          Çalışmak istediğiniz işletmeyi seçin
        </p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-[14px] pb-[60px] pt-12 md:grid md:content-center md:grid-cols-2 md:gap-6">
        {businesses.length === 0 ? (
          <p className="text-center text-[15px] leading-relaxed text-muted">
            Henüz bir işletmeye erişiminiz yok. Yöneticinizin size işletme ataması gerekiyor.
          </p>
        ) : (
          businesses.map((b) => (
            <BusinessCard key={b.id} business={b} onSelect={() => choose(b.id)} />
          ))
        )}
      </div>
    </div>
  )
}
