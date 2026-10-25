import { run } from './runner.js';
import { writeReports } from './report.js';
import { aiSuggestions } from './ai.js';

export { run, writeReports, aiSuggestions };

// One call: test a site, add AI review if a key is set, write all report files.
export async function testSite(opts, log) {
  const report = await run(opts, log);
  report.ai = await aiSuggestions(report);
  writeReports(report, opts.out || 'human-tester-report');
  return report;
}
