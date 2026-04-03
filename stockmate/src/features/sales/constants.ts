export const PAYMENT_METHODS = [
  'QRIS',
  'ShopeePay Later',
  'Kredivo',
  'Transfer Bank - BCA',
  'Transfer Bank - BRI',
  'Transfer Bank - Mandiri',
  'Tunai',
];

export const toDateInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const parseSaleDateInput = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const createSoldAtFromInput = (value: string) => {
  const parsed = parseSaleDateInput(value);
  if (!parsed) return null;
  const now = new Date();
  parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return parsed;
};

export const getStartOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const getEndExclusiveOfDay = (date: Date) => {
  const next = getStartOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
};
