export const MAHARASHTRA_CITIES = [
  "Mumbai",
  "Pune",
  "Nagpur",
  "Nashik",
  "Thane",
  "Chhatrapati Sambhajinagar (Aurangabad)",
  "Navi Mumbai",
  "Solapur",
  "Amravati",
  "Kolhapur",
  "Sangli",
  "Jalgaon",
  "Akola",
  "Latur",
  "Dhule",
  "Ahmednagar",
  "Chandrapur",
  "Parbhani",
  "Ichalkaranji",
  "Jalna",
  "Nanded",
  "Satara",
  "Beed",
  "Yavatmal",
  "Gondia",
  "Bhandara",
  "Baramati",
  "Ratnagiri",
  "Wardha",
  "Osmanabad (Dharashiv)",
  "Palghar",
  "Vasai-Virar",
  "Bhiwandi",
  "Panvel",
  "Badlapur",
  "Ambernath",
  "Mira-Bhayandar",
  "Kalyan-Dombivli",
  "Pimpri-Chinchwad",
  "Sindhudurg",
  "Nandurbar",
  "Hingoli",
  "Gadchiroli",
  "Delhi",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Ahmedabad",
  "Surat",
  "Vadodara",
  "Indore",
  "Jaipur",
  "Chandigarh"
];

const CITY_ALIAS_MAP: Array<[string, string[]]> = [
  ["Nashik", ["nashik", "nasik", "ambad", "satpur", "gonde", "sinnar", "dindori", "igatpuri"]],
  ["Navi Mumbai", ["navi mumbai", "vashi", "airoli", "ghansoli", "mahpe", "rabale", "koparkhairane", "nerul", "kharghar", "belapur"]],
  ["Mumbai", ["mumbai", "bombay", "andheri", "bandra", "kurla", "worli", "dadar", "borivali", "powai", "chembur", "colaba", "malad", "ghatkopar", "juhu", "santacruz", "marol", "seepz", "bkc", "lower parel", "nariman point"]],
  ["Pimpri-Chinchwad", ["pimpri-chinchwad", "pimpri chinchwad", "chakan", "bhosari", "nigdi", "akurdi", "tathawade"]],
  ["Pune", ["pune", "poona", "hinjewadi", "hinjawadi", "hadapsar", "talegaon", "ranjangaon", "wakad", "baner", "viman nagar", "kothrud", "katraj", "magarpatta"]],
  ["Thane", ["thane", "majiwada", "ghodbunder", "kalwa", "mumbra"]],
  ["Kalyan-Dombivli", ["kalyan", "dombivli", "dombivali"]],
  ["Vasai-Virar", ["vasai", "virar", "nallasopara"]],
  ["Bhiwandi", ["bhiwandi"]],
  ["Panvel", ["panvel", "kamothe", "kalamboli", "taloja"]],
  ["Badlapur", ["badlapur"]],
  ["Ambernath", ["ambernath"]],
  ["Mira-Bhayandar", ["mira bhayandar", "bhayandar", "mira road"]],
  ["Palghar", ["palghar", "boisar", "tarapur"]],
  ["Nagpur", ["nagpur", "butibori", "hingna", "kamthi"]],
  ["Chhatrapati Sambhajinagar (Aurangabad)", ["aurangabad", "sambhajinagar", "chhatrapati sambhajinagar", "waluj", "chikalthana", "shendra"]],
  ["Solapur", ["solapur", "sholapur"]],
  ["Amravati", ["amravati"]],
  ["Kolhapur", ["kolhapur", "gokul shirgaon", "shiroli"]],
  ["Sangli", ["sangli", "miraj"]],
  ["Jalgaon", ["jalgaon", "bhusawal"]],
  ["Akola", ["akola"]],
  ["Latur", ["latur"]],
  ["Dhule", ["dhule"]],
  ["Ahmednagar", ["ahmednagar", "nagar"]],
  ["Chandrapur", ["chandrapur"]],
  ["Parbhani", ["parbhani"]],
  ["Ichalkaranji", ["ichalkaranji"]],
  ["Jalna", ["jalna"]],
  ["Nanded", ["nanded"]],
  ["Satara", ["satara", "karad"]],
  ["Beed", ["beed"]],
  ["Yavatmal", ["yavatmal"]],
  ["Gondia", ["gondia"]],
  ["Bhandara", ["bhandara"]],
  ["Baramati", ["baramati"]],
  ["Ratnagiri", ["ratnagiri"]],
  ["Wardha", ["wardha"]],
  ["Osmanabad (Dharashiv)", ["osmanabad", "dharashiv"]],
  ["Sindhudurg", ["sindhudurg", "kudal", "kankavli"]],
  ["Nandurbar", ["nandurbar"]],
  ["Hingoli", ["hingoli"]],
  ["Gadchiroli", ["gadchiroli"]],
  ["Delhi", ["delhi", "new delhi", "ncr", "gurgaon", "gurugram", "noida", "ghaziabad", "faridabad"]],
  ["Bengaluru", ["bengaluru", "bangalore", "electronic city", "whitefield", "koramangala", "indiranagar"]],
  ["Hyderabad", ["hyderabad", "secunderabad", "hitech city", "gachibowli"]],
  ["Chennai", ["chennai", "madras", "guindy", "omr", "velachery"]],
  ["Kolkata", ["kolkata", "calcutta", "salt lake", "rajarhat"]],
  ["Ahmedabad", ["ahmedabad", "gujarat", "sanand", "changodar"]],
  ["Surat", ["surat", "hazira"]],
  ["Vadodara", ["vadodara", "baroda"]],
  ["Indore", ["indore", "pithampur"]],
  ["Jaipur", ["jaipur"]],
  ["Chandigarh", ["chandigarh", "mohali"]]
];

export function resolveStrictListedCity(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  const cleanText = rawText.toLowerCase().replace(/[^a-z0-9\s,-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanText) return '';

  // 1. Check exact listed city names first
  for (const city of MAHARASHTRA_CITIES) {
    const cityClean = city.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
    if (cleanText.includes(cityClean)) {
      return city;
    }
  }

  // 2. Check alias map & industrial areas
  for (const [officialCity, aliases] of CITY_ALIAS_MAP) {
    for (const alias of aliases) {
      const aliasClean = alias.toLowerCase().trim();
      const regex = new RegExp(`\\b${aliasClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(cleanText) || cleanText.includes(aliasClean)) {
        return officialCity;
      }
    }
  }

  // If no listed city is found, return empty string strictly!
  return '';
}
