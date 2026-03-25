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
