/**
 * Exact Deterministic Math, Number, Unit, Comparison, Date/Time & Fact Solver.
 * Runs in <1ms with zero external dependencies and zero LLM arithmetic hallucination.
 */

export interface PrecisionAnswer {
  answer: string;
  emotion: 'cheerful' | 'curious' | 'affectionate' | 'calm';
  kind: 'math' | 'comparison' | 'unit' | 'datetime' | 'fact' | 'poetry';
}

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  壹: 1,
  二: 2,
  两: 2,
  俩: 2,
  贰: 2,
  三: 3,
  叁: 3,
  四: 4,
  肆: 4,
  五: 5,
  伍: 5,
  六: 6,
  陆: 6,
  七: 7,
  柒: 7,
  八: 8,
  捌: 8,
  九: 9,
  玖: 9,
};

const CN_SMALL_UNIT: Record<string, number> = {
  十: 10,
  拾: 10,
  百: 100,
  佰: 100,
  千: 1000,
  仟: 1000,
};

function chineseNumeralToNumber(token: string): number | null {
  if (!token) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);

  let working = token.trim();
  let negative = false;
  if (working.startsWith('负')) {
    negative = true;
    working = working.slice(1);
  }

  let decimalPart = '';
  const dotIdx = working.indexOf('点');
  if (dotIdx !== -1) {
    const rawDec = working.slice(dotIdx + 1);
    working = working.slice(0, dotIdx) || '零';
    for (const ch of rawDec) {
      if (ch in CN_DIGITS) decimalPart += String(CN_DIGITS[ch]);
      else if (/\d/.test(ch)) decimalPart += ch;
      else return null;
    }
  }

  // Pure digit-by-digit sequence like 一二三
  if (/^[零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖]+$/.test(working) && working.length > 1) {
    const digits = [...working].map((c) => String(CN_DIGITS[c])).join('');
    const num = Number(decimalPart ? `${digits}.${decimalPart}` : digits);
    return negative ? -num : num;
  }

  const parseSection = (sec: string): number | null => {
    if (!sec) return 0;
    let total = 0;
    let current = 0;
    for (let i = 0; i < sec.length; i++) {
      const ch = sec[i];
      if (ch in CN_DIGITS) {
        current = CN_DIGITS[ch];
      } else if (ch in CN_SMALL_UNIT) {
        const unit = CN_SMALL_UNIT[ch];
        if (current === 0 && unit === 10 && i === 0) current = 1;
        total += current * unit;
        current = 0;
      } else if (/\d/.test(ch)) {
        let digits = ch;
        while (i + 1 < sec.length && /\d/.test(sec[i + 1])) {
          digits += sec[++i];
        }
        current = Number(digits);
      } else {
        return null;
      }
    }
    return total + current;
  };

  let total = 0;
  if (working.includes('亿')) {
    const [hi, lo] = working.split('亿');
    const hiVal = parseSection(hi);
    if (hiVal === null) return null;
    total += (hiVal || 1) * 100_000_000;
    working = lo;
  }
  if (working.includes('万')) {
    const [hi, lo] = working.split('万');
    const hiVal = parseSection(hi);
    if (hiVal === null) return null;
    total += (hiVal || 1) * 10_000;
    working = lo;
  }
  if (working) {
    const rem = parseSection(working);
    if (rem === null) return null;
    total += rem;
  }

  const combined = decimalPart ? Number(`${total}.${decimalPart}`) : total;
  return Number.isFinite(combined) ? (negative ? -combined : combined) : null;
}

