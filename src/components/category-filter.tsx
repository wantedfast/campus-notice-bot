'use client';
import { CATEGORIES, type NoticeCategory } from '@/lib/categories';
import type { Notice } from '@/lib/types';
export default function CategoryFilter({value,onChange,notices}:{value:'all'|NoticeCategory;onChange:(value:'all'|NoticeCategory)=>void;notices:Notice[]}) {
  return <div className="category-filter" role="group" aria-label="按通知分类">
    <button aria-pressed={value==='all'} onClick={()=>onChange('all')}>全部<span>{notices.length}</span></button>
    {CATEGORIES.map(c=><button key={c.id} data-category={c.id} aria-pressed={value===c.id} onClick={()=>onChange(c.id)}>{c.label}<span>{notices.filter(n=>n.category===c.id).length}</span></button>)}
  </div>;
}
