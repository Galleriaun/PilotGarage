import { istanbulDateTimeLocal, istanbulTodayISO, shiftDaysISO } from '../../lib/dates'
import type { OdemeYontemi, Role } from '../../lib/types'
import { islemMusteri, isTransfer, maasTutariGizli } from './selectors'
import { ODEME_YONTEMI_LABELS, type Islem, type IslemTur, type Kategori } from './types'

/**
 * Finans → Excel dışa aktarım: saf kurallar (React/Supabase yok — test edilebilir).
 * Dosyayı yazan kısım excelDosya.ts, veriyi çeken fetchIslemlerExcel (api.ts).
 */

export type ExcelTarihSecimi = 'BUGUN' | 'SON_7' | 'SON_30' | 'OZEL'

export interface ExcelTarihAraligi {
  /** YYYY-MM-DD, dâhil */
  baslangic: string
  /** YYYY-MM-DD, dâhil */
  bitis: string
}

export interface ExcelFiltre extends ExcelTarihAraligi {
  /** null = gelir + gider (+ transfer) */
  tur: IslemTur | null
  yalnizcaKayit: boolean
  /** boş = hepsi */
  yontemler: OdemeYontemi[]
  /** boş = hepsi */
  kategoriIdler: string[]
}

/** Gerçek bir takvim günü mü? ("2026-02-30" gibi taşan tarihleri reddeder) */
function gecerliTarih(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && shiftDaysISO(iso, 0) === iso
}

/**
 * Seçilen tarih aralığı (Istanbul günü). Son 7 gün = bugün dâhil 7 gün (Tüm
 * İşlemler "Hafta" ile aynı). Özel aralık geçersizse null — dosya oluşturulmaz.
 */
export function excelTarihAraligi(
  secim: ExcelTarihSecimi,
  ozel: ExcelTarihAraligi,
  bugun: string = istanbulTodayISO(),
): ExcelTarihAraligi | null {
  switch (secim) {
    case 'BUGUN':
      return { baslangic: bugun, bitis: bugun }
    case 'SON_7':
      return { baslangic: shiftDaysISO(bugun, -6), bitis: bugun }
    case 'SON_30':
      return { baslangic: shiftDaysISO(bugun, -29), bitis: bugun }
    case 'OZEL':
      if (!gecerliTarih(ozel.baslangic) || !gecerliTarih(ozel.bitis)) return null
      if (ozel.baslangic > ozel.bitis) return null
      return { baslangic: ozel.baslangic, bitis: ozel.bitis }
  }
}

export interface ExcelSatir {
  islem: Islem
  tur: 'Gelir' | 'Gider' | 'Transfer'
  kaynak: string
  musteri: string
  kategori: string
  yontem: string
  /** İşaretli tutar (gelir +, gider −). null = maaş tutarı bu kullanıcıdan gizli (063). */
  kurus: number | null
}

/**
 * Kaynak sütunu. Transfer satırlarında geri alma ayrımı yapılmaz: eş bacak
 * (transfer_of) iade bağını taşımaz, "Aktarım Geri Alma" yalnızca bir bacağa
 * yazılırsa yanlış olur — açıklama sütunu başlığı zaten taşır.
 */
export function excelKaynakEtiketi(i: Islem): string {
  if (i.komisyon_of != null) return 'KK Komisyonu'
  switch (i.kaynak) {
    case 'KAYIT':
      return 'Kayıt'
    case 'CARI_HESAP':
      return 'Cari Hesap'
    case 'SABIT_GIDER':
      return 'Sabit Gider'
    case 'PERSONEL': {
      const tur = i.personel_odeme?.[0]?.tur
      return tur === 'MAAS' ? 'Maaş' : tur === 'AVANS' ? 'Avans' : tur === 'PRIM' ? 'Prim' : 'Personel'
    }
    case 'TRANSFER':
      return 'Aktarım'
    case 'CEPTEN':
      return 'Cepten Ödeme'
    case 'MANUEL':
      return i.tekrar_kural_id != null ? 'Tekrarlanan' : 'Manuel'
  }
}

/** Sunucu süzgeci ile AYNI kural istemcide de uygulanır (savunma + test edilebilirlik). */
function filtredenGecer(i: Islem, f: ExcelFiltre): boolean {
  if (i.durum !== 'ONAYLANDI') return false
  if (i.islem_tarihi < f.baslangic || i.islem_tarihi > f.bitis) return false
  if (f.tur !== null) {
    // Gelir/Gider süzgecinde transfer hiç yok (Tüm İşlemler ile aynı, 041)
    if (isTransfer(i) || i.tur !== f.tur) return false
  }
  if (f.yalnizcaKayit && i.kaynak !== 'KAYIT') return false
  if (f.yontemler.length > 0 && (i.odeme_yontemi === null || !f.yontemler.includes(i.odeme_yontemi))) {
    return false
  }
  if (f.kategoriIdler.length > 0 && (i.kategori_id === null || !f.kategoriIdler.includes(i.kategori_id))) {
    return false
  }
  return true
}

/**
 * Dosyanın satırları, kronolojik (işlem tarihi → oluşturulma → id). Transferin
 * İKİ bacağı da ayrı satırdır: her biri gerçek bir kova hareketi (Nakit çıkışı,
 * KK girişi) — tek satır gösterilirse yöntem süzgeciyle kova toplamı tutmaz.
 */