function normalizeMathSpeech(raw: string): string {
  let s = raw.trim();

  // Strip natural conversational framing around calculations
  s = s
    .replace(/请问一下|请问|请帮我|帮我算一下|帮我算算|算一下|算算|计算一下|计算|告诉我|我想知道|你知道/g, ' ')
    .replace(/等于多少|等于几|是多少|是几|等于什么|的结果|得多少|得几|嘛|吗|呀|呢|啊|吧|[？?！!。，,]/g, ' ')
    .replace(/等于|equals|equal to|what is|what's|calculate|compute/gi, ' ')
    .replace(/圆周率|π/gi, '3.141592653589793')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')');

  // Spoken percentages: 百分之20 / 20% of 500
  s = s.replace(/百分之([零〇一二两三四五六七八九十百千万点\d.]+)(?:的)?/g, (_, num) => {
    const n = chineseNumeralToNumber(num);
    return n !== null ? `(${n}/100)*` : _;
  });
  // Clean trailing '*' if percentage was standalone
  s = s.replace(/\)\*\s*$/g, ')');

  // Spoken square root & powers
  s = s.replace(/([零〇一二两三四五六七八九十百千万亿点\d.()]+)\s*的平方根/g, 'sqrt($1)');
  s = s.replace(/(?:根号下?|开平方|square root of)\s*([零〇一二两三四五六七八九十百千万亿点\d.()]+)/gi, 'sqrt($1)');
  s = s.replace(/([零〇一二两三四五六七八九十百千万亿点\d.()]+)\s*的平方/g, '($1)^2');
  s = s.replace(/([零〇一二两三四五六七八九十百千万亿点\d.()]+)\s*的立方/g, '($1)^3');
  s = s.replace(/([零〇一二两三四五六七八九十百千万亿点\d.()]+)\s*的\s*([零〇一二两三四五六七八九十百千\d]+)\s*次[方幂]/g, '($1)^($2)');

  // Spoken operators
  s = s
    .replace(/加上|加|\bplus\b/gi, ' + ')
    .replace(/减去|减|\bminus\b/gi, ' - ')
    .replace(/乘以|乘上|乘|\bmultiplied by\b|\btimes\b/gi, ' * ')
    .replace(/除以|除|\bdivided by\b/gi, ' / ')
    .replace(/取余|模/g, ' % ');

  // Convert remaining Chinese numerals into Arabic numbers
  s = s.replace(/[负]?[零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟万亿点]+/g, (tok) => {
    // Do not break unrelated stray characters if isolated "一" isn't in a math context — checked later
    const n = chineseNumeralToNumber(tok);
    return n !== null ? String(n) : tok;
  });

  // Handle standalone percentages like 25% -> (25/100)
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');

  return s.replace(/\s+/g, ' ').trim();
}

function safeEvaluateMath(expr: string): { ok: true; value: number } | { ok: false; error?: string } {
  const tokens: Array<{ type: 'num' | 'op' | 'fn' | 'paren'; val: string }> = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      const n = Number(numStr);
      if (!Number.isFinite(n)) return { ok: false };
      tokens.push({ type: 'num', val: String(n) });
      continue;
    }
    if (/[+\-*/^%!]/.test(ch)) {
      tokens.push({ type: 'op', val: ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', val: ch });
      i++;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z]/.test(expr[i])) {
        ident += expr[i++];
      }
      const lower = ident.toLowerCase();
      if (['sqrt', 'abs', 'sin', 'cos', 'tan', 'log', 'ln'].includes(lower)) {
        tokens.push({ type: 'fn', val: lower });
        continue;
      }
      return { ok: false };
    }
    return { ok: false };
  }

  if (tokens.length === 0) return { ok: false };

  let pos = 0;
  let divZero = false;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek()?.type === 'op' && (peek().val === '+' || peek().val === '-')) {
      const op = consume().val;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parsePower();
    if (left === null) return null;
    while (peek()?.type === 'op' && (peek().val === '*' || peek().val === '/' || peek().val === '%')) {
      const op = consume().val;
      const right = parsePower();
      if (right === null) return null;
      if ((op === '/' || op === '%') && right === 0) {
        divZero = true;
        return null;
      }
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  };

  const parsePower = (): number | null => {
    const base = parseUnary();
    if (base === null) return null;
    if (peek()?.type === 'op' && peek().val === '^') {
      consume();
      const exp = parsePower();
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  };

  const parseUnary = (): number | null => {
    if (peek()?.type === 'op' && peek().val === '-') {
      consume();
      const v = parseUnary();
      return v === null ? null : -v;
    }
    if (peek()?.type === 'op' && peek().val === '+') {
      consume();
      return parseUnary();
    }
    return parsePostfix();
  };

  const parsePostfix = (): number | null => {
    let v = parsePrimary();
    if (v === null) return null;
    while (peek()?.type === 'op' && peek().val === '!') {
      consume();
      if (!Number.isInteger(v) || v < 0 || v > 170) return null;
      let f = 1;
      for (let k = 2; k <= v; k++) f *= k;
      v = f;
    }
    return v;
  };

  const parsePrimary = (): number | null => {
    const t = peek();
    if (!t) return null;
    if (t.type === 'num') {
      consume();
      return Number(t.val);
    }
    if (t.type === 'fn') {
      const fn = consume().val;
      const arg = parsePrimary();
      if (arg === null) return null;
      if (fn === 'sqrt') return arg >= 0 ? Math.sqrt(arg) : null;
      if (fn === 'abs') return Math.abs(arg);
      if (fn === 'sin') return Math.sin((arg * Math.PI) / 180);
      if (fn === 'cos') return Math.cos((arg * Math.PI) / 180);
      if (fn === 'tan') return Math.tan((arg * Math.PI) / 180);
      if (fn === 'log') return arg > 0 ? Math.log10(arg) : null;
      if (fn === 'ln') return arg > 0 ? Math.log(arg) : null;
    }
    if (t.type === 'paren' && t.val === '(') {
      consume();
      const inside = parseExpr();
      if (inside === null || peek()?.type !== 'paren' || peek().val !== ')') return null;
      consume();
      return inside;
    }
    return null;
  };

  const val = parseExpr();
  if (divZero) return { ok: false, error: 'DIV_ZERO' };
  if (val === null || pos !== tokens.length || !Number.isFinite(val)) return { ok: false };
  return { ok: true, value: val };
}

function formatExactNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Number(n.toFixed(10));
  return String(rounded);
}

