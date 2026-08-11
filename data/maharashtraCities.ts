export interface StateCityGroup {
  state: string;
  cities: string[];
}

export const INDIAN_STATES_CITIES: StateCityGroup[] = [
  {
    state: "Maharashtra",
    cities: [
      "Nashik",
      "Pune",
      "Mumbai",
      "Thane",
      "Nagpur",
      "Chhatrapati Sambhajinagar",
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
      "Gadchiroli"
    ]
  },
  {
    state: "Delhi NCR",
    cities: ["Delhi", "New Delhi", "Gurgaon", "Noida", "Greater Noida", "Ghaziabad", "Faridabad"]
  },
  {
    state: "Karnataka",
    cities: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi-Dharwad", "Belagavi", "Davangere", "Ballari", "Tumakuru", "Shivamogga"]
  },
  {
    state: "Telangana & Andhra Pradesh",
    cities: ["Hyderabad", "Secunderabad", "Warangal", "Nizamabad", "Karimnagar", "Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Nellore", "Kakinada", "Rajahmundry", "Kurnool", "Anantapur"]
  },
  {
    state: "Tamil Nadu",
    cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tiruppur", "Erode", "Vellore", "Tirunelveli", "Thoothukudi", "Thanjavur", "Dindigul", "Hosur"]
  },
  {
    state: "Gujarat",
    cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar", "Junagadh", "Anand", "Vapi", "Ankleshwar", "Bharuch", "Navsari", "Morbi", "Mehsana"]
  },
  {
    state: "Madhya Pradesh",
    cities: ["Indore", "Bhopal", "Gwalior", "Jabalpur", "Ujjain", "Sagar", "Rewa", "Satna", "Ratlam", "Singrauli", "Burhanpur", "Chhindwara"]
  },
  {
    state: "Rajasthan",
    cities: ["Jaipur", "Udaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Bhilwara", "Alwar", "Sikar", "Sri Ganganagar", "Bharatpur", "Pali"]
  },
  {
    state: "Uttar Pradesh",
    cities: ["Lucknow", "Kanpur", "Agra", "Varanasi", "Prayagraj", "Meerut", "Bareilly", "Aligarh", "Moradabad", "Gorakhpur", "Jhansi", "Mathura", "Saharanpur", "Ayodhya", "Firozabad", "Muzaffarnagar"]
  },
  {
    state: "West Bengal & Odisha",
    cities: ["Kolkata", "Howrah", "Durgapur", "Siliguri", "Asansol", "Kharagpur", "Haldia", "Bhubaneswar", "Cuttack", "Rourkela", "Puri", "Sambalpur", "Berhampur"]
  },
  {
    state: "Bihar & Jharkhand",
    cities: ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga", "Purnia", "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Hazaribagh"]
  },
  {
    state: "Punjab, Haryana & Chandigarh",
    cities: ["Chandigarh", "Mohali", "Panchkula", "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Ambala", "Karnal", "Panipat", "Rohtak", "Hisar", "Yamunanagar", "Sonipat"]
  },
  {
    state: "Kerala & Goa",
    cities: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Alappuzha", "Panaji", "Margao", "Vasco da Gama", "Mapusa"]
  },
  {
    state: "Uttarakhand, HP & J&K",
    cities: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh", "Rudrapur", "Shimla", "Dharamshala", "Mandi", "Jammu", "Srinagar", "Anantnag"]
  },
  {
    state: "Assam & North East",
    cities: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tezpur", "Shillong", "Imphal", "Agartala", "Aizawl", "Kohima", "Itanagar", "Gangtok"]
  },
  {
    state: "Chhattisgarh",
    cities: ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Jagdalpur"]
  }
];

export const TOP_FAST_FEED_CITIES = [
  { city: "Nashik", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Thane", state: "Maharashtra" },
  { city: "Nagpur", state: "Maharashtra" },
  { city: "Chhatrapati Sambhajinagar", state: "Maharashtra" }
];

export const MAHARASHTRA_CITIES = INDIAN_STATES_CITIES.flatMap(g => g.cities);

export function getStateForCity(cityName: string): string {
  if (!cityName) return '';
  const cleanCity = cityName.toLowerCase().trim();
  for (const group of INDIAN_STATES_CITIES) {
    if (group.cities.some(c => c.toLowerCase().includes(cleanCity) || cleanCity.includes(c.toLowerCase()) || isCityMatchingQuery(c, cleanCity))) {
      return group.state;
    }
  }
  return '';
}

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
  ["Chhatrapati Sambhajinagar", ["aurangabad", "sambhajinagar", "chhatrapati sambhajinagar", "waluj", "chikalthana", "shendra"]],
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

export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  for (let i = 0; i <= lenB; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenA; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[lenB][lenA];
}

export function isCityMatchingQuery(cityName: string, rawQuery: string): boolean {
  if (!rawQuery.trim()) return true;
  const query = rawQuery.toLowerCase().trim();
  const target = cityName.toLowerCase().trim();

  // 1. Direct Substring Match
  if (target.includes(query) || query.includes(target)) return true;

  // 2. Check Aliases (e.g. nasik -> Nashik, poona -> Pune, aurangabad -> Chhatrapati Sambhajinagar)
  const aliasMatch = CITY_ALIAS_MAP.find(([official]) => official.toLowerCase() === target);
  if (aliasMatch) {
    const [, aliases] = aliasMatch;
    if (aliases.some(alias => alias.includes(query) || query.includes(alias))) {
      return true;
    }
  }

  // 3. Typo-Tolerant Fuzzy Levenshtein Match
  const maxDistance = query.length >= 6 ? 2 : query.length >= 3 ? 1 : 0;
  if (maxDistance > 0) {
    const dist = getLevenshteinDistance(query, target);
    if (dist <= maxDistance) return true;

    const words = target.split(/\s+|-|\(/);
    for (const w of words) {
      const cleanW = w.replace(/[^a-z0-9]/g, '');
      if (cleanW.length >= 3) {
        if (getLevenshteinDistance(query, cleanW) <= maxDistance) return true;
      }
    }

    if (aliasMatch) {
      for (const alias of aliasMatch[1]) {
        if (getLevenshteinDistance(query, alias) <= maxDistance) return true;
      }
    }
  }

  return false;
}

export function resolveStrictListedCity(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  const cleanText = rawText.toLowerCase().replace(/[^a-z0-9\s,-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanText) return '';

  for (const city of MAHARASHTRA_CITIES) {
    const cityClean = city.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
    if (cleanText.includes(cityClean)) {
      return city;
    }
  }

  for (const [officialCity, aliases] of CITY_ALIAS_MAP) {
    for (const alias of aliases) {
      const aliasClean = alias.toLowerCase().trim();
      const regex = new RegExp(`\\b${aliasClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(cleanText) || cleanText.includes(aliasClean)) {
        return officialCity;
      }
    }
  }

  return '';
}
