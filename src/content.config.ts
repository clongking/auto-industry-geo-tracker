import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** YAML 中未加引号的日期会被解析成 Date，这里统一转成 YYYY-MM-DD 字符串。 */
const ymd = z.union([z.string(), z.date()]).transform((v) => {
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`日期格式应为 YYYY-MM-DD：${s}`);
  return s;
});

const regions = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/regions' }),
  schema: z.object({
    title: z.string(),
    region: z.enum(['us', 'eu', 'japan']),
    updated: ymd,
    period: z.string().optional(),
  }),
});

const briefs = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/briefs' }),
  schema: z.object({
    title: z.string(),
    date: ymd,
    updated: ymd.optional(),
    summary: z.string().optional(),
  }),
});

export const collections = { regions, briefs };
