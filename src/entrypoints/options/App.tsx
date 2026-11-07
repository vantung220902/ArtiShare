import { useEffect, useState } from 'react';
import { parseArtifactList } from '../../core/artifactUrl';
import { type Config, hasList, type Job, listEmails, parseConfig, serializeConfig } from '../../core/config';
import { parseEmails } from '../../core/emails';
import { ACCESS_LABELS, ACCESS_LEVELS, type AccessLevel } from '../../core/types';
import { AccessSelect } from '../../ui/AccessSelect';
import { EmailInput } from '../../ui/EmailInput';
import { download, pickFile, useConfig } from '../../ui/hooks';

const SAMPLE = `# ArtiShare config
version: 1
defaults:
  access: view          # view | comment | edit
  delayMs: 800          # pause between invites
  orgDomains: [example.com]   # your claude.ai organization's domains (they don't count toward the 50-person cap)
lists:
  acme-clients:
    - alice@acme.com
    - bob@acme.com
jobs:
  - name: Acme weekly report
    artifacts:
      - https://claude.ai/artifact/REPLACE_WITH_ID
    lists: [acme-clients]
    emails: [carol@acme.com]
    access: comment
`;

export function App() {
  const [config, save] = useConfig();
  if (!config) return <div className="page muted">Loading…</div>;
  return (
    <div className="page">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <h1>ArtiShare</h1>
        <span className="hint">Lists, jobs and defaults are stored in this browser only.</span>
      </div>
      <ConfigFile config={config} save={save} />
      <Defaults config={config} save={save} />
      <Lists config={config} save={save} />
      <Jobs config={config} save={save} />
    </div>
  );
}

interface SectionProps {
  config: Config;
  save: (next: Config) => Promise<void>;
}

