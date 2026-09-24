export const SITE_TITLE = '美欧日汽车产业对华动态';
export const SITE_DESCRIPTION =
  '持续跟踪美国、欧洲、日本三大区针对中国汽车产业的地缘政治动态：关税、技术安全审查、供应链本地化、中国车企出海与本土车企在华处境。每周四更新。';

export type RegionKey = 'us' | 'eu' | 'japan';

export const REGIONS: Record<
  RegionKey,
  { name: string; short: string; flag: string; blurb: string; order: number }
> = {
  us: {
    name: '美国',
    short: '美',
    flag: '🇺🇸',
    blurb: '232/301 关税、互联汽车禁令立法（S.4429）、USMCA 审查与 45X/PFE 电池限制。',
    order: 1,
  },
  eu: {
    name: '欧洲',
    short: '欧',
    flag: '🇪🇺',
    blurb: '反补贴税与价格承诺、混动份额博弈、中资投资审查条件、2035 目标与本地化建厂。',
    order: 2,
  },
  japan: {
    name: '日本',
    short: '日',
    flag: '🇯🇵',
    blurb: 'CEV 补贴评分、经济安全与稀土供应链、比亚迪轻型 EV 入市、日系在华重构。',
    order: 3,
  },
};

export const REGION_ORDER: RegionKey[] = ['us', 'eu', 'japan'];

/** 拼接 base 前缀的站内链接。 */
export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** 将 YYYY-MM-DD 显示为「2026 年 9 月 24 日」。 */
export function formatDateZh(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

/** 返回北京时间下一次「周四 18:00」的日期（YYYY-MM-DD）。 */
export function nextThursdayBeijing(now: Date = new Date()): string {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const day = beijing.getUTCDay(); // 0=周日 … 4=周四
  let delta = (4 - day + 7) % 7;
  if (delta === 0 && beijing.getUTCHours() >= 18) delta = 7;
  const next = new Date(Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate() + delta));
  return next.toISOString().slice(0, 10);
}
