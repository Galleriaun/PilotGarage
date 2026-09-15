import type { Row, SheetData } from 'write-excel-file/universal'
import { formatDateDots } from '../../lib/dates'
import {
  excelFiltreMetinleri,
  excelSeriTarih,
  excelSeriZaman,
  type ExcelFiltre,
  type ExcelOzet,
  type ExcelSatir,
} from './excel'
import type { Kategori } from './types'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const TL_FORMAT = '#,##0.00 "₺";[Red]-#,##0.00 "₺"'
const TARIH_FORMAT = 'dd.mm.yyyy'
const ZAMAN_FORMAT = 'dd.mm.yyyy hh:mm'

/** Tutarı gizli maaş satırı (063). Owner: "Gizli" yazılmaz, yalnızca nokta. */
export const GIZLI_TUTAR = '....'

const BASLIKLAR = [
  'Tarih',
  'Tür',
  'Açıklama',
  'Müşteri / İşletme',
  'Kategori',
  'Ödeme Yöntemi',
  'Kaynak',
  'Tutar (₺)',
  'Oluşturan',
  'Oluşturulma',
] as const

const SUTUN_GENISLIKLERI = [12, 10, 40, 26, 18, 15, 15, 16, 20, 17]

function baslikSatiri(): Row {
  return BASLIKLAR.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8F5EC' }))
}

/** kuruş → Excel sayısı. Hesaplar tam sayı kuruşta yapıldı; bölme yalnızca gösterim için. */
function tl(kurus: number) {
  return { value: kurus / 100, type: Number, format: TL_FORMAT }
}

function islemSatiri(s: ExcelSatir): Row {
  const i = s.islem
  return [
    // Tarihler seri numarası + biçim: kütüphanenin Date → saat dilimi dönüşümüne hiç girilmez
    { value: excelSeriTarih(i.islem_tarihi), type: Number, format: TARIH_FORMAT },
    s.tur,
    // Metin hücreleri sharedStrings'e yazılır — "=..." ile başlayan başlık formül OLMAZ
    i.baslik,
    s.musteri || null,
    s.kategori || null,
    s.yontem || null,
    s.kaynak,
    s.kurus === null ? { value: GIZLI_TUTAR, type: String, align: 'right' as const } : tl(s.kurus),
    i.creator?.full_name ?? 'Otomatik',
    { value: excelSeriZaman(i.created_at), type: Number, format: ZAMAN_FORMAT },
  ]
}

function etiket(value: string): { value: string; fontWeight: 'bold' } {
  return { value, fontWeight: 'bold' }
}

function ozetVerisi(a: ExcelDosyaGirdisi): SheetData {
  const { ozet, filtre } = a
  const f = excelFiltreMetinleri(filtre, a.kategoriler)
  const satirlar: SheetData = [
    [etiket('İşletme'), a.isletmeAdi],
    [etiket('Tarih aralığı'), `${formatDateDots(filtre.baslangic)} – ${formatDateDots(filtre.bitis)}`],
    [etiket('Tür'), f.tur],
    [etiket('Yalnızca kayıt işlemleri'), f.yalnizcaKayit],
    [etiket('Ödeme yöntemi'), f.yontem],
    [etiket('Kategori'), f.kategori],
    [null],
    [etiket('İşlem sayısı'), { value: ozet.islemSayisi, type: Number }],
    [etiket('Toplam gelir'), tl(ozet.gelirKurus)],
    [etiket('Toplam gider'), tl(ozet.giderKurus)],
    [etiket('Net'), tl(ozet.netKurus)],
    [etiket('Nakit (net)'), tl(ozet.nakitKurus)],
    [etiket('Kredi Kartı (net)'), tl(ozet.kkKurus)],
    [etiket('Havale (net)'), tl(ozet.havaleKurus)],
  ]
  if (ozet.gizliSayisi > 0) {
    satirlar.push([etiket('Not'), `${ozet.gizliSayisi} maaş ödemesinin tutarı toplamlara dahil değildir.`])
  }
  if (ozet.yontemsizSayisi > 0) {
    satirlar.push([
      etiket('Not'),
      `${ozet.yontemsizSayisi} işlemin ödeme yöntemi yok; Nakit / Kredi Kartı / Havale toplamlarına girmez.`,
    ])
  }
  satirlar.push(
    [null],
    [etiket('Oluşturan'), a.olusturan || null],
    [etiket('Oluşturulma'), { value: excelSeriZaman(new Date().toISOString()), type: Number, format: ZAMAN_FORMAT }],
  )
  return satirlar
}

export interface ExcelDosyaGirdisi {
  satirlar: ExcelSatir[]
  ozet: ExcelOzet
  filtre: ExcelFiltre
  kategoriler: Kategori[]
  isletmeAdi: string
  olusturan: string
  dosyaAdi: string
}

/**
 * .xlsx dosyasını üretir. Kütüphane yalnızca burada, dışa aktarım anında yüklenir
 * (ayrı chunk) — Finans ekranının açılış paketine girmez.
 */
export async function excelDosyasiOlustur(a: ExcelDosyaGirdisi): Promise<File> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const blob = await writeExcelFile(
    [
      {
        data: [baslikSatiri(), ...a.satirlar.map(islemSatiri)],
        sheet: 'İşlemler',
        columns: SUTUN_GENISLIKLERI.map((width) => ({ width })),
        stickyRowsCount: 1,
      },
      {
        data: ozetVerisi(a),
        sheet: 'Özet',
        columns: [{ width: 26 }, { width: 48 }],
      },
    ],
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toBlob()
  return new File([blob], a.dosyaAdi, { type: XLSX_MIME })
}

function iosCihaz(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ kendini Mac olarak tanıtır; dokunmatik olduğu için ayrılır
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/**
 * Dosyayı kullanıcıya verir. Kullanıcının dokunuşu İÇİNDE çağrılmalı: iOS'ta
 * share() kullanıcı etkinleşmesi ister ve bir ağ gidiş-dönüşü onu öldürür
 * (Mesai konum izni dersi) — bu yüzden modal iki adımlı: Oluştur → İndir.
 *   • iOS: paylaşım sayfası ("Dosyalara Kaydet") — ana ekran PWA'sında blob
 *     indirmesi güvenilir değil.
 *   • Diğerleri: klasik indirme.
 */
export async function excelIndir(file: File): Promise<void> {
  if (iosCihaz() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch (err) {
      // kullanıcı paylaşım sayfasını kapattı — hata değil
      if ((err as { name?: unknown } | null)?.name === 'AbortError') return
      // başka bir paylaşım hatası: klasik indirmeye düş
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // hemen iptal edilirse bazı tarayıcılar indirmeyi yarıda keser
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