function ConfigFile({ config, save }: SectionProps) {
  const [errors, setErrors] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const importConfig = async () => {
    const file = await pickFile('.yaml,.yml,.json');
    if (!file) return;
    const r = parseConfig(file.text);
    if (!r.ok) {
      setErrors(r.errors);
      setNote('');
      return;
    }
    const lists = Object.keys(r.config.lists).length;
    const ok = window.confirm(
      `Replace your current lists, jobs and defaults with ${file.name}?\n\n${lists} list(s), ${r.config.jobs.length} job(s).`,
    );
    if (!ok) return;
    await save(r.config);
    setErrors([]);
    setNote(`Imported ${file.name}.${r.warnings.length ? ` Warnings: ${r.warnings.join('; ')}` : ''}`);
  };

  return (
    <section className="card">
      <h2>Config file</h2>
      <p className="hint">
        Share one YAML or JSON file with your team: export yours, commit it or put it in a shared drive, and import it on
        other machines. Importing replaces everything below.
      </p>
      <div className="row">
        <button className="primary" onClick={importConfig}>
          Import YAML/JSON…
        </button>
        <button onClick={() => download('artishare.yaml', serializeConfig(config, 'yaml'), 'text/yaml')}>
          Export YAML
        </button>
        <button onClick={() => download('artishare.json', serializeConfig(config, 'json'), 'application/json')}>
          Export JSON
        </button>
        <button className="link" onClick={() => download('artishare.sample.yaml', SAMPLE, 'text/yaml')}>
          Download a sample
        </button>
      </div>
      {note && <p className="ok" style={{ marginTop: 8 }}>{note}</p>}
      {errors.length > 0 && (
        <>
          <p className="err" style={{ marginTop: 8 }}>The file wasn't imported:</p>
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Defaults({ config, save }: SectionProps) {
  const storedDomains = config.defaults.orgDomains.join(', ');
  const storedDelay = String(config.defaults.delayMs);
  const [domains, setDomains] = useState(storedDomains);
  const [delay, setDelay] = useState(storedDelay);
  useEffect(() => setDomains(storedDomains), [storedDomains]);
  useEffect(() => setDelay(storedDelay), [storedDelay]);

  const commit = (patch: Partial<Config['defaults']>) => save({ ...config, defaults: { ...config.defaults, ...patch } });

  return (
    <section className="card stack">
      <h2>Defaults</h2>
      <div className="row">
        <div className="grow stack">
          <label>
            Default access <span className="hint">used when a job doesn't set one</span>
          </label>
          <AccessSelect value={config.defaults.access} onChange={(access) => commit({ access })} />
        </div>
        <div className="grow stack">
          <label>
            Pause between invites (ms) <span className="hint">0–60000</span>
          </label>
          <input
            type="number"
            min={0}
            max={60000}
            step={100}
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            onBlur={() => {
              const n = Math.min(60_000, Math.max(0, Math.round(Number(delay) || 0)));
              void commit({ delayMs: n });
            }}
          />
        </div>
      </div>
      <div className="stack">
        <label>
          Your organization's email domains{' '}
          <span className="hint">
            comma-separated, e.g. nimblehq.co. Addresses on these domains don't count toward the 50-outside-people cap.
          </span>
        </label>
        <input
          type="text"
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          onBlur={() =>
            void commit({
              orgDomains: [...new Set(domains.split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')))].filter(
                Boolean,
              ),
            })
          }
        />
      </div>
    </section>
  );
}

function Lists({ config, save }: SectionProps) {
  const names = Object.keys(config.lists).sort();
  const [newName, setNewName] = useState('');
  const [newText, setNewText] = useState('');
  const [error, setError] = useState('');

  const create = async () => {
    const name = newName.trim();
    if (!name) return setError('Give the list a name.');
    if (hasList(config, name)) return setError(`A list called "${name}" already exists.`);
    const { valid } = parseEmails(newText);
    if (!valid.length) return setError('Add at least one valid address.');
    await save({ ...config, lists: { ...config.lists, [name]: valid } });
    setNewName('');
    setNewText('');
    setError('');
  };

  return (
    <section className="card stack">
      <h2>Email lists</h2>
      {names.length === 0 && <p className="muted">No lists yet.</p>}
      {names.map((name) => (
        <ListEditor key={name} name={name} config={config} save={save} />
      ))}
      <details open={names.length === 0}>
        <summary>
          <strong>New list</strong>
        </summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <input type="text" placeholder="List name, e.g. acme-clients" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <EmailInput value={newText} onChange={setNewText} />
          {error && <p className="err">{error}</p>}
          <div>
            <button className="primary" onClick={create}>
              Create list
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

function ListEditor({ name, config, save }: SectionProps & { name: string }) {
  const stored = listEmails(config, name);
  const storedText = stored.join('\n');
  const [text, setText] = useState(storedText);
  useEffect(() => setText(storedText), [storedText]);
  const dirty = text !== storedText;
  const usedBy = config.jobs.filter((j) => j.lists.includes(name)).map((j) => j.name);

  const remove = async () => {
    const msg = usedBy.length
      ? `Delete "${name}"? It will also be removed from: ${usedBy.join(', ')}.`
      : `Delete the list "${name}"?`;
    if (!window.confirm(msg)) return;
    const { [name]: _gone, ...lists } = config.lists;
    const jobs = config.jobs.map((j) => ({ ...j, lists: j.lists.filter((l) => l !== name) }));
    await save({ ...config, lists, jobs });
  };

  return (
    <details className="card" style={{ margin: 0 }}>
      <summary>
        <strong>{name}</strong> <span className="chip">{stored.length}</span>
        {usedBy.length > 0 && <span className="hint"> · used by {usedBy.join(', ')}</span>}
      </summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <EmailInput value={text} onChange={setText} rows={6} />
        <div className="row">
          <button
            className="primary"
            disabled={!dirty}
            onClick={() => void save({ ...config, lists: { ...config.lists, [name]: parseEmails(text).valid } })}
          >
            Save
          </button>
          <button disabled={!dirty} onClick={() => setText(storedText)}>
            Revert
          </button>
          <button className="danger" onClick={remove}>
            Delete list
          </button>
        </div>
      </div>
    </details>
  );
}

function Jobs({ config, save }: SectionProps) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="card stack">
      <h2>Jobs</h2>
      <p className="hint">A job is a saved combination of artifacts, lists and an access level you can run from the side panel.</p>
      {config.jobs.length === 0 && !adding && <p className="muted">No jobs yet.</p>}
      {config.jobs.map((job, i) => (
        <JobEditor key={job.name} index={i} job={job} config={config} save={save} />
      ))}
      {adding ? (
        <JobEditor index={-1} config={config} save={save} onDone={() => setAdding(false)} />
      ) : (
        <div>
          <button onClick={() => setAdding(true)}>New job</button>
        </div>
      )}
    </section>
  );
}

function JobEditor({
  index,
  job,
  config,
  save,
  onDone,
}: SectionProps & { index: number; job?: Job; onDone?: () => void }) {
  const [name, setName] = useState(job?.name ?? '');
  const [artifacts, setArtifacts] = useState(job?.artifacts.join('\n') ?? '');
  const [lists, setLists] = useState<string[]>(job?.lists ?? []);
  const [emails, setEmails] = useState(job?.emails.join('\n') ?? '');
  const [access, setAccess] = useState<AccessLevel | ''>(job?.access ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const parsedArtifacts = parseArtifactList(artifacts);

  const submit = async () => {
    const errs: string[] = [];
    const trimmed = name.trim();
    if (!trimmed) errs.push('Give the job a name.');
    if (config.jobs.some((j, i) => j.name === trimmed && i !== index)) errs.push(`A job called "${trimmed}" already exists.`);
    if (!parsedArtifacts.refs.length) errs.push('Add at least one artifact link.');
    if (parsedArtifacts.invalid.length) errs.push(`Not artifact links: ${parsedArtifacts.invalid.join(', ')}`);
    const parsedEmails = parseEmails(emails);
    if (parsedEmails.invalid.length) errs.push(`Invalid emails: ${parsedEmails.invalid.join(', ')}`);
    if (!lists.length && !parsedEmails.valid.length) errs.push('Pick a list or add some emails.');
    setErrors(errs);
    if (errs.length) return;

    const next: Job = {
      name: trimmed,
      artifacts: parsedArtifacts.refs.map((r) => r.url),
      lists,
      emails: parsedEmails.valid,
      ...(access ? { access } : {}),
    };
    const jobs = [...config.jobs];
    if (index === -1) jobs.push(next);
    else jobs[index] = next;
    await save({ ...config, jobs });
    onDone?.();
  };

  const remove = async () => {
    if (!window.confirm(`Delete the job "${job?.name}"?`)) return;
    await save({ ...config, jobs: config.jobs.filter((_, i) => i !== index) });
  };

  const body = (
    <div className="stack" style={{ marginTop: 8 }}>
      <input type="text" placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)} />
      <label>
        Artifacts <span className="hint">one claude.ai link per line · {parsedArtifacts.refs.length} found</span>
      </label>
      <textarea rows={3} value={artifacts} onChange={(e) => setArtifacts(e.target.value)} spellCheck={false} />
      <label>Lists</label>
      {Object.keys(config.lists).length === 0 ? (
        <span className="hint">No lists yet. Create one above, or add emails below.</span>
      ) : (
        <div className="checks">
          {Object.keys(config.lists)
            .sort()
            .map((l) => (
              <label key={l}>
                <input
                  type="checkbox"
                  checked={lists.includes(l)}
                  onChange={(e) => setLists(e.target.checked ? [...lists, l] : lists.filter((x) => x !== l))}
                />
                {l} <span className="hint">({config.lists[l]?.length})</span>
              </label>
            ))}
        </div>
      )}
      <label>
        Extra emails <span className="hint">optional</span>
      </label>
      <EmailInput value={emails} onChange={setEmails} rows={3} />
      <label>Access</label>
      <select value={access} onChange={(e) => setAccess(e.target.value as AccessLevel | '')}>
        <option value="">Default ({ACCESS_LABELS[config.defaults.access]})</option>
        {ACCESS_LEVELS.map((a) => (
          <option key={a} value={a}>
            {ACCESS_LABELS[a]}
          </option>
        ))}
      </select>
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <button className="primary" onClick={submit}>
          {index === -1 ? 'Create job' : 'Save job'}
        </button>
        {index === -1 ? (
          <button onClick={onDone}>Cancel</button>
        ) : (
          <button className="danger" onClick={remove}>
            Delete job
          </button>
        )}
      </div>
    </div>
  );

  if (index === -1) return <div className="card" style={{ margin: 0 }}>{body}</div>;
  return (
    <details className="card" style={{ margin: 0 }}>
      <summary>
        <strong>{job?.name}</strong>{' '}
        <span className="hint">
          {job?.artifacts.length} artifact(s) · {job?.lists.length} list(s)
          {job?.emails.length ? ` + ${job.emails.length} email(s)` : ''} · {ACCESS_LABELS[job?.access ?? config.defaults.access]}
        </span>
      </summary>
      {body}
    </details>
  );
}
