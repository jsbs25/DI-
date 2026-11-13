import assert from 'node:assert/strict';
import { getJupiterDocumentSource, isRemotePdfUrl, toJupiterDocumentRoute } from '../src/components/browser/pdfDocumentUrl.ts';

let passed = 0;
const check = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  passed += 1;
};

const source = 'https://example.org/reports/climate.pdf?download=1';
check(isRemotePdfUrl(source), 'Accepts an HTTPS PDF with a query string');
check(isRemotePdfUrl('http://example.org/report.PDF'), 'PDF extension check is case-insensitive');
check(!isRemotePdfUrl('https://example.org/article'), 'Does not classify ordinary HTML as a PDF');
check(!isRemotePdfUrl('javascript:alert(1)'), 'Rejects non-HTTP schemes');
check(!isRemotePdfUrl('https://user:pass@example.org/file.pdf'), 'Rejects credential-bearing URLs');
check(!isRemotePdfUrl(`https://example.org/${'a'.repeat(4100)}.pdf`), 'Rejects oversized document URLs');

const route = toJupiterDocumentRoute(source);
assert.ok(route);
passed += 1;
check(route.startsWith('/jupiter/document/'), 'Uses the internal JUPITER document route');
check(getJupiterDocumentSource(route) === new URL(source).href, 'Round-trips the encoded PDF source URL');
check(getJupiterDocumentSource('/jupiter/document/not-a-pdf') === null, 'Rejects non-PDF internal document routes');
check(getJupiterDocumentSource('/jupiter/document/%') === null, 'Rejects malformed route encoding');

console.log(`JUPITER PDF URL routing: ${passed} passed, 0 failed.`);
