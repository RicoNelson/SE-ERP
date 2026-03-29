/**
 * Formats a number to Indonesian locale string (e.g., 1000000 -> "1.000.000")
 */
export const formatNumber = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null || num === '') return '0';
  
  const parsedNum = typeof num === 'string' ? parseFloat(num.replace(/\./g, '')) : num;
  
  if (isNaN(parsedNum)) return '0';
  
  return parsedNum.toLocaleString('id-ID');
};

/**
 * Parses an Indonesian formatted string back to a number (e.g., "1.000.000" -> 1000000)
 */
export const parseNumber = (str: string): number => {
  if (!str) return 0;
  // Remove all dots, then parse as float
  const cleanStr = str.replace(/\./g, '');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Handles input change for formatted number inputs
 * Returns the formatted string to display and the raw number for state
 */
export const handleFormattedInputChange = (inputValue: string): { formatted: string, raw: number } => {
  // Only keep numbers
  const onlyNumbers = inputValue.replace(/\D/g, '');
  
  if (!onlyNumbers) return { formatted: '', raw: 0 };
  
  const raw = parseInt(onlyNumbers, 10);
  const formatted = raw.toLocaleString('id-ID');
  
  return { formatted, raw };
};

export const formatProductName = (name: string | undefined | null): string => {
  if (!name) return '';
  return name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID');
};

export const normalizeSearchQuery = (value: string | undefined | null): string => {
  if (!value) return '';
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
};

const isSubsequence = (needle: string, haystack: string): boolean => {
  if (!needle) return true;
  let needleIndex = 0;
  for (let i = 0; i < haystack.length; i += 1) {
    if (haystack[i] === needle[needleIndex]) {
      needleIndex += 1;
      if (needleIndex === needle.length) return true;
    }
  }
  return false;
};

const levenshteinDistanceWithin = (source: string, target: string, maxDistance: number): boolean => {
  const sourceLength = source.length;
  const targetLength = target.length;

  if (Math.abs(sourceLength - targetLength) > maxDistance) return false;
  if (source === target) return true;

  const previous = new Array(targetLength + 1).fill(0);
  const current = new Array(targetLength + 1).fill(0);

  for (let j = 0; j <= targetLength; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= sourceLength; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= targetLength; j += 1) {
      const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
      if (current[j] < rowMin) rowMin = current[j];
    }

    if (rowMin > maxDistance) return false;
    for (let j = 0; j <= targetLength; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[targetLength] <= maxDistance;
};

const tokenMatches = (queryToken: string, candidateToken: string): boolean => {
  if (candidateToken.includes(queryToken)) return true;
  if (queryToken.length >= 3 && isSubsequence(queryToken, candidateToken)) return true;
  if (queryToken.length < 3) return false;
  const maxDistance = queryToken.length <= 4 ? 1 : 2;
  return levenshteinDistanceWithin(queryToken, candidateToken, maxDistance);
};

const fuzzyMatchNormalized = (normalizedQuery: string, normalizedCandidate: string): boolean => {
  if (!normalizedQuery) return true;
  if (!normalizedCandidate) return false;
  if (normalizedCandidate.includes(normalizedQuery)) return true;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
  if (!queryTokens.length || !candidateTokens.length) return false;

  return queryTokens.every((queryToken) =>
    candidateTokens.some((candidateToken) => tokenMatches(queryToken, candidateToken))
    || tokenMatches(queryToken, normalizedCandidate),
  );
};

export const matchesFuzzySearch = (
  queryValue: string | undefined | null,
  candidateValues: Array<string | undefined | null>,
): boolean => {
  const normalizedQuery = normalizeSearchQuery(queryValue);
  if (!normalizedQuery) return true;
  return candidateValues.some((candidateValue) =>
    fuzzyMatchNormalized(normalizedQuery, normalizeSearchQuery(candidateValue)),
  );
};

export const toDateValue = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybeTimestamp = value as { toDate?: () => unknown };
    const converted = maybeTimestamp.toDate?.();
    if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
      return converted;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  return null;
};

export const formatDateId = (value: unknown, fallback = '-'): string => {
  const dateValue = toDateValue(value);
  if (!dateValue) return fallback;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateValue);
};
