"""Offline checks of saved Stage 0 evidence; not application or full schema tests."""
from pathlib import Path
import hashlib
import json
import re

EVIDENCE = Path(__file__).resolve().parent
REPO = EVIDENCE.parents[2]
checks = 0


def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


def load(name):
    return json.loads((EVIDENCE / 'snapshots' / (name + '.json')).read_text())


manifest = json.loads((EVIDENCE / 'manifest.json').read_text())
for entry in manifest['entries']:
    path = EVIDENCE / entry['path']
    check(path.is_file(), 'Missing artifact: ' + entry['path'])
    check(hashlib.sha256(path.read_bytes()).hexdigest() == entry['savedSha256'], 'Hash mismatch: ' + entry['path'])

cs = load('claude-status')
cr = load('claude-resets')
ss = load('claude-sources')
p1, p2 = load('claude-page1'), load('claude-page2')
x, a, ast = load('codex-resets'), load('archive-resets'), load('archive-status')
check(set(cs) == {'data', 'meta'} and set(ss) == {'data', 'meta'}, 'Claude envelopes')
check(set(cr) == {'data', 'pagination', 'meta'} and not cr['pagination']['has_more'], 'Claude history envelope/end')
check(len(cr['data']) == len({e['id'] for e in cr['data']}) == 12, 'Claude count/IDs')
check(all(e['kind'] == 'usage_reset' and e['event_status'] == 'confirmed' and e['revision'] == 1 for e in cr['data']), 'Claude kinds/status/revisions')
check(all(e['effective_at'] is None and e['time_precision'] == 'exact' for e in cr['data']), 'Claude exact announcement, not effective time')
check((min(e['announced_at'][:10] for e in cr['data']), max(e['announced_at'][:10] for e in cr['data'])) == ('2026-04-23', '2026-09-04'), 'Claude range')
offer = cs['data']['reset_offers'][0]
check(offer['kind'] == 'credit' and offer['revision'] == 2 and offer['reset_offer']['expires_on'] == '2026-10-22', 'Claude offer')
check(offer['audience']['plans'] == ['pro', 'max', 'team'] and offer['effective_at'] is None, 'Offer audience/precision')
check(len(ss['data']) == 7, 'Claude sources count')
check(len(p1['data']) == len(p2['data']) == 2 and p1['pagination']['next_cursor'], 'Cursor pages')
check([e['id'] for e in p1['data'] + p2['data']] == [e['id'] for e in cr['data'][:4]], 'Cursor ordering')
check(p1['meta']['content_revision'] == p2['meta']['content_revision'] == cr['meta']['content_revision'], 'Stable revision')
check(x['schema_version'] == 1 and x['scheduled'] is None and len(x['events']) == len({e['id'] for e in x['events']}) == 62, 'Codex envelope/count')
check(sum(e['seeded'] for e in x['events']) == 53, 'Codex seeded')
check(sum(e['delivered_at'] is not None for e in x['events']) == 6, 'Codex delivery count')
check(sum(e['kind'] == 'banked' for e in x['events']) == 8 and sum(e['kind'] == 'regular' for e in x['events']) == 54, 'Codex kinds')
check(all(e['ts'] == e['announced_at'] for e in x['events']), 'Codex announcement time')
check((min(e['date'] for e in x['events']), max(e['date'] for e in x['events'])) == ('2025-09-17', '2026-10-17'), 'Codex range')
check(len(a['data']) == len({e['id'] for e in a['data']}) == 64 and not a['pagination']['has_more'], 'Alternative count/end')
check(sum(e['reset_type'] == 'banked' for e in a['data']) == 6 and sum(e['source']['type'] == 'observed' for e in a['data']) == 3, 'Alternative kinds/sources')
check(ast['data']['latest_reset']['announced_at'] == '2026-10-20T06:33:48.000Z', 'Alternative latest')
check(len({e['id'] for e in x['events']} & {e['id'] for e in a['data']}) == 52, 'ID intersection')
for name in ('codex-conditional', 'archive-conditional'):
    check(bool(re.search(r'HTTP/\S+ 304', (EVIDENCE / 'headers' / (name + '.txt')).read_text())), name + ' 304')
check('etag:' not in (EVIDENCE / 'headers/codex-conditional.txt').read_text().lower(), 'Codex 304 no validator header')
alt_headers = (EVIDENCE / 'headers/archive-conditional.txt').read_text()
check('17:16:06 GMT' in alt_headers and 'max-age=14400' in alt_headers, 'Alternative 304 time/TTL')
for name in ('claude-openapi', 'archive-openapi'):
    check(load(name)['openapi'] == '3.1.0', name + ' parsed')

truth = (REPO / 'docs/22_STAGE0_TRUTH_TABLE.md').read_text()
fixtures = json.loads(re.search(r'```json\n(.*?)\n```', truth, re.S).group(1))
check(len(fixtures) == 7 and all(f['fixture'] == 'captured' for f in fixtures), 'Captured labels')


def is_projection(proj, source):
    if isinstance(proj, dict):
        return all(k in source and is_projection(v, source[k]) for k, v in proj.items())
    if isinstance(proj, list):
        return len(proj) == len(source) and all(is_projection(p, s) for p, s in zip(proj, source))
    return type(proj) is type(source) and proj == source


for fixture in fixtures:
    if 'clauderesets.com' in fixture['source']:
        source = cs['data']['latest_reset'] if fixture['path'] == 'data.latest_reset' else offer
    else:
        events = x['events'] if 'codexreset.ai' in fixture['source'] else a['data']
        source = next(e for e in events if e['id'] == fixture['projection']['id'])
    check(is_projection(fixture['projection'], source), 'Projection values: ' + fixture['projection']['id'])
check(len(re.findall(r'\| synthetic S\d+ \|', truth)) == 12, 'Synthetic labels')
register = (REPO / 'docs/11_SOURCES.md').read_text()
for name in ('claude-status', 'claude-resets', 'codex-resets', 'archive-resets'):
    entry = next(e for e in manifest['entries'] if e['path'] == 'snapshots/' + name + '.json')
    check(entry['originalSha256'] in register, 'Original hash register: ' + name)
for path in [REPO / 'prompts/START_STAGE1.md', REPO / 'docs/23_SESSION_HANDOFF.md', EVIDENCE / 'README.md']:
    content = path.read_text()
    check(not any(line.rstrip() != line for line in content.splitlines()), 'Whitespace: ' + path.name)
    for target in re.findall(r'\]\(([^)]+)\)', content):
        if '://' not in target:
            check((path.parent / target.split('#')[0]).exists(), 'Local link: ' + target)
print(f'PASS: {checks} offline evidence/handoff assertions.')
print('Structural captures only; no full JSON Schema validation or application tests; no network used.')
