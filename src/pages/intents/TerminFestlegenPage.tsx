/**
 * Termin festlegen — 5-Schritt-Wizard.
 * Steps: 1) Abstimmung wählen & Auswertung ansehen → 2) Terminvorschlag wählen → 3) Teilnehmer mit Nein / ohne Rückmeldung bestätigen
 *        → 4) Entscheidungskommentar (optional) → 5) Prüfen & festlegen.
 * Reads: terminabstimmungen, terminvorschlaege, teilnehmer, rueckmeldungen (über flow.port).
 * Writes: terminvorschlaege (final_gewaehlt), terminabstimmungen (status, festgelegt_am, entscheidungskommentar) via useTerminFestlegenFlow.
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep, StatusBadge.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { fieldText, fieldLookup, fieldNumber, fieldDate, fieldRef, refFilter } from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { useTerminFestlegenFlow } from '@/lib/journey/flows/TerminFestlegen';
import { dateFnsLocale, tx } from '@/i18n';

function dateText(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE, dd.MM.yyyy HH:mm', { locale: dateFnsLocale() });
  } catch {
    return iso;
  }
}

function slotText(r: JourneyRecord): string {
  const start = dateText(fieldDate(r, 'start'));
  const ende = fieldDate(r, 'ende');
  let endText = '';
  if (ende) {
    try {
      endText = format(parseISO(ende), 'HH:mm');
    } catch {
      endText = ende;
    }
  }
  return endText ? `${start} – ${endText}` : start;
}

interface PeopleState {
  loading: boolean;
  error: string | null;
  teilnehmer: JourneyRecord[];
  antworten: JourneyRecord[];
}

export default function TerminFestlegenPage() {
  const [step, setStep] = useState(1);
  const [ackFor, setAckFor] = useState<string | null>(null);
  const [people, setPeople] = useState<PeopleState>({ loading: false, error: null, teilnehmer: [], antworten: [] });

  const flow = useTerminFestlegenFlow({
    steps: { terminabstimmungen: 1, terminvorschlaege: 2, entscheidungskommentar: 4 },
    items: {
      terminabstimmungen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldLookup(r, 'entscheidungsregel')?.label,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
      terminvorschlaege: r => ({
        id: r.id,
        title: slotText(r),
        status: fieldLookup(r, 'eignung') ?? undefined,
        stats: [
          { label: tx('Ja'), value: fieldNumber(r, 'anzahl_ja') ?? 0 },
          { label: tx('Wenn nötig'), value: fieldNumber(r, 'anzahl_wenn_noetig') ?? 0 },
          { label: tx('Nein'), value: fieldNumber(r, 'anzahl_nein') ?? 0 },
          { label: tx('Ohne Antwort'), value: fieldNumber(r, 'anzahl_ohne_antwort') ?? 0 },
        ],
      }),
    },
  });

  const abstimmungPick = flow.pick('terminabstimmungen');
  const vorschlagPick = flow.pick('terminvorschlaege');
  const aId = (abstimmungPick.selectedId as string | null | undefined) ?? null;
  const vId = (vorschlagPick.selectedId as string | null | undefined) ?? null;

  const abstimmung = aId ? flow.picks.terminabstimmungen.recordOf(aId) : undefined;
  const allVorschlaege = flow.picks.terminvorschlaege.records;
  const vorschlaege = useMemo(
    () => (aId ? allVorschlaege.filter(r => fieldRef(r, 'terminabstimmung') === aId) : []),
    [allVorschlaege, aId],
  );
  const vorschlagItems = useMemo(() => {
    const ids = new Set(vorschlaege.map(r => r.id));
    return flow.picks.terminvorschlaege.select.items.filter(i => ids.has(i.id));
  }, [vorschlaege, flow.picks.terminvorschlaege.select.items]);
  const vorschlag = vId ? vorschlaege.find(r => r.id === vId) : undefined;

  const port = flow.port;
  useEffect(() => {
    if (!aId || !vId) return;
    let alive = true;
    setPeople(p => ({ ...p, loading: true, error: null }));
    Promise.all([
      port.list('teilnehmer', { filter: refFilter('terminabstimmung', aId), limit: 500 }),
      port.list('rueckmeldungen', { filter: refFilter('terminvorschlag', vId), limit: 500 }),
    ])
      .then(([teilnehmer, antworten]) => {
        if (alive) setPeople({ loading: false, error: null, teilnehmer, antworten });
      })
      .catch(e => {
        if (alive) setPeople({ loading: false, error: e instanceof Error ? e.message : String(e), teilnehmer: [], antworten: [] });
      });
    return () => {
      alive = false;
    };
  }, [port, aId, vId]);

  const problems = useMemo(() => {
    const answerOf = new Map<string, string>();
    for (const a of people.antworten) {
      const t = fieldRef(a, 'teilnehmer');
      const v = fieldLookup(a, 'verfuegbarkeit')?.key;
      if (t && v) answerOf.set(t, v);
    }
    return people.teilnehmer
      .filter(t => t.fields.vollstaendig_abgesagt !== true)
      .map(t => ({ t, answer: answerOf.get(t.id) }))
      .filter(x => x.answer === undefined || x.answer === 'nein')
      .map(x => ({
        id: x.t.id,
        name: `${fieldText(x.t, 'vorname')} ${fieldText(x.t, 'nachname')}`.trim(),
        rolle: fieldLookup(x.t, 'rolle')?.label ?? '',
        pflicht: fieldLookup(x.t, 'rolle')?.key === 'pflichtteilnehmer',
        nein: x.answer === 'nein',
      }));
  }, [people]);

  const acked = vId !== null && ackFor === vId;

  const checkSingleFinal = (): string | undefined => {
    if (!vorschlag) return tx('Bitte wähle einen Terminvorschlag dieser Abstimmung.');
    const other = vorschlaege.find(r => r.id !== vorschlag.id && r.fields.final_gewaehlt === true);
    if (other) return tx('Pro Abstimmung kann nur ein Termin final gewählt sein.');
    return undefined;
  };

  const result = flow.submit.result;
  const written = result ? Object.values(result.records).find(r => 'festgelegt_am' in r.fields || 'status' in r.fields && 'entscheidungsregel' in r.fields) : undefined;
  const facts = written
    ? [
        { label: tx('Status'), value: fieldLookup(written, 'status')?.label ?? tx('Festgelegt') },
        { label: tx('Festgelegt am'), value: dateText(fieldDate(written, 'festgelegt_am')) || '—' },
      ]
    : undefined;

  return (
    <IntentWizardShell
      title={tx('Termin festlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Wähle einen Terminvorschlag aus der Auswertung und lege ihn verbindlich fest.'),
        needs: [tx('Eine Abstimmung mit Rückmeldungen')],
      }}
    >
      <WizardStep label={tx('Abstimmung')} description={tx('Wähle die Abstimmung und sieh dir die Auswertung der Terminvorschläge an.')}>
        <div className="space-y-4">
          <EntitySelectStep
            {...flow.picks.terminabstimmungen.select}
            {...abstimmungPick}
            searchPlaceholder={tx('Titel der Abstimmung …')}
          />
          {aId && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {abstimmung
                  ? tx`Auswertung · ${fieldText(abstimmung, 'titel')}`
                  : tx('Auswertung')}
              </h3>
              {vorschlaege.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tx('Für diese Abstimmung gibt es noch keine Terminvorschläge.')}</p>
              ) : (
                <div className="grid gap-2">
                  {vorschlaege.map(r => {
                    const eignung = fieldLookup(r, 'eignung');
                    return (
                      <div key={r.id} className="min-w-0 overflow-hidden rounded-xl border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium">{slotText(r)}</span>
                          {eignung && <StatusBadge statusKey={eignung.key} label={eignung.label} />}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-5">
                          <span>{tx`Ja: ${fieldNumber(r, 'anzahl_ja') ?? 0}`}</span>
                          <span>{tx`Wenn nötig: ${fieldNumber(r, 'anzahl_wenn_noetig') ?? 0}`}</span>
                          <span>{tx`Nein: ${fieldNumber(r, 'anzahl_nein') ?? 0}`}</span>
                          <span>{tx`Ohne Antwort: ${fieldNumber(r, 'anzahl_ohne_antwort') ?? 0}`}</span>
                          <span>{tx`Pflicht Ja: ${fieldNumber(r, 'anzahl_pflicht_ja') ?? 0}`}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <StepNav
            hideBack
            onNext={() => (aId ? true : tx('Bitte wähle eine Abstimmung.'))}
            nextStepLabel={tx('Terminvorschlag')}
          />
        </div>
      </WizardStep>

      <WizardStep
        label={tx('Terminvorschlag')}
        description={tx('Welcher Termin soll verbindlich gelten?')}
        needs={['terminabstimmungen']}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {abstimmung
              ? tx`${fieldText(abstimmung, 'titel')} — ${vorschlaege.length} Terminvorschläge zur Auswahl`
              : tx('Wähle zuerst im vorherigen Schritt eine Abstimmung.')}
          </p>
          <EntitySelectStep
            {...flow.picks.terminvorschlaege.select}
            {...vorschlagPick}
            items={vorschlagItems}
            onSearch={undefined}
            avatar="none"
            emptyText={tx('Für diese Abstimmung gibt es keine Terminvorschläge.')}
          />
          <StepNav
            onBack={() => setStep(1)}
            onNext={checkSingleFinal}
            nextStepLabel={tx('Rückmeldungen prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep
        label={tx('Rückmeldungen')}
        description={tx('Diese Teilnehmer haben für den Termin abgesagt oder noch nicht geantwortet.')}
        needs={['terminabstimmungen', 'terminvorschlaege']}
      >
        <div className="space-y-4">
          {people.loading ? (
            <p className="text-sm text-muted-foreground">{tx('Rückmeldungen werden geladen …')}</p>
          ) : people.error ? (
            <p className="text-sm text-destructive">{people.error}</p>
          ) : problems.length === 0 ? (
            <p className="rounded-xl border bg-card p-3 text-sm">{tx('Alle Teilnehmer können an diesem Termin teilnehmen.')}</p>
          ) : (
            <>
              <ul className="grid gap-2">
                {problems.map(p => (
                  <li key={p.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 overflow-hidden rounded-xl border bg-card p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.rolle}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {p.pflicht && <StatusBadge statusKey="pflichtteilnehmer" label={tx('Pflichtteilnehmer')} tone="warning" />}
                      <StatusBadge
                        statusKey={p.nein ? 'nein' : 'offen'}
                        label={p.nein ? tx('Nein') : tx('Ohne Rückmeldung')}
                        tone={p.nein ? 'danger' : 'neutral'}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 text-sm">
                <Checkbox
                  checked={acked}
                  onCheckedChange={c => setAckFor(c === true ? vId : null)}
                  className="mt-0.5"
                />
                <span>
                  {tx('Ich weiß, dass diese Teilnehmer nicht zugesagt haben, und lege den Termin trotzdem fest.')}
                </span>
              </label>
            </>
          )}
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => {
              if (people.loading) return tx('Die Rückmeldungen werden noch geladen.');
              if (people.error) return tx('Die Rückmeldungen konnten nicht geladen werden.');
              if (problems.length > 0 && !acked) return tx('Bitte bestätige, dass du den Termin trotzdem festlegen willst.');
              return true;
            }}
            nextStepLabel={tx('Kommentar')}
          />
        </div>
      </WizardStep>

      <WizardStep
        label={tx('Kommentar')}
        description={tx('Optional: Begründe kurz, warum dieser Termin gewählt wurde.')}
        needs={['terminvorschlaege']}
      >
        <div className="space-y-4">
          <Bound form={flow.forms.terminabstimmungen} name="entscheidungskommentar" rows={4} />
          <StepNav
            onBack={() => setStep(3)}
            onNext={() => flow.validateStep(4)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Festlegen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[
              ...(vorschlag ? [{ key: 'termin', label: tx('Gewählter Termin'), value: slotText(vorschlag) }] : []),
              { key: 'status', label: tx('Neuer Status'), value: tx('Festgelegt') },
            ]}
            confirmLabel={tx('Termin festlegen')}
            whatHappensNext={tx('Der Termin wird als final markiert und die Abstimmung gilt ab jetzt als festgelegt.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          submit={flow.submit}
          forms={facts ? undefined : flow.formList}
          facts={facts}
          next={[
            { label: tx('Alternative Termine prüfen'), href: '#/intents/alternativen-pruefen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Abstimmung ist festgelegt. Prüfe bei Bedarf eingegangene Terminalternativen.')}
        />
      )}
    </IntentWizardShell>
  );
}
