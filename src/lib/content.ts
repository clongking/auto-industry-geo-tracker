import { getCollection, type CollectionEntry } from 'astro:content';
import { REGIONS, type RegionKey } from './site';

export type Brief = CollectionEntry<'briefs'>;
export type Region = CollectionEntry<'regions'>;

/** 周报按日期倒序。 */
export async function getBriefsDesc(): Promise<Brief[]> {
  const briefs = await getCollection('briefs');
  return briefs.sort((a, b) => b.data.date.localeCompare(a.data.date));
}

/** 区域按 美→欧→日 固定顺序。 */
export async function getRegionsOrdered(): Promise<Region[]> {
  const regions = await getCollection('regions');
  return regions.sort((a, b) => REGIONS[a.data.region as RegionKey].order - REGIONS[b.data.region as RegionKey].order);
}

/** 全站最近更新日期：取周报日期与区域 updated 的最大值。 */
export async function getLatestUpdated(): Promise<string | null> {
  const [briefs, regions] = await Promise.all([getCollection('briefs'), getCollection('regions')]);
  const dates = [
    ...briefs.map((b) => b.data.updated ?? b.data.date),
    ...regions.map((r) => r.data.updated),
  ].filter(Boolean) as string[];
  return dates.length ? dates.sort().at(-1)! : null;
}
