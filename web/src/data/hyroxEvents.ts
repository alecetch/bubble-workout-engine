export interface HyroxKnownEvent {
  name: string;
  startDate: string;
  endDate?: string;
  city: string;
  country?: string;
}

export const HYROX_KNOWN_EVENTS: HyroxKnownEvent[] = [
  { name: "PUMA HYROX World Championships Stockholm", city: "Stockholm", country: "Sweden", startDate: "2026-06-18", endDate: "2026-06-21" },
  { name: "AirAsia HYROX Jakarta", city: "Jakarta", country: "Indonesia", startDate: "2026-06-27", endDate: "2026-06-28" },
  { name: "BYD HYROX Sydney", city: "Sydney", country: "Australia", startDate: "2026-07-01", endDate: "2026-07-05" },
  { name: "TORRAS HYROX Hangzhou", city: "Hangzhou", country: "China", startDate: "2026-07-04", endDate: "2026-07-05" },
  { name: "Masters' Union HYROX Delhi", city: "Delhi", country: "India", startDate: "2026-07-24", endDate: "2026-07-26" },
  { name: "HYROX Chengdu", city: "Chengdu", country: "China", startDate: "2026-08-01", endDate: "2026-08-02" },
  { name: "HYROX Istanbul", city: "Istanbul", country: "Turkey", startDate: "2026-08-01", endDate: "2026-08-02" },
  { name: "AirAsia HYROX Chiba", city: "Chiba", country: "Japan", startDate: "2026-08-06", endDate: "2026-08-09" },
  { name: "BYD HYROX Bangkok", city: "Bangkok", country: "Thailand", startDate: "2026-08-13", endDate: "2026-08-16" },
  { name: "Virgin Active HYROX Cape Town", city: "Cape Town", country: "South Africa", startDate: "2026-08-14", endDate: "2026-08-16" },
  { name: "HYROX Shenzhen", city: "Shenzhen", country: "China", startDate: "2026-08-15", endDate: "2026-08-16" },
  { name: "AirAsia HYROX Perth", city: "Perth", country: "Australia", startDate: "2026-08-21", endDate: "2026-08-23" },
  { name: "Amazfit HYROX Washington D.C.", city: "Washington D.C.", country: "USA", startDate: "2026-09-03", endDate: "2026-09-07" },
  { name: "HYROX Tenerife", city: "Tenerife", country: "Spain", startDate: "2026-09-04", endDate: "2026-09-06" },
  { name: "Mundo Imperial HYROX Acapulco", city: "Acapulco", country: "Mexico", startDate: "2026-09-05", endDate: "2026-09-06" },
  { name: "HYROX Athens", city: "Athens", country: "Greece", startDate: "2026-09-05", endDate: "2026-09-06" },
  { name: "HYROX Maastricht", city: "Maastricht", country: "Netherlands", startDate: "2026-09-17", endDate: "2026-09-20" },
  { name: "Masters' Union HYROX Mumbai", city: "Mumbai", country: "India", startDate: "2026-09-17", endDate: "2026-09-20" },
  { name: "InBody HYROX Salt Lake City", city: "Salt Lake City", country: "USA", startDate: "2026-09-18", endDate: "2026-09-20" },
  { name: "HYROX Rome", city: "Rome", country: "Italy", startDate: "2026-09-23", endDate: "2026-09-27" },
  { name: "HYROX Oslo", city: "Oslo", country: "Norway", startDate: "2026-09-25", endDate: "2026-09-27" },
  { name: "INTERSPORT HYROX Bordeaux", city: "Bordeaux", country: "France", startDate: "2026-09-30", endDate: "2026-10-04" },
  { name: "HYROX Karlsruhe", city: "Karlsruhe", country: "Germany", startDate: "2026-10-01", endDate: "2026-10-04" },
  { name: "GoodLife HYROX Toronto", city: "Toronto", country: "Canada", startDate: "2026-10-01", endDate: "2026-10-04" },
  { name: "HWPO HYROX Boston", city: "Boston", country: "USA", startDate: "2026-10-08", endDate: "2026-10-11" },
  { name: "Let's Go Fitness HYROX Geneva", city: "Geneva", country: "Switzerland", startDate: "2026-10-09", endDate: "2026-10-11" },
  { name: "HYROX Gdansk", city: "Gdansk", country: "Poland", startDate: "2026-10-10", endDate: "2026-10-11" },
  { name: "HYROX Valencia", city: "Valencia", country: "Spain", startDate: "2026-10-16", endDate: "2026-10-18" },
  { name: "HYROX Sao Paulo", city: "Sao Paulo", country: "Brazil", startDate: "2026-10-17" },
  { name: "MyFitnessPal HYROX Tampa", city: "Tampa", country: "USA", startDate: "2026-10-23", endDate: "2026-10-25" },
  { name: "HYROX Birmingham", city: "Birmingham", country: "United Kingdom", startDate: "2026-10-27", endDate: "2026-11-01" },
  { name: "INTERSPORT HYROX Hamburg", city: "Hamburg", country: "Germany", startDate: "2026-10-28", endDate: "2026-11-01" },
  { name: "TRAINSWEATEAT HYROX Nice", city: "Nice", country: "France", startDate: "2026-10-29", endDate: "2026-11-01" },
  { name: "HYROX Mexico City", city: "Mexico City", country: "Mexico", startDate: "2026-10-30", endDate: "2026-11-01" },
  { name: "HYROX Shanghai", city: "Shanghai", country: "China", startDate: "2026-10-31", endDate: "2026-11-01" },
  { name: "HYROX Dublin", city: "Dublin", country: "Ireland", startDate: "2026-11-11", endDate: "2026-11-15" },
  { name: "HYROX Dusseldorf", city: "Dusseldorf", country: "Germany", startDate: "2026-11-11", endDate: "2026-11-15" },
  { name: "Leapmotor HYROX Barcelona", city: "Barcelona", country: "Spain", startDate: "2026-11-12", endDate: "2026-11-15" },
  { name: "HYROX Denver", city: "Denver", country: "USA", startDate: "2026-11-12", endDate: "2026-11-15" },
  { name: "AirAsia HYROX Seoul", city: "Seoul", country: "South Korea", startDate: "2026-11-14", endDate: "2026-11-15" },
  { name: "HYROX Cairo", city: "Cairo", country: "Egypt", startDate: "2026-11-14", endDate: "2026-11-15" },
  { name: "HYROX Dallas", city: "Dallas", country: "USA", startDate: "2026-11-18", endDate: "2026-11-22" },
  { name: "HYROX Poznan", city: "Poznan", country: "Poland", startDate: "2026-11-20", endDate: "2026-11-22" },
  { name: "HYROX Guangzhou", city: "Guangzhou", country: "China", startDate: "2026-11-21", endDate: "2026-11-22" },
  { name: "HYROX Rio de Janeiro", city: "Rio de Janeiro", country: "Brazil", startDate: "2026-11-21" },
  { name: "HYROX Utrecht", city: "Utrecht", country: "Netherlands", startDate: "2026-11-26", endDate: "2026-11-30" },
  { name: "AIA HYROX Singapore", city: "Singapore", country: "Singapore", startDate: "2026-11-27", endDate: "2026-11-29" },
  { name: "Virgin Active HYROX Johannesburg", city: "Johannesburg", country: "South Africa", startDate: "2026-11-28", endDate: "2026-11-29" },
  { name: "HYROX London ExCel", city: "London", country: "United Kingdom", startDate: "2026-12-02", endDate: "2026-12-06" },
  { name: "HYROX Anaheim", city: "Anaheim", country: "USA", startDate: "2026-12-03", endDate: "2026-12-06" },
  { name: "HYROX Milan", city: "Milan", country: "Italy", startDate: "2026-12-05", endDate: "2026-12-06" },
  { name: "INTERSPORT HYROX Stockholm", city: "Stockholm", country: "Sweden", startDate: "2026-12-10", endDate: "2026-12-13" },
  { name: "Fitness First HYROX Frankfurt", city: "Frankfurt", country: "Germany", startDate: "2026-12-10", endDate: "2026-12-13" },
  { name: "HYROX Nashville", city: "Nashville", country: "USA", startDate: "2026-12-10", endDate: "2026-12-13" },
  { name: "FITNESS PARK HYROX Paris", city: "Paris", country: "France", startDate: "2026-12-12", endDate: "2026-12-20" },
  { name: "HYROX Gent", city: "Gent", country: "Belgium", startDate: "2026-12-17", endDate: "2026-12-20" },
  { name: "HYROX Helsinki", city: "Helsinki", country: "Finland", startDate: "2026-12-18", endDate: "2026-12-20" },
  { name: "HYROX Vancouver", city: "Vancouver", country: "Canada", startDate: "2026-12-18", endDate: "2026-12-20" },
];

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(hyrox|puma|airasia|byd|torras|amazfit|inbody|hwpo|intersport|leapmotor|aia|fitness|first|park|virgin|active|goodlife|myfitnesspal|trainsweateat|masters|union)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findHyroxEventByName(rawName: string | null | undefined): HyroxKnownEvent | null {
  const query = normalise(String(rawName ?? ""));
  if (!query) return null;
  return HYROX_KNOWN_EVENTS.find((event) => {
    const name = normalise(event.name);
    const city = normalise(event.city);
    return name === query || name.includes(query) || query.includes(name) || (city.length >= 4 && query.includes(city));
  }) ?? null;
}