const CURATED_FACTS: Array<{ test: RegExp; zh: string; en: string; kind: PrecisionAnswer['kind']; emotion: PrecisionAnswer['emotion'] }> = [
  {
    test: /静夜思/,
    zh: '《静夜思》是唐代诗人李白的名篇：“床前明月光，疑是地上霜。举头望明月，低头思故乡。”',
    en: '"Quiet Night Thought" by Tang poet Li Bai: Bright moonlight before my bed, seems like frost upon the ground. Raising my head I gaze at the moon; bowing my head I think of home.',
    kind: 'poetry',
    emotion: 'affectionate',
  },
  {
    test: /圆周率|π是多少|pi\b/i,
    zh: '圆周率 π 约等于 3.14159265，它是一个无限不循环的无理数，代表圆的周长与直径之比。',
    en: 'Pi (π) is approximately 3.14159265, the ratio of a circle’s circumference to its diameter.',
    kind: 'fact',
    emotion: 'cheerful',
  },
  {
    test: /光速是多少|光的速度/,
    zh: '真空中的光速精确定义为每秒 299,792,458 米，约每秒 30 万公里。',
    en: 'The speed of light in vacuum is exactly 299,792,458 meters per second.',
    kind: 'fact',
    emotion: 'curious',
  },
  {
    test: /太阳系有几[颗个大]行星|几大行星/,
    zh: '太阳系共有 8 大行星，按离太阳由近及远依次是：水星、金星、地球、火星、木星、土星、天王星和海王星。',
    en: 'There are 8 planets in the Solar System: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.',
    kind: 'fact',
    emotion: 'curious',
  },
  {
    test: /中国的首都是|中国首都在哪/,
    zh: '中华人民共和国的首都是北京。',
    en: 'The capital of China is Beijing.',
    kind: 'fact',
    emotion: 'cheerful',
  },
  {
    test: /一年有多少天|一年几天/,
    zh: '平年一年有 365 天，闰年一年有 366 天。',
    en: 'A common year has 365 days, and a leap year has 366 days.',
    kind: 'fact',
    emotion: 'cheerful',
  },
  {
    test: /一天有多少(小时|分钟|秒)/,
    zh: '一天精确等于 24 小时、1,440 分钟，或者 86,400 秒。',
    en: 'One day has exactly 24 hours, 1,440 minutes, or 86,400 seconds.',
    kind: 'fact',
    emotion: 'cheerful',
  },
  {
    test: /地球为什么是圆|为什么地球是圆/,
    zh: '因为万有引力会从各个方向把物质均匀拉向质心，当星球质量足够大时，流体静力平衡就会让它自然形成近似球形。',
    en: 'Gravity pulls mass inward evenly from every direction toward the center of mass, naturally shaping large planets into a sphere.',
    kind: 'fact',
    emotion: 'curious',
  },
  {
    test: /为什么天空是蓝|天空为什么是蓝/,
    zh: '这叫瑞利散射：太阳光进入大气层时，波长较短的蓝紫光更容易被空气分子散射到整个天空，而人眼对蓝光更敏感，所以看到蔚蓝的天空。',
    en: 'Rayleigh scattering scatters shorter blue wavelengths of sunlight more strongly across the atmosphere than longer red wavelengths.',
    kind: 'fact',
    emotion: 'curious',
  },
  {
    test: /水的沸点|水多少度烧开/,
    zh: '在标准大气压（101.325 千帕）下，纯水的沸点是 100 摄氏度（212 华氏度），冰点是 0 摄氏度。',
    en: 'At standard atmospheric pressure, pure water boils at 100°C (212°F) and freezes at 0°C.',
    kind: 'fact',
    emotion: 'cheerful',
  },
];

