import fs from 'fs';

const path = 'pages/Report.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes("from '../services/parseInterviewFeedback'")) {
  s = s.replace(
    "import { rds } from '../services/rdsApi';",
    "import { rds } from '../services/rdsApi';\nimport { parseInterviewFeedback } from '../services/parseInterviewFeedback';"
  );
}

const start = s.indexOf('  const parseFeedback = (feedback: unknown) => {');
const end = s.indexOf('  if (loading) {', start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

s = s.slice(0, start) + '  const parseFeedback = parseInterviewFeedback;\n\n' + s.slice(end);
fs.writeFileSync(path, s);
console.log('patched Report.tsx');
