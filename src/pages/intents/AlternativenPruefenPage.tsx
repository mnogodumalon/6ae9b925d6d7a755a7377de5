/**
 * Alternative Termine prüfen — 3-Schritt-Wizard.
 * Steps: 1) Alternativvorschlag einer Abstimmung wählen → 2) Übernehmen oder ablehnen → 3) Bei Übernahme Terminvorschlag anlegen → Prüfen & speichern.
 * Reads: alternative_terminvorschlaege, terminabstimmungen (via flow hook).
 * Writes: alternative_terminvorschlaege (status, update), terminvorschlaege (create, nur bei Übernahme).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldLookup } from '@/lib/journey';
import { useAlternativenPruefenFlow } from '@/lib/journey/flows/AlternativenPruefen';
import { tx } from '@/i18n';

function show(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy HH:mm');
  } catch {
    return iso;
  }
}

export default function AlternativenPruefenPage() {
  const [step, setStep] = useState(1);
  const flow = useAlternativenPruefenFlow({
    initial: { status: 'uebernommen' },
    steps: { alternative_terminvorschlaege: 1, status: 2, terminabstimmung: 3, start: 3, ende: 3, reihenfolge: 3 },
    items: {
      alternative_terminvorschlaege: (r, ctx) => ({
        id: r.id,
        title: `${show(fieldDate(r, 'start'))} – ${show(fieldDate(r, 'ende'))}`,
        subtitle: [ctx.ref('vorgeschlagen_von'), fieldText(r, 'kommentar')].filter(Boolean).join(' · '),
      }),
      terminabstimmung: r => ({ id: r.id, title: fieldText(r, 'titel') || fieldText(r, 'abstimmungsnummer'), subtitle: fieldText(r, 'abstimmungsnummer') }),
    },
  });

  const alt = flow.forms.alternative_terminvorschlaege;
  const vorschlag = flow.forms.terminvorschlaege;
  const altPick = flow.pick('alternative_terminvorschlaege');
  const target = flow.targets.alternative_terminvorschlaege?.record;
  const accepted = fieldLookupKey(alt.get('status')) === 'uebernommen';

  const pickAlternative = (id: string) => {
    altPick.onSelect(id);
    const rec = flow.picks.alternative_terminvorschlaege.recordOf(id);
    if (rec) {
      const s = fieldDate(rec, 'start');
      const e = fieldDate(rec, 'ende');
      if (s) vorschlag.set('start', s.slice(0, 16));
      if (e) vorschlag.set('ende', e.slice(0, 16));
    }
  };

  const checkStep3 = (): boolean | string => {
    if (!accepted) return true;
    if (!flow.validateStep(3)) return false;
    const s = String(vorschlag.get('start') ?? '');
    const e = String(vorschlag.get('ende') ?? '');
    if (s && e && e <= s) return tx('Das Ende muss nach dem Start liegen.');
    return true;
  };

  return (
    <IntentWizardShell
      title={tx('Alternative Termine prüfen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Vorgeschlagene Alternativtermine übernehmen oder ablehnen.'),
        needs: [tx('Eine Abstimmung mit neuen Alternativvorschlägen')],
      }}
    >
      <WizardStep label={tx('Alternative')} description={tx('Welchen Alternativvorschlag möchtest du prüfen?')}>
        <EntitySelectStep
          {...flow.picks.alternative_terminvorschlaege.select}
          {...altPick}
          onSelect={pickAlternative}
          searchPlaceholder={tx('Vorschlag suchen …')}
        />
      </WizardStep>

      <WizardStep label={tx('Entscheidung')} description={tx('Übernimmst du den Vorschlag oder lehnst du ihn ab?')} needs={['alternative_terminvorschlaege']}>
        <div className="space-y-4">
          {target && (
            <div className="rounded-2xl border bg-card p-4 space-y-1 overflow-hidden">
              <p className="font-medium">
                {show(fieldDate(target, 'start'))} – {show(fieldDate(target, 'ende'))}
              </p>
              {fieldText(target, 'kommentar') && <p className="text-sm text-muted-foreground">{fieldText(target, 'kommentar')}</p>}
              <p className="text-xs text-muted-foreground">
                {tx('Aktueller Status')}: {fieldLookup(target, 'status')?.label ?? '—'}
              </p>
            </div>
          )}
          <Bound form={alt} name="status" />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={accepted ? tx('Terminvorschlag') : tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Terminvorschlag')} description={tx('Bei Übernahme wird daraus ein Terminvorschlag der Abstimmung.')} needs={['status']}>
        <div className="space-y-4">
          {!accepted && (
            <p className="text-sm text-muted-foreground">{tx('Bei Ablehnung kannst du diesen Schritt überspringen.')}</p>
          )}
          <EntitySelectStep
            {...flow.picks.terminabstimmung.select}
            {...flow.pick('terminabstimmung')}
            searchPlaceholder={tx('Abstimmung suchen …')}
          />
          <Bound form={vorschlag} name="start" />
          <Bound form={vorschlag} name="ende" />
          <Bound form={vorschlag} name="reihenfolge" hint={tx('Position in der Liste der Terminvorschläge, z. B. 1')} />
          <StepNav onBack={() => setStep(2)} onNext={checkStep3} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Der Status des Vorschlags wird gespeichert; bei Übernahme erscheint der neue Terminvorschlag in der Abstimmung.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[
            { label: tx('Termin verbindlich festlegen'), href: '#/intents/termin-festlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}

function fieldLookupKey(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'key' in v) return String((v as { key: unknown }).key);
  return null;
}
