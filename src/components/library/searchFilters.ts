export interface LibrarySearchFilterRecord {
  source: string;
  sourceName?: string;
  rightsClassification?: string;
  language?: string;
  year?: string;
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

export const LIBRARY_SEARCH_UNKNOWN_FILTER = '__unknown__';
const FACET_VALUE_PREFIX = 'value:';
const RIGHTS_FILTER_ORDER = Object.keys(LIBRARY_RIGHTS_FILTER_LABELS);

export interface LibrarySearchFacetOption {
  value: string;
  label: string;
  count: number;
}

/** Keep missing or unrecognized rights evidence in the conservative unknown bucket. */
function getRightsFilterValue(record: LibrarySearchFilterRecord): string {
  const value = record.rightsClassification?.trim();
  return value && Object.prototype.hasOwnProperty.call(LIBRARY_RIGHTS_FILTER_LABELS, value)
    ? value
    : 'UNKNOWN';
}

/** Language tags are case-insensitive; `und`, `unknown`, and empty values are not a language facet. */
function getLanguageValue(record: LibrarySearchFilterRecord): string | undefined {
  const value = record.language?.trim();
  if (!value || value.toLowerCase() === 'und' || value.toLowerCase() === 'unknown') return undefined;
  return value.toLowerCase();
}

/** Preserve the provider's year string exactly after trimming; do not derive a year from other fields. */
function getYearValue(record: LibrarySearchFilterRecord): string | undefined {
  const value = record.year?.trim();
  if (!value || value.toLowerCase() === 'und' || value.toLowerCase() === 'unknown') return undefined;
  return value;
}

function facetFilterValue(value: string | undefined): string {
  return value === undefined ? LIBRARY_SEARCH_UNKNOWN_FILTER : `${FACET_VALUE_PREFIX}${encodeURIComponent(value)}`;
}

function getFacetOptions(
  records: readonly LibrarySearchFilterRecord[],
  getValue: (record: LibrarySearchFilterRecord) => string | undefined,
  getLabel: (value: string) => string,
  unknownLabel: string,
  compare: (a: LibrarySearchFacetOption, b: LibrarySearchFacetOption) => number
): LibrarySearchFacetOption[] {
  const options = new Map<string, LibrarySearchFacetOption>();
  for (const record of records) {
    const value = getValue(record);
    const filterValue = facetFilterValue(value);
    const existing = options.get(filterValue);
    if (existing) {
      existing.count += 1;
    } else {
      options.set(filterValue, {
        value: filterValue,
        label: value === undefined ? unknownLabel : getLabel(value),
        count: 1
      });
    }
  }
  return [...options.values()].sort(compare);
}

function compareUnknownLast(a: LibrarySearchFacetOption, b: LibrarySearchFacetOption): number {
  if (a.value === LIBRARY_SEARCH_UNKNOWN_FILTER) return b.value === LIBRARY_SEARCH_UNKNOWN_FILTER ? 0 : 1;
  if (b.value === LIBRARY_SEARCH_UNKNOWN_FILTER) return -1;
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
}

function compareYearsDescending(a: LibrarySearchFacetOption, b: LibrarySearchFacetOption): number {
  if (a.value === LIBRARY_SEARCH_UNKNOWN_FILTER) return b.value === LIBRARY_SEARCH_UNKNOWN_FILTER ? 0 : 1;
  if (b.value === LIBRARY_SEARCH_UNKNOWN_FILTER) return -1;
  const aIsFourDigitYear = /^\d{4}$/.test(a.label);
  const bIsFourDigitYear = /^\d{4}$/.test(b.label);
  if (aIsFourDigitYear !== bIsFourDigitYear) return aIsFourDigitYear ? -1 : 1;
  if (aIsFourDigitYear && bIsFourDigitYear) return Number(b.label) - Number(a.label);
  return b.label.localeCompare(a.label, undefined, { numeric: true, sensitivity: 'base' });
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
      .map(value => ({ value, label: LIBRARY_RIGHTS_FILTER_LABELS[value], count: rightsCounts.get(value)! })),
    languages: getFacetOptions(records, getLanguageValue, value => value, '语言未知', compareUnknownLast),
    years: getFacetOptions(records, getYearValue, value => value, '年份未知', compareYearsDescending)
  };
}

/** Exact metadata-field filtering only; no language, date, access, or reuse rights are inferred. */
export function filterLibrarySearchResults<T extends LibrarySearchFilterRecord>(
  records: readonly T[],
  sourceFilter = 'all',
  rightsFilter = 'all',
  languageFilter = 'all',
  yearFilter = 'all'
): T[] {
  return records.filter(record =>
    (sourceFilter === 'all' || record.source === sourceFilter) &&
    (rightsFilter === 'all' || getRightsFilterValue(record) === rightsFilter) &&
    (languageFilter === 'all' || facetFilterValue(getLanguageValue(record)) === languageFilter) &&
    (yearFilter === 'all' || facetFilterValue(getYearValue(record)) === yearFilter)
  );
}
