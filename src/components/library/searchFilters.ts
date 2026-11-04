export interface LibrarySearchFilterRecord {
  source: string;
  sourceName?: string;
  rightsClassification?: string;
}

export const LIBRARY_RIGHTS_FILTER_LABELS: Record<string, string> = {
  PUBLIC_DOMAIN: '公共领域（来源声明）',
  OPEN_LICENSE: '开放许可',
  OPEN_ACCESS: '开放获取',
  BORROWABLE: '可借阅（来源服务）',
  PREVIEW_ONLY: '仅预览',
  METADATA_ONLY: '仅元数据',
  COPYRIGHT_RESTRICTED: '受版权限制',
  UNKNOWN: '权利状态未知'
};

const RIGHTS_FILTER_ORDER = Object.keys(LIBRARY_RIGHTS_FILTER_LABELS);

/** Keep missing or unrecognized rights evidence in the conservative unknown bucket. */
function getRightsFilterValue(record: LibrarySearchFilterRecord): string {
  const value = record.rightsClassification?.trim();
  return value && Object.prototype.hasOwnProperty.call(LIBRARY_RIGHTS_FILTER_LABELS, value)
    ? value
    : 'UNKNOWN';
}

export function getLibrarySearchFilterOptions(records: readonly LibrarySearchFilterRecord[]) {
  const sources = new Map<string, { source: string; name: string; count: number }>();
  const rightsCounts = new Map<string, number>();

  for (const record of records) {
    const existingSource = sources.get(record.source);
    if (existingSource) {
      existingSource.count += 1;
    } else {
      sources.set(record.source, {
        source: record.source,
        name: record.sourceName?.trim() || record.source,
        count: 1
      });
    }
    const rights = getRightsFilterValue(record);
    rightsCounts.set(rights, (rightsCounts.get(rights) || 0) + 1);
  }

  return {
    sources: [...sources.values()].sort((a, b) => a.name.localeCompare(b.name)),
    rights: RIGHTS_FILTER_ORDER
      .filter(value => rightsCounts.has(value))
      .map(value => ({ value, label: LIBRARY_RIGHTS_FILTER_LABELS[value], count: rightsCounts.get(value)! }))
  };
}

/** Exact-field filtering only; this does not infer access or reuse rights. */
export function filterLibrarySearchResults<T extends LibrarySearchFilterRecord>(
  records: readonly T[],
  sourceFilter = 'all',
  rightsFilter = 'all'
): T[] {
  return records.filter(record =>
    (sourceFilter === 'all' || record.source === sourceFilter) &&
    (rightsFilter === 'all' || getRightsFilterValue(record) === rightsFilter)
  );
}
