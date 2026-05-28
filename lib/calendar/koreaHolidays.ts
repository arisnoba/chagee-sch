export type KoreaHoliday = {
  date: string;
  localName: string;
  name: string;
};

type HolidaysKrYear = Record<string, string[]>;

const holidayCache = new Map<number, Promise<KoreaHoliday[]>>();

function getYear(date: string): number {
  return Number(date.slice(0, 4));
}

export async function getKoreaHolidays(year: number): Promise<KoreaHoliday[]> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const request = fetch(`https://holidays.hyunbin.page/${year}.json`, {
    next: { revalidate: 60 * 60 * 24 * 30 },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to fetch Korean holidays: ${res.status}`);
      const data = (await res.json()) as HolidaysKrYear;

      return Object.entries(data).map(([date, names]) => {
        const localName = names.join(", ");
        return { date, localName, name: localName };
      });
    })
    .catch((error) => {
      console.error(error);
      return [];
    });

  holidayCache.set(year, request);
  return request;
}

export async function getKoreaHolidaysForDates(dates: string[]): Promise<KoreaHoliday[]> {
  const requestedDates = new Set(dates);
  const years = [...new Set(dates.map(getYear))];
  const holidays = (await Promise.all(years.map(getKoreaHolidays))).flat();

  return holidays.filter((holiday) => requestedDates.has(holiday.date));
}

export function holidayNameMap(holidays: KoreaHoliday[]): Record<string, string> {
  return Object.fromEntries(holidays.map((holiday) => [holiday.date, holiday.localName]));
}
