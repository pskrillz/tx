// Offline contract checks. Source modules are transpiled into an isolated VM;
// every provider/SDK dependency and queue is injected. Unknown imports fail closed.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '../..');

function loadSource(relative, dependencies) {
  const filename = path.join(ROOT, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
  }).outputText;
  const module = {exports: {}};
  const sandbox = {
    module, exports: module.exports, URLSearchParams, AbortController, Error,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error('Unexpected dependency: ' + name);
    },
    fetch() { throw new Error('Live fetch forbidden in offline contracts'); }
  };
  vm.runInNewContext(output, sandbox, {filename, timeout: 1000});
  return module.exports;
}
const quietLog = {debug() {}, info() {}, warn() {}, error() {}, activity() {}};
class FakeBase {
  constructor(config) { Object.assign(this, config); }
  normalizeResults(results, limit) { return results.slice(0, limit); }
  fetchWithTimeout() { throw new Error('Unstubbed network request'); }
}

test('PubMed heterogeneous summary map preserves article fields and missing-record fallback', async () => {
  const {PubMedProvider} = loadSource('src/tools/search/providers/pubmed.ts', {
    '../base-provider.ts': {BaseSearchProvider: FakeBase},
    '../../../shared/logger.ts': {log: quietLog}
  });
  const provider = new PubMedProvider();
  const responses = [
    {esearchresult: {idlist: ['123', '456']}},
    {result: {uids: ['123', '456'], '123': {
      uid: '123', title: 'Fixture title', pubdate: '2025', source: 'Fixture journal',
      authors: [{name: 'A. Author', authtype: 'Author'}], volume: '7', pages: '1-2'
    }}}
  ];
  let requests = 0;
  provider.fetchWithTimeout = async () => ({ok: true, json: async () => responses[requests++]});
  const results = await provider.search('inert fixture', {limit: 2});
  assert.equal(requests, 2);
  assert.equal(results[0].title, 'Fixture title');
  assert.match(results[0].content, /A\. Author/);
  assert.match(results[0].content, /Fixture journal 7:1-2/);
  assert.equal(results[1].title, 'PubMed Article (PMID: 456)');
});

test('PubMed uids metadata cannot be mistaken for an article', async () => {
  const {PubMedProvider} = loadSource('src/tools/search/providers/pubmed.ts', {
    '../base-provider.ts': {BaseSearchProvider: FakeBase},
    '../../../shared/logger.ts': {log: quietLog}
  });
  const provider = new PubMedProvider();
  const responses = [{esearchresult: {idlist: ['uids']}}, {result: {uids: ['123']}}];
  let requests = 0;
  provider.fetchWithTimeout = async () => ({ok: true, json: async () => responses[requests++]});
  const [result] = await provider.search('inert fixture');
  assert.equal(result.title, 'PubMed Article (PMID: uids)');
  assert.equal(result.content, undefined);
});

test('locked YouTube error exports retain identity and friendly failure messages without fetching', async () => {
  // Import only the locked library's definitions; never call its fetch function.
  const peer = await import('youtube-transcript-plus');
  const cases = [
    [new peer.YoutubeTranscriptDisabledError('abcdefghijk'), 'Transcripts are disabled for this video'],
    [new peer.YoutubeTranscriptVideoUnavailableError('abcdefghijk'), 'Video is unavailable or private'],
    [new peer.YoutubeTranscriptNotAvailableError('abcdefghijk'), 'No transcript available for this video'],
    [new peer.YoutubeTranscriptNotAvailableLanguageError('zz', ['en'], 'abcdefghijk'), 'Requested language not available.']
  ];
  for (const [error, expected] of cases) {
    const {YouTubeProvider} = loadSource('src/tools/search/providers/youtube.ts', {
      '../base-provider.ts': {BaseSearchProvider: FakeBase},
      '../../../shared/logger.ts': {log: quietLog},
      'youtube-transcript-plus': {...peer, fetchTranscript: async () => { throw error; }}
    });
    // Bypass constructor so the fixture never reads the user's API-key environment.
    const provider = Object.create(YouTubeProvider.prototype);
    const result = await provider.fetchTranscript('abcdefghijk');
    assert.equal(result.success, false);
    assert.ok(result.error.startsWith(expected), result.error);
    assert.equal(result.videoId, 'abcdefghijk');
  }
});

test('SDK mixed content narrows text and tool blocks using the complete locked union', async () => {
  const records = [];
  let queried = 0;
  const {SdkRunner} = loadSource('src/worker/sdk-runner.ts', {
    'node:events': {EventEmitter},
    '@anthropic-ai/claude-agent-sdk': {query() {
      queried++;
      return (async function* () {
        yield {type: 'assistant', message: {content: [
          {type: 'thinking', thinking: 'not output', signature: 'fixture'},
          {type: 'text', text: 'visible text', citations: []},
          {type: 'tool_use', id: 'fixture-tool', name: 'Read', input: {}}
        ]}};
        yield {type: 'result', subtype: 'success', result: 'done', is_error: false};
      })();
    }},
    '../shared/logger.ts': {log: {...quietLog, info(component, message, data) { records.push(data); }}}
  });
  let pending = true;
  const queue = {pollOne() {
    if (!pending) return undefined;
    pending = false;
    return {id: 1, from_agent: 'fixture/sender', to_agent: 'fixture/worker',
      type: 'task', payload: {body: 'inert fixture'}};
  }};
  const runner = new SdkRunner({id: 'fixture/worker', model: 'haiku',
    systemPrompt: 'fixture', workDir: '/not-used', msgsDir: '/not-used'}, queue);
  const outputs = [];
  runner.on('output', event => outputs.push(event.data));
  const result = await runner.run();
  assert.equal(queried, 1); // Injected generator only; the real SDK is never imported.
  assert.equal(outputs.join(''), 'visible text');
  assert.ok(records.some(record => record?.tools === 'Read'));
  assert.equal(result.success, true);
  assert.equal(result.messagesProcessed, 1);
  assert.doesNotMatch(result.output, /not output/);
});