export function excelSatirlari(islemler: Islem[], f: ExcelFiltre, role: Role | null | undefined): ExcelSatir[] {
  return islemler
    .filter((i) => filtredenGecer(i, f))
    .sort((a, b) =>
      a.islem_tarihi !== b.islem_tarihi
        ? a.islem_tarihi < b.islem_tarihi ? -1 : 1
        : a.created_at !== b.created_at
          ? a.created_at < b.created_at ? -1 : 1
          : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    .map((i) => ({
      islem: i,
      tur: isTransfer(i) ? 'Transfer' : i.tur === 'GELIR' ? 'Gelir' : 'Gider',
      kaynak: excelKaynakEtiketi(i),
      musteri: islemMusteri(i) ?? '',
      kategori: i.kategori?.label ?? '',
      yontem: i.odeme_yontemi ? ODEME_YONTEMI_LABELS[i.odeme_yontemi] : '',
      kurus: maasTutariGizli(i, role) ? null : i.tur === 'GELIR' ? i.kurus : -i.kurus,
    }))
}

export interface ExcelOzet {
  islemSayisi: number
  gelirKurus: number
  giderKurus: number
  netKurus: number
  nakitKurus: number
  kkKurus: number
  havaleKurus: number
  /** tutarı gizli satır sayısı — hiçbir toplama girmez */
  gizliSayisi: number
  /** yöntemi olmayan (görünür) satır — Nakit/KK/Havale toplamına girmez */
  yontemsizSayisi: number
}

/**
 * Tüm İşlemler özet çubuğuyla aynı kural (041): Gelir/Gider transferi DIŞLAR,
 * yöntem kovaları DÂHİL eder. Tutarı gizli satır hiçbir toplama girmez — yoksa
 * gizli maaş toplamdan çıkarılarak bulunurdu. Tamamı tam sayı kuruş.
 */
export function excelOzet(satirlar: ExcelSatir[]): ExcelOzet {
  const o: ExcelOzet = {
    islemSayisi: satirlar.length,
    gelirKurus: 0,
    giderKurus: 0,
    netKurus: 0,
    nakitKurus: 0,
    kkKurus: 0,
    havaleKurus: 0,
    gizliSayisi: 0,
    yontemsizSayisi: 0,
  }
  for (const s of satirlar) {
    if (s.kurus === null) {
      o.gizliSayisi++
      continue
    }
    if (!isTransfer(s.islem)) {
      if (s.kurus >= 0) o.gelirKurus += s.kurus
      else o.giderKurus -= s.kurus
    }
    const y = s.islem.odeme_yontemi
    if (y === 'NAKIT') o.nakitKurus += s.kurus
    else if (y === 'KREDI_KARTI') o.kkKurus += s.kurus
    else if (y === 'HAVALE') o.havaleKurus += s.kurus
    else o.yontemsizSayisi++
  }
  o.netKurus = o.gelirKurus - o.giderKurus
  return o
}

/** Özet sayfası için süzgeçlerin okunur hâli. */
export function excelFiltreMetinleri(
  f: ExcelFiltre,
  kategoriler: Kategori[],
): { tur: string; yalnizcaKayit: string; yontem: string; kategori: string } {
  return {
    tur: f.tur === 'GELIR' ? 'Gelir' : f.tur === 'GIDER' ? 'Gider' : 'Tümü',
    yalnizcaKayit: f.yalnizcaKayit ? 'Evet' : 'Hayır',
    yontem: f.yontemler.length === 0 ? 'Hepsi' : f.yontemler.map((y) => ODEME_YONTEMI_LABELS[y]).join(', '),
    kategori:
      f.kategoriIdler.length === 0
        ? 'Hepsi'
        : f.kategoriIdler.map((id) => kategoriler.find((k) => k.id === id)?.label ?? '?').join(', '),
  }
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const GUN_MS = 86_400_000

/**
 * "YYYY-MM-DD" → Excel tarih seri numarası (1899-12-30 = 0). UTC matematiği:
 * cihazın saat dilimi hesaba hiç girmez, gün kayması olamaz.
 */
export function excelSeriTarih(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - EXCEL_EPOCH_MS) / GUN_MS
}

/** timestamptz → Istanbul duvar saatiyle Excel tarih-saat seri numarası. */
export function excelSeriZaman(timestamptz: string): number {
  const [tarih = '1970-01-01', saat = '00:00'] = istanbulDateTimeLocal(timestamptz).split('T')
  const [h, dk] = saat.split(':').map(Number)
  return excelSeriTarih(tarih) + ((h ?? 0) * 60 + (dk ?? 0)) / 1440
}

const TR_ASCII: Record<string, string> = {
  ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
}

/** Islemler_<isletme>_<baslangic>_<bitis>.xlsx — yalnızca ASCII (her cihazda güvenli). */
export function excelDosyaAdi(isletmeAdi: string, aralik: ExcelTarihAraligi): string {
  const ad =
    isletmeAdi
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_ASCII[c] ?? c)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'Isletme'
  return `Islemler_${ad}_${aralik.baslangic}_${aralik.bitis}.xlsx`
}