export function solvePrecisionQuery(rawInput: string, isZh: boolean): PrecisionAnswer | null {
  const raw = rawInput.trim();
  if (!raw) return null;

  // 1. Live exact date & time questions
  if (/几点(钟|了)?$|现在时间|what time is it/i.test(raw)) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return {
      answer: isZh ? `现在时间是 ${hh} 点 ${mm} 分。` : `The current time is ${hh}:${mm}.`,
      emotion: 'cheerful',
      kind: 'datetime',
    };
  }
  if (/今天(是)?(几号|多少号|几月几号|星期几|礼拜几)|what (date|day) is today/i.test(raw)) {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return {
      answer: isZh
        ? `今天是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日，${weekdays[now.getDay()]}。`
        : `Today is ${now.toDateString()}.`,
      emotion: 'cheerful',
      kind: 'datetime',
    };
  }
  if (/明天(是)?(几号|星期几|礼拜几)/i.test(raw)) {
    const tmr = new Date(Date.now() + 86_400_000);
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return {
      answer: isZh
        ? `明天是 ${tmr.getFullYear()} 年 ${tmr.getMonth() + 1} 月 ${tmr.getDate()} 日，${weekdays[tmr.getDay()]}。`
        : `Tomorrow is ${tmr.toDateString()}.`,
      emotion: 'cheerful',
      kind: 'datetime',
    };
  }
  const leapMatch = raw.match(/(\d{4})年?是不是闰年|is (\d{4}) a leap year/i);
  if (leapMatch || /今年是不是闰年/.test(raw)) {
    const year = Number(leapMatch?.[1] || leapMatch?.[2] || new Date().getFullYear());
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return {
      answer: isZh
        ? `${year} 年${isLeap ? '是闰年，共有 366 天。' : '不是闰年，是平年，共有 365 天。'}`
        : `${year} is ${isLeap ? 'a leap year (366 days).' : 'not a leap year (365 days).'}`,
      emotion: 'cheerful',
      kind: 'datetime',
    };
  }

  // 2. Number comparison: e.g. "9.11和9.9哪个大"
  const cmpMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*(?:和|与|跟|vs|and)\s*(-?\d+(?:\.\d+)?)\s*(?:哪个大|谁大|哪个更大|哪个数大|which is bigger|which is larger)/i);
  if (cmpMatch) {
    const a = Number(cmpMatch[1]);
    const b = Number(cmpMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (a === b) {
        return {
          answer: isZh ? `${a} 和 ${b} 一样大。` : `${a} and ${b} are equal.`,
          emotion: 'cheerful',
          kind: 'comparison',
        };
      }
      const bigger = Math.max(a, b);
      const smaller = Math.min(a, b);
      const diff = formatExactNumber(bigger - smaller);
      return {
        answer: isZh
          ? `${bigger} 比 ${smaller} 更大，它们之间相差 ${diff}。`
          : `${bigger} is greater than ${smaller} by ${diff}.`,
        emotion: 'cheerful',
        kind: 'comparison',
      };
    }
  }

  // 3. Temperature & common exact unit conversions
  const cToF = raw.match(/(-?\d+(?:\.\d+)?)\s*(?:摄氏度|度|°C|℃)\s*(?:等于|是|换算成|转成)?\s*多少\s*华氏度/i);
  if (cToF) {
    const c = Number(cToF[1]);
    const f = formatExactNumber((c * 9) / 5 + 32);
    return {
      answer: `${c} 摄氏度精确等于 ${f} 华氏度。`,
      emotion: 'cheerful',
      kind: 'unit',
    };
  }
  const fToC = raw.match(/(-?\d+(?:\.\d+)?)\s*(?:华氏度|°F|℉)\s*(?:等于|是|换算成|转成)?\s*多少\s*摄氏度/i);
  if (fToC) {
    const f = Number(fToC[1]);
    const c = formatExactNumber(((f - 32) * 5) / 9);
    return {
      answer: `${f} 华氏度精确等于 ${c} 摄氏度。`,
      emotion: 'cheerful',
      kind: 'unit',
    };
  }

  // 4. Deterministic math expression evaluation (handles "一加一等于多少", "1+1=?", "256*48", etc.)
  const hasMathCue =
    /[+\-*/^%×÷=]/.test(raw) ||
    /(加上|减去|乘以|乘上|除以|平方|立方|次方|次幂|平方根|根号|开方|阶乘|百分之|plus|minus|times|divided by|sqrt)/i.test(raw) ||
    /[零〇一二两三四五六七八九十百千万亿点\d]\s*(?:加|减|乘|除)\s*[零〇一二两三四五六七八九十百千万亿点\d]/.test(raw);

  if (hasMathCue && !/放一首|来一首|下一首|上一首|加好友|加微信/.test(raw)) {
    const normalized = normalizeMathSpeech(raw);
    const cleanedExpr = /^[\d.+\-*/^%()!\s|a-z]+$/i.test(normalized)
      ? normalized
      : (normalized.match(/(?:sqrt|abs|sin|cos|tan|log|ln|\(|-?\d)[\d.+\-*/^%()!\s|a-z]*(?:\d|\)|!)/gi) || [])
          .find((cand) => /[+\-*/^%!]|\b(?:sqrt|abs|sin|cos|tan|log|ln)\b/i.test(cand) && /\d/.test(cand)) || '';
    if (cleanedExpr && /\d/.test(cleanedExpr)) {
      const evaluated = safeEvaluateMath(cleanedExpr);
      if (evaluated.ok) {
        const formatted = formatExactNumber(evaluated.value);
        const prettyExpr = (isZh
          ? cleanedExpr
              .replace(/sqrt\(([^)]+)\)/gi, '根号$1')
              .replace(/\*/g, ' 乘 ')
              .replace(/\//g, ' 除以 ')
              .replace(/\+/g, ' 加 ')
              .replace(/\^/g, ' 的次方 ')
          : cleanedExpr
              .replace(/\*/g, ' × ')
              .replace(/\//g, ' ÷ ')
        )
          .replace(/\s+/g, ' ')
          .trim();
        return {
          answer: isZh
            ? `${prettyExpr} 精确等于 ${formatted}。`
            : `${prettyExpr} equals ${formatted}.`,
          emotion: 'cheerful',
          kind: 'math',
        };
      }
      if (evaluated.error === 'DIV_ZERO') {
        return {
          answer: isZh ? '在数学中，零不能作为除数哦。' : 'Division by zero is undefined in mathematics.',
          emotion: 'curious',
          kind: 'math',
        };
      }
    }
  }

  // 5. Prime number check
  const primeMatch = raw.match(/(\d+)\s*(?:是不是|是否是|是否为)\s*(?:质数|素数)/);
  if (primeMatch) {
    const n = Number(primeMatch[1]);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000) {
      let isPrime = n >= 2;
      for (let k = 2; k * k <= n; k++) {
        if (n % k === 0) {
          isPrime = false;
          break;
        }
      }
      return {
        answer: isZh
          ? `${n} ${isPrime ? '是质数（只能被 1 和它自身整除）。' : '不是质数。'}`
          : `${n} is ${isPrime ? 'a prime number.' : 'not a prime number.'}`,
        emotion: 'curious',
        kind: 'math',
      };
    }
  }

  // 6. Core curated verified facts & classics
  for (const fact of CURATED_FACTS) {
    if (fact.test.test(raw)) {
      return {
        answer: isZh ? fact.zh : fact.en,
        emotion: fact.emotion,
        kind: fact.kind,
      };
    }
  }

  return null;
}
