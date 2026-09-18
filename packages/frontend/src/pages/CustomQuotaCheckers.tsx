import { useEffect, useState } from 'react';
import { ArrowLeft, Code2, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  CustomQuotaChecker,
  api,
  deleteCustomQuotaChecker,
  fetchCustomQuotaCheckers,
  saveCustomQuotaChecker,
  testCustomQuotaChecker,
} from '../lib/api';
import type { Provider } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { SECTION_NAMES } from '../lib/nav';
import { cn } from '../lib/cn';
import { useToast } from '../contexts/ToastContext';

const DEFAULT_CODE = `const response = await ctx.fetch(
  ctx.getOption('endpoint', 'https://openrouter.ai/api/v1/credits'),
  {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  },
);
if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
const data = await response.json();
const totalCredits = Number(data?.data?.total_credits);
const totalUsage = Number(data?.data?.total_usage);
if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) {
  throw new Error('OpenRouter returned an invalid credits response');
}
return [
  ctx.balance({
    key: 'balance',
    label: 'Account credits',
    unit: 'usd',
    limit: totalCredits,
    used: totalUsage,
    remaining: totalCredits - totalUsage,
  }),
];`;

export function CustomQuotaCheckers() {
  const toast = useToast();
  const navigate = useNavigate();
  const [checkers, setCheckers] = useState<CustomQuotaChecker[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    id: '',
    displayName: '',
    code: DEFAULT_CODE,
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testProvider, setTestProvider] = useState('');
  const [testOptionsText, setTestOptionsText] = useState('{}');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const load = async () => setCheckers(await fetchCustomQuotaCheckers());
  useEffect(() => {
    Promise.all([load(), api.getProviders()])
      .then(([, nextProviders]) => {
        setProviders(nextProviders);
        if (nextProviders[0]) setTestProvider(nextProviders[0].id);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, []);

  const selectChecker = (checker: CustomQuotaChecker) => {
    setSelectedId(checker.id);
    setDraft({
      id: checker.id,
      displayName: checker.displayName,
      code: checker.code,
      enabled: checker.enabled,
    });
  };

  const createChecker = () => {
    setSelectedId(null);
    setDraft({ id: '', displayName: '', code: DEFAULT_CODE, enabled: true });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveCustomQuotaChecker(draft.id, {
        displayName: draft.displayName,
        code: draft.code,
        enabled: draft.enabled,
      });
      await load();
      selectChecker(saved);
      toast.success('Custom quota checker saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (
      !selectedId ||
      !(await toast.confirm({
        title: 'Delete custom quota checker?',
        message: 'Providers using this checker will no longer be able to run it.',
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    try {
      await deleteCustomQuotaChecker(selectedId);
      await load();
      createChecker();
      toast.success('Custom quota checker deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const test = async () => {
    if (!draft.id.trim() || !testProvider) return;
    let testOptions: Record<string, unknown>;
    try {
      const parsed = JSON.parse(testOptionsText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Test options must be a JSON object');
      }
      testOptions = parsed;
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : 'Invalid test options JSON');
      return;
    }
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await testCustomQuotaChecker(draft.id, testProvider, testOptions, draft.code);
      setTestMessage(`Success: ${result.meters.length} meter(s) returned.`);
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={SECTION_NAMES['/providers/custom-checkers']}
        subtitle="Write and test trusted JavaScript quota integrations — starts with OpenRouter credits"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/providers')}
              leftIcon={<ArrowLeft size={14} />}
            >
              Providers
            </Button>
            <Button size="sm" onClick={createChecker} leftIcon={<Plus size={14} />}>
              New checker
            </Button>
          </div>
        }
      />
      <PageContainer>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit" flush>
            {checkers.length === 0 ? (
              <EmptyState
                variant="dense"
                icon={<Code2 />}
                title="No checkers yet"
                description="Create one to add a custom quota integration."
              />
            ) : (
              <div className="flex flex-col gap-0.5 p-2">
                {checkers.map((checker) => (
                  <button
                    key={checker.id}
                    type="button"
                    onClick={() => selectChecker(checker)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors duration-150',
                      selectedId === checker.id
                        ? 'bg-accent-subtle text-accent'
                        : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
                    )}
                  >
                    <Code2 size={14} />
                    <span className="min-w-0 truncate">{checker.displayName || checker.id}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Type / ID"
                value={draft.id}
                disabled={Boolean(selectedId)}
                hint={selectedId ? 'The id is fixed once the checker is saved.' : undefined}
                onChange={(event) => setDraft({ ...draft, id: event.target.value })}
              />
              <Input
                label="Display name"
                value={draft.displayName}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-sans text-[12px] font-medium text-foreground">Enabled</div>
                <div className="font-sans text-[11px] text-foreground-subtle">
                  Providers may select this checker only while it is enabled.
                </div>
              </div>
              <Switch
                checked={draft.enabled}
                onChange={(checked) => setDraft({ ...draft, enabled: checked })}
                aria-label="Checker enabled"
              />
            </div>

            <FormField
              label="JavaScript function body"
              hint="Runs server-side with ctx.fetch / ctx.getOption / ctx.balance available."
              className="mt-3"
            >
              <textarea
                className="min-h-[420px] w-full rounded-md border border-border bg-surface-sunken p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-accent"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                spellCheck={false}
              />
            </FormField>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Select
                  label="Test against provider"
                  value={testProvider}
                  onChange={setTestProvider}
                  placeholder="Select a provider"
                  options={providers.map((provider) => ({
                    value: provider.id,
                    label: provider.name || provider.id,
                  }))}
                />
              </div>
              <div className="min-w-48 flex-1">
                <Input
                  label="Test options (JSON)"
                  className="font-mono text-xs"
                  value={testOptionsText}
                  onChange={(event) => setTestOptionsText(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={testing}
                onClick={test}
                disabled={!draft.id.trim() || !testProvider}
                leftIcon={<Code2 size={14} />}
              >
                Test code
              </Button>
            </div>
            {testMessage && (
              <p className="mt-2 font-sans text-xs text-foreground-muted">{testMessage}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              {selectedId && (
                <Button variant="danger" size="sm" onClick={remove} leftIcon={<Trash2 size={14} />}>
                  Delete
                </Button>
              )}
              <Button
                size="sm"
                isLoading={saving}
                onClick={save}
                disabled={!draft.id.trim() || !draft.displayName.trim() || !draft.code.trim()}
                leftIcon={<Save size={14} />}
              >
                Save checker
              </Button>
            </div>
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
