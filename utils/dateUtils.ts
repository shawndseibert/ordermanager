
/**
 * Parses a date string like "01/14/26" into a Date object.
 * Assumes 20xx for the year.
 */
export const parsePOSDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr.trim() === '') return null;
  // Handle potential extra spaces or weird characters
  const cleanDate = dateStr.trim().replace(/[^\d/]/g, '');
  const parts = cleanDate.split('/');
  if (parts.length !== 3) return null;
  
  const month = parseInt(parts[0], 10) - 1;
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  
  // Handle 2-digit years
  if (year < 100) year += 2000;
  
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Calculates days between two dates.
 */
export const getDaysDiff = (d1: Date, d2: Date): number => {
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * An order is late only if:
 * 1. The status does NOT include 'received' or 'recv'd'
 * 2. The expected date is in the past
 */
export const isOrderLate = (status: string, expectedDateStr: string): boolean => {
  const normalizedStatus = (status || '').toLowerCase();
  
  if (normalizedStatus.includes('received') || normalizedStatus.includes("recv'd")) return false;
  
  const expectedDate = parsePOSDate(expectedDateStr);
  if (!expectedDate) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return expectedDate < today;
};

export const getStatusColor = (status: string, expectedDateStr: string): string => {
  const normalizedStatus = (status || '').toLowerCase();
  if (normalizedStatus.includes('received') || normalizedStatus.includes("recv'd")) return 'text-emerald-400';
  if (isOrderLate(status, expectedDateStr)) return 'text-rose-500';
  return 'text-amber-400';
};
